# Data model

Canonical home for every new entity: fields, types, nullability, grain, keys, relationships,
provenance, lifecycle, storage representation and namespace isolation. Other documents reference
tables by name and do not redefine fields. Storage decisions are DEC-02/DEC-03/DEC-04 in
[DECISIONS.md](DECISIONS.md).

Type vocabulary: SQLite column affinities are given as `TEXT`, `INTEGER`, `REAL`, `BLOB`; Parquet
types follow `backend/app/data/schemas.py` (`I64, F64, STR, BOOL, DATE, TS`). `ms` means integer
milliseconds. Ids for mutable rows are ULIDs (`TEXT`, 26 chars, time-ordered, generated server
side) so evidence ids are stable and sortable; provider ids keep provider types.

## 1. Storage map and authority

| Entity | Store | Authoritative | Read model / export |
| --- | --- | --- | --- |
| games, events, event_participants, event_id_map | Parquet family (namespace layout) | Parquet (immutable per ingest; re-ingest replaces the file) | DuckDB view |
| possessions, lineup_stints (Phase F) | Parquet family | Parquet derived from events with `parser_version` | DuckDB view |
| video_assets, video_derivatives, source_permissions | SQLite | SQLite | none |
| video_segments, event_video_links, alignment_anchors | SQLite | SQLite | `evidence_snapshots` Parquet |
| annotations, annotation_revisions | SQLite (append-only revisions) | SQLite | `annotation_snapshots` Parquet |
| tracks, identity_assignments, court_calibrations, video_features | SQLite rows + per-track Parquet/JSON files under `media/derived/` | SQLite row (metadata) + file (payload, content hashed) | optional snapshot |
| evidence_items | SQLite | SQLite | `evidence_snapshots` |
| role_templates | Python registry (`scouting/roles.py`, versioned) + SQLite for user-defined templates | code for built-ins, SQLite for custom | API |
| scouting_profile_snapshots | SQLite (JSON payload) | SQLite | none |
| shortlists, shortlist_entries, reports, report_claims | SQLite | SQLite | export to Markdown/JSON on request |
| processing_jobs, job_events, worker_lock | SQLite | SQLite | `/api/jobs` |
| copilot_sessions, copilot_messages, tool_calls | SQLite | SQLite | `/api/copilot` |
| capability log | `data/<namespace>/capability_log.jsonl` | file | PROGRESS.md summary |

Rule: a snapshot is regenerated from SQLite, never edited; a SQLite row is never derived from a
snapshot. Every snapshot file name carries `snapshot_version` and the manifest records it.

## 2. Common columns

All SQLite tables carry:

| Column | Type | Notes |
| --- | --- | --- |
| `namespace` | TEXT NOT NULL | `nba` or `demo`; equals the file's namespace; checked by every repository function |
| `created_at`, `updated_at` | TEXT NOT NULL (ISO-8601 UTC) | `updated_at` maintained by the repository layer |
| `created_by` | TEXT NULL | `user`, `worker:<kind>`, `agent:<session_id>`, `import:<source>` |

Provenance columns appear where a row is derived from a source: `source` (TEXT), `source_ref`
(TEXT, e.g. endpoint + params hash, file hash, model id), `schema_version` (INTEGER), and where
applicable `model_version`, `parser_version`, `normalizer_version`.

Review columns (`review_status`) use the vocabulary `unreviewed | reviewed_ok | reviewed_corrected |
rejected`, with `reviewed_by`, `reviewed_at`.

## 3. Game and event layer (Parquet families)

### `games` (grain: one row per game)

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `game_id` | STR | no | provider id with leading zeros, e.g. `0022400001` |
| `season`, `season_type` | STR | no | as other families |
| `game_date` | DATE | no | |
| `home_team_id`, `away_team_id` | I64 | no | |
| `home_score`, `away_score` | I64 | yes | final; null for incomplete |
| `status` | STR | no | `final | in_progress | scheduled` |
| `periods` | I64 | yes | 4 + overtimes |
| `attendance`, `arena` | I64 / STR | yes | if the source has them |
| `source`, `source_endpoint`, `fetched_at` | STR / STR / TS | no | e.g. `leaguegamefinder` or derived from `team_game_logs` |

Phase A derives `games` from the already ingested `team_game_logs` (two rows per game) so the
family exists without a new endpoint; `leaguegamefinder` is a candidate enrichment (DEC-07).

### `events` (grain: one row per provider play-by-play action)

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `game_id` | STR | no | |
| `source_event_system` | STR | no | `pbp_v3` (canonical) or `pbp_v2` when only v2 is retrievable |
| `source_event_id` | I64 | no | `actionNumber` (v3) or `EVENTNUM` (v2) |
| `source_order` | I64 | no | 0-based position in the response; preserves source order even when ids are non-monotonic |
| `period` | I64 | no | |
| `clock_ms` | I64 | yes | remaining game clock in ms parsed from `clock` (`PT11M22.00S`) or `PCTIMESTRING`; null if unparseable |
| `wall_clock` | STR | yes | v2 `WCTIMESTRING` verbatim |
| `action_type`, `sub_type` | STR | yes | provider strings verbatim (v3) or mapped `EVENTMSGTYPE/EVENTMSGACTIONTYPE` codes stored as `code:<n>` |
| `description` | STR | yes | verbatim |
| `team_id` | I64 | yes | |
| `person_id` | I64 | yes | primary actor; null when not supported by source |
| `is_field_goal` | BOOL | yes | |
| `shot_result` | STR | yes | `Made | Missed` verbatim |
| `x_legacy`, `y_legacy`, `shot_distance` | I64 | yes | v3 legacy coordinates (expected to match shots `loc_x/loc_y`; verify in A-03) |
| `score_home`, `score_away` | I64 | yes | |
| `video_available` | BOOL | yes | provider flag, **not** a permission |
| `action_id` | I64 | yes | v3 `actionId` |
| `raw_json` | STR | no | the source row as JSON (small; keeps every unmapped column) |
| `normalizer_version` | I64 | no | |
| `season`, `season_type`, `source`, `fetched_at` | | | as other families |

Canonical key: `(namespace, source_event_system, game_id, source_event_id)`. Duplicates in the
source (same id twice) are kept with distinct `source_order` and flagged in `event_participants`
with `duplicate_of`.

### `event_participants` (grain: one row per event × participant role)

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `game_id`, `source_event_system`, `source_event_id` | | no | FK to events |
| `role` | STR | no | `actor | assist | blocker | stealer | fouled | substituted_in | substituted_out | jumper | tipped_to | unknown` |
| `person_id` | I64 | no | |
| `team_id` | I64 | yes | |
| `source_slot` | STR | no | `PLAYER1|PLAYER2|PLAYER3` (v2) or `personId` (v3) |
| `duplicate_of` | I64 | yes | `source_order` of the earlier identical event |

Only participants present in the source are recorded; defenders and lineups are never inferred here
(matchups and lineups are season aggregates and cannot identify a clip's defender).

### `event_id_map` (grain: one row per verified correspondence)

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `game_id` | STR | no | |
| `pbp_v3_action_number` | I64 | yes | |
| `pbp_v2_eventnum` | I64 | yes | |
| `shots_game_event_id` | I64 | yes | |
| `method` | STR | no | `equal_ids | matched_on_clock_player_result | manual` |
| `confidence` | STR | no | `exact | probable | ambiguous` (categorical, not a probability) |
| `verified_at`, `verifier` | TS / STR | no | |

Readers must join shots to events through this table (or through an `equal_ids` rule only after A-04
reports agreement on the pilot sample and records it in PROGRESS.md).

### `possessions`, `lineup_stints` (Phase F; schema reserved)

`possessions`: `game_id, possession_index, period, start_clock_ms, end_clock_ms, offense_team_id,
start_event_order, end_event_order, start_reason, end_reason, points, parser_version, coverage_flag
(complete|uncertain|unknown_interval)`. `lineup_stints`: `game_id, team_id, period,
start_clock_ms, end_clock_ms, player_ids (list), source (gamerotation|pbp_substitutions|mixed),
confidence (exact|inferred), parser_version`. Rules in [VIDEO_PIPELINE.md](VIDEO_PIPELINE.md) §11.

## 4. Media registry (SQLite)

### `video_assets`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `asset_id` | TEXT PK | | ULID |
| `kind` | TEXT | no | `managed_original` or `external_reference` |
| `sha256` | TEXT | yes | required for managed; UNIQUE per namespace -> deduplication |
| `storage_key` | TEXT | yes | `originals/ab/abcdef....mp4`, relative to `media/`; never a client path |
| `original_filename` | TEXT | yes | display only, sanitised |
| `byte_size` | INTEGER | yes | |
| `container`, `video_codec`, `audio_codec` | TEXT | yes | from ffprobe |
| `duration_ms` | INTEGER | yes | |
| `width`, `height` | INTEGER | yes | |
| `frame_rate_num`, `frame_rate_den` | INTEGER | yes | exact rational |
| `time_base_num`, `time_base_den` | INTEGER | yes | stream time base |
| `variable_frame_rate` | INTEGER (bool) | yes | detected by ffprobe frame sampling |
| `probe_json` | TEXT | yes | full ffprobe output |
| `processing_version` | INTEGER | no | version of the derivative pipeline that last ran |
| `status` | TEXT | no | `registered | probed | ready | failed | deleted` |
| `external_url` | TEXT | yes | for `external_reference`: provider page reference, opened in a new tab |
| `external_provider` | TEXT | yes | `nba_stats_events` etc. |
| `availability` | TEXT | no | `available | unavailable | unverified | stale` |
| `availability_checked_at` | TEXT | yes | |
| `deleted_at` | TEXT | yes | soft delete; file removal is a job after a retention window |
| common + provenance columns | | | `source` = `upload | adapter:<name>`; `source_ref` = permission id or adapter ref |

Indexes: `(namespace, sha256)` unique where not null; `(namespace, status)`.

### `source_permissions`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `permission_id` | TEXT PK | | |
| `asset_id` | TEXT FK | no | |
| `source` | TEXT | no | `user_upload | licensed_provider:<name> | external_reference` |
| `authorization_ref` | TEXT | yes | free text: licence id, email, "owner's own recording" |
| `allowed_operations` | TEXT (JSON array) | no | subset of `view, playback_derivative, thumbnail, cv_processing, redistribute, external_model` |
| `permission_status` | TEXT | no | `known | unknown` |
| `expires_at` | TEXT | yes | |
| `notes` | TEXT | yes | |

Rule: `permission_status = unknown` or an operation absent from `allowed_operations` means the
operation is refused by the job handler and the API (`403` with reason). Unknown never implies yes.

### `video_derivatives`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `derivative_id` | TEXT PK | | |
| `asset_id` | TEXT FK | no | |
| `kind` | TEXT | no | `playback_mp4 | thumbnail_sheet | thumbnail | proxy_low` |
| `storage_key` | TEXT | no | `derived/<asset_id>/<processing_version>/...` |
| `processing_version` | INTEGER | no | |
| `params_json` | TEXT | no | ffmpeg settings used |
| `byte_size`, `width`, `height`, `duration_ms` | | yes | |
| `sha256` | TEXT | no | |
| `job_id` | TEXT FK | no | |

Unique `(asset_id, kind, processing_version, params_hash)`.

## 5. Segments, links and alignment (SQLite)

### `video_segments`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `segment_id` | TEXT PK | | stable evidence anchor |
| `asset_id` | TEXT FK | no | |
| `media_start_ms`, `media_end_ms` | INTEGER | no | presentation timestamps of the asset; `end > start` |
| `classification` | TEXT | no | `live | replay | unknown | non_game` |
| `view` | TEXT | yes | `broadcast | baseline | overhead | handheld | unknown` |
| `origin` | TEXT | no | `manual | shot_boundary_model | provider_clip | import` |
| `model_version` | TEXT | yes | when `origin` is a model |
| `review_status` + review columns | | | |
| `notes` | TEXT | yes | |

Index `(asset_id, media_start_ms)`.

### `event_video_links`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `link_id` | TEXT PK | | |
| `game_id`, `source_event_system`, `source_event_id` | TEXT/TEXT/INTEGER | no | event key (events live in Parquet; integrity checked by the repository, not by SQLite FK) |
| `asset_id` | TEXT FK | no | may be an `external_reference` asset |
| `segment_id` | TEXT FK | yes | null for external references without timing |
| `media_start_ms`, `media_end_ms` | INTEGER | yes | event window within the asset when known |
| `alignment_method` | TEXT | no | `provider_metadata | manual | ocr_assisted | interpolated | none` |
| `timing_error_ms` | INTEGER | yes | measured or estimated; null = unknown |
| `supporting_anchor_ids` | TEXT (JSON array) | yes | anchors used |
| `link_status` | TEXT | no | `available | unavailable | unverified | stale | superseded` |
| `review_status` + review columns | | | |

Unique `(event key, asset_id, segment_id)`. One event may have several links (different views,
replays); one segment may cover several events.

### `alignment_anchors`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `anchor_id` | TEXT PK | | |
| `asset_id` | TEXT FK | no | |
| `media_pts_ms` | INTEGER | no | |
| `period` | INTEGER | no | |
| `clock_ms` | INTEGER | no | game clock remaining at that frame |
| `method` | TEXT | no | `manual | ocr_assisted | provider_metadata | cv_shot_release` |
| `error_ms` | INTEGER | yes | estimated uncertainty of the anchor |
| `segment_id` | TEXT FK | yes | the live segment this anchor belongs to |
| `review_status` + review columns | | | |

Validity rules in [VIDEO_PIPELINE.md](VIDEO_PIPELINE.md) §6 (no interpolation across segments or
periods; clock must decrease as media time increases within a live segment).

## 6. Annotations (SQLite)

### `annotations` (current head of each annotation)

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `annotation_id` | TEXT PK | | stable; revisions share it |
| `segment_id` | TEXT FK | no | |
| `media_start_ms`, `media_end_ms` | INTEGER | no | within the segment |
| `subject_player_id` | INTEGER | yes | only when identity is verified or asserted by the labeler; null = unknown |
| `subject_identity_status` | TEXT | no | `verified | asserted | unknown` |
| `action` | TEXT | no | key from the vocabulary (`vocab_version`), includes `unknown`, `not_observable` |
| `vocab_version` | INTEGER | no | |
| `outcome` | TEXT | yes | observable outcome key from the vocabulary |
| `participants_json` | TEXT | yes | `[{"role": "screener", "player_id": null, "identity_status": "unknown"}]` |
| `visibility` | TEXT | no | `full | partial | obstructed | off_frame` |
| `label_source` | TEXT | no | `human | model:<name>@<version> | import:<source>` |
| `confidence_raw` | REAL | yes | model raw score; **uncalibrated**; UI never labels it a probability |
| `sampling_method` | TEXT | no | `complete_event_set | systematic_sample | random_sample | curated | provider_selected` |
| `event_key_json` | TEXT | yes | linked event key when the annotation is about a provider event |
| `notes` | TEXT | yes | untrusted free text (never fed to the agent as instructions) |
| `supporting_timestamps_json` | TEXT | yes | `[ms, ...]` |
| `review_status` + review columns | | | |
| `superseded_by` | TEXT | yes | annotation id when replaced rather than revised |
| `revision` | INTEGER | no | current revision number |

### `annotation_revisions` (append-only)

Full copy of the annotation row at every save (`snapshot_json`), plus `revision`, `changed_by`,
`changed_at`, `change_reason`, `diff_json` (`{field: {from, to}}`). Primary key `(annotation_id, revision)`.
Deleting an annotation is a revision that sets `deleted_at` on the head row; the `action` is kept so the
history stays readable. Never a physical delete while any `evidence_items` or `report_claims` reference it.

Implementation notes (B-07, 2026-10-09): the head table also carries a denormalised `game_id` (from
`event_key_json`) for filtering, and `annotations_fts` (FTS5 over `notes`, `porter unicode61`) is maintained
by the repository on every save rather than by triggers. The API returns `notes` as
`{"content": ..., "trust": "untrusted_free_text"}`.

## 7. Tracking, identity, calibration, features (SQLite rows + files)

### `tracks`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `track_row_id` | TEXT PK | | |
| `tracking_context_id` | TEXT | no | `<asset_id>:<segment_id>:<model>@<version>:<run>` |
| `track_id` | INTEGER | no | local to the context; **not** a player id |
| `segment_id` | TEXT FK | no | |
| `first_ms`, `last_ms` | INTEGER | no | |
| `n_detections` | INTEGER | no | |
| `payload_key` | TEXT | no | Parquet file under `derived/<asset>/<version>/tracks/` with per-frame boxes (`frame_ms, x, y, w, h, score`) |
| `payload_sha256` | TEXT | no | |
| `model_version` | TEXT | no | |

Unique `(tracking_context_id, track_id)`.

### `identity_assignments`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `assignment_id` | TEXT PK | | |
| `track_row_id` | TEXT FK | no | |
| `player_id` | INTEGER | yes | null = unknown |
| `method` | TEXT | no | `manual | jersey_ocr | roster_constraint | model:<name>` |
| `confidence_raw` | REAL | yes | uncalibrated |
| `review_status` + review columns | | | only `reviewed_ok` assignments count as verified identity |
| `superseded_by` | TEXT | yes | |

### `court_calibrations`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `calibration_id` | TEXT PK | | |
| `asset_id`, `segment_id` | FK | no / yes | |
| `valid_from_ms`, `valid_to_ms` | INTEGER | no | camera cuts invalidate a calibration |
| `homography_json` | TEXT | no | 3×3 image -> court-plane matrix |
| `court_frame` | TEXT | no | `full_court_v1` (see VIDEO_PIPELINE §10 for units/orientation) |
| `attacking_direction` | TEXT | yes | `left_to_right | right_to_left | unknown` for the segment |
| `landmarks_json` | TEXT | no | image points and court points used |
| `reprojection_error_px` | REAL | yes | |
| `method` | TEXT | no | `manual_landmarks | model:<name>` |
| `review_status` + review columns | | | |

### `video_features`

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `feature_id` | TEXT PK | | |
| `scope_type`, `scope_id` | TEXT | no | `segment | track | event_link | annotation` |
| `feature_key` | TEXT | no | e.g. `shot_release_ms`, `closeout_distance_ft_experimental` |
| `value_num`, `value_text`, `value_json` | | yes | one populated |
| `units` | TEXT | yes | |
| `model_version`, `calibration_id` | TEXT | yes | |
| `status` | TEXT | no | `experimental | validated` (promotion gates in CV_ROADMAP §8) |
| `review_status` | | | |

Vision-derived features never overwrite provider columns and are not available as shot filters until
`validated`.

## 8. Evidence items (SQLite)

`evidence_items` is the single citation target for reports and the copilot.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `evidence_id` | TEXT PK | | ULID, stable; the string cited in reports |
| `kind` | TEXT | no | `video_segment | annotation | external_reference | statistic | model_estimate` |
| `ref_table`, `ref_id` | TEXT | no | polymorphic pointer |
| `player_ids_json` | TEXT | yes | players the item is about |
| `game_id`, `season`, `season_type` | TEXT | yes | |
| `summary` | TEXT | no | short deterministic description generated at creation |
| `evidence_class` | TEXT | no | `statistical | reviewed_observation | model_estimate | interpretation | reference` (DEC-11; `reference` is used only for `external_reference` items, which point at footage without asserting anything and never feed a trait) |
| `review_status` | TEXT | no | copied from the referent at creation; refreshed by trigger-like repository logic |
| `status` | TEXT | no | `active | stale | superseded | deleted` |
| `superseded_by` | TEXT | yes | |
| `snapshot_version` | INTEGER | yes | last exported snapshot |

Lifecycle: deleting or superseding a referent sets `status` on the evidence item; reports keep the
id and render it with the status badge; the claim validator refuses **new** citations of
`deleted|superseded` items and warns on `stale`.

For `statistic` kind, `ref_id` is a canonical query descriptor hash (metric key + player + season +
season type + cohort + normalisation + thresholds) and `value_json` holds the value and definition
version so a number cited in a report can be re-derived.

## 9. Scouting (SQLite + code registry)

### `role_templates` (built-ins in code, custom in SQLite)

| Column | Type | Notes |
| --- | --- | --- |
| `role_id` | TEXT PK | `low_usage_perimeter_shooter` ... or ULID for custom |
| `version` | INTEGER | built-ins bump on any change |
| `label`, `description` | TEXT | |
| `components_json` | TEXT | `[{"trait_key","weight","higher_is_better"}]`, statistical traits only |
| `filters_json` | TEXT | `{"min_gp","min_minutes","position","usg_pct_max", ...}` |
| `optional_video_traits_json` | TEXT | shown beside the ranking, never weighted |
| `caveats_json` | TEXT | |
| `is_builtin` | INTEGER (bool) | |

### `scouting_profile_snapshots`

| Column | Type | Notes |
| --- | --- | --- |
| `snapshot_id` | TEXT PK | |
| `player_id`, `season`, `season_type` | | |
| `cohort_json` | TEXT | population filters and size |
| `traits_json` | TEXT | list of trait records (PROFILES_AND_RANKING §3 shape) |
| `evidence_ids_json` | TEXT | |
| `trait_registry_version`, `snapshot_version` | INTEGER | |
| `data_fingerprint` | TEXT | hash of manifest entries used, so a snapshot can be marked stale when data changes |

### `shortlists`, `shortlist_entries`

`shortlists(shortlist_id PK, label, role_id, role_version, season, season_type, filters_json,
ranking_meta_json, notes)`; `shortlist_entries(shortlist_id FK, player_id, rank, score,
eligible, missing_json, contributions_json, added_by, pinned, note)`, unique `(shortlist_id,
player_id)`.

### `reports`, `report_claims`

`reports(report_id PK, shortlist_id FK NULL, title, status draft|final, sections_json, llm_mode
none|fixture|anthropic, model_id, generated_by, rendered_markdown)`;
`report_claims(claim_id PK, report_id FK, order_index, claim_text, claim_type
statistical|reviewed_observation|model_estimate|interpretation|limitation, player_ids_json,
time_scope_json, evidence_ids_json, numeric_refs_json, limitations_json, counterevidence_ids_json,
validation_status valid|downgraded|dropped, validation_notes)`.

## 10. Copilot (SQLite)

`copilot_sessions(session_id PK, shortlist_id NULL, mode, model_id, budget_json, status
open|closed|cancelled, totals_json)`; `copilot_messages(message_id PK, session_id FK, role
user|assistant|tool, content_json, created_at)`; `tool_calls(tool_call_id PK, session_id FK,
message_id FK, tool_name, args_json, result_digest, result_rows, duration_ms, status
ok|error|refused, error)`. Tool results are stored as digests plus a bounded sample, never the full
payload.

## 11. Jobs (SQLite)

`processing_jobs(job_id PK, kind, idempotency_key UNIQUE, payload_json, status queued|running|
succeeded|failed|cancelled|partial, attempt, max_attempts, next_run_at, locked_by, lease_until,
progress REAL, progress_note, result_json, error, cancel_requested INTEGER, started_at,
finished_at)`; `job_events(event_id PK, job_id FK, at, type, detail_json)`;
`worker_lock(namespace PK, worker_id, heartbeat_at)`.

## 12. Snapshot families (Parquet, exported by a job)

`evidence_snapshots`: `evidence_id, kind, evidence_class, ref_table, ref_id, player_ids (list<int64>),
game_id, season, season_type, review_status, status, superseded_by, summary, snapshot_version, source,
fetched_at` (B-08 added `ref_table`, `ref_id`, `superseded_by` so a snapshot row can be traced back).
`annotation_snapshots`: head-row annotation columns plus `segment_id, asset_id, game_id,
snapshot_version`. Both are written with `write_family()` so the manifest records them; the family
dir holds one file per `snapshot_version` and the DuckDB view unions them; queries filter on the
latest version via `MAX(snapshot_version)`.
File names are `<family>__v<n>.parquet` (`write_family(..., suffix=f"v{n}")`); deleted annotations are
left out of `annotation_snapshots`, while `evidence_snapshots` keeps every item with its status so a
cited id can always be resolved. Seasons come from the `games` (or `events`) family by `game_id`.

## 13. Namespace isolation rules

1. One SQLite file per namespace; the API opens only the active one.
2. Every row still stores `namespace`; repository functions assert equality with the active
   namespace and raise on mismatch (defence against mis-pathed files).
3. Demo media: none by default. If demo media is ever added it must be synthetic (rendered court
   animations) and live under `data/demo/media/`. Real clips are never linked to demo players
   (`player_id >= 9,000,001` is refused by the evidence repository in the `nba` namespace and
   `< 9,000,001` is refused in `demo`).
4. Evidence ids are ULIDs generated per namespace; the API resolves an id only in the active
   namespace (404 otherwise).
5. Client state (active shortlist, copilot session) carries `namespace` and resets on change,
   exactly like `useCompare.syncNamespace`.

## 14. Examples

Event row (v3):
```json
{"game_id":"0022400001","source_event_system":"pbp_v3","source_event_id":7,"source_order":6,
 "period":1,"clock_ms":686000,"action_type":"Made Shot","sub_type":"Jump Shot","person_id":1629029,
 "team_id":1610612738,"is_field_goal":true,"shot_result":"Made","x_legacy":-85,"y_legacy":215,
 "video_available":true,"raw_json":"{...}","normalizer_version":1}
```

Alignment anchors for one asset (two live segments around a replay):
```
anchor  media_pts_ms  period  clock_ms  method   error_ms  segment
a1        12_400        1     711_000   manual     ±120     s1 (live)
a2        98_900        1     604_000   manual     ±120     s1 (live)
      -- s2 = replay 99_000..118_000: no anchors, no interpolation --
a3       118_600        1     601_000   manual     ±120     s3 (live)
```
Interpolating an event at `clock 650_000` in period 1 uses a1–a2 only (same segment, clock
decreasing with media time); an event at `clock 602_000` cannot be placed without a4 after the
replay unless the user accepts `interpolated` with a widened `timing_error_ms`.

Evidence item citing an annotation:
```json
{"evidence_id":"01JXYZ...","kind":"annotation","ref_table":"annotations","ref_id":"01JXAB...",
 "player_ids_json":"[1629029]","game_id":"0022400001","season":"2024-25","season_type":"Regular Season",
 "summary":"Closeout, subject verified, outcome: contested 3PA missed; visibility full; human label",
 "evidence_class":"reviewed_observation","review_status":"reviewed_ok","status":"active"}
```
