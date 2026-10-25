# Progress ledger

The durable status of the scouting extension. Update this file **before ending every session**;
chat context does not survive. Task definitions live in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md);
decisions in [DECISIONS.md](DECISIONS.md).

- **Last updated:** 2026-10-09
- **Current phase:** Phases A and C complete; Phase B implementation complete (B-01…B-09 tested; B-10 protocol written, pilot data pending user time). Next: Phase D. Phase B and Phase C can start; C-01 has no
  dependencies and no new tooling, Phase B needs `brew install ffmpeg` and the worker (B-01, B-02).
- **Exact next task:** **D-01 Provider abstraction, settings, none/fixture providers** (depends on A-01 done):
  `copilot/provider.py` (`LLMProvider`, `Message`, `ToolSchema`, `Completion`), `providers/none.py`,
  `providers/fixture.py` replaying `backend/tests/fixtures/copilot/*.json` with `synthetic: true`, settings
  `SCOUT_LLM_PROVIDER` / `SCOUT_LLM_MODEL` / budgets, capabilities `llm_provider`, key redaction helper.
  Read COPILOT.md first (DEC-12). B-10's pilot labeling is user time and runs in parallel: follow
  `docs/scouting/PILOT.md`, then update the "Pilot data" section below.
- **Footage:** none on disk; sourcing policy is DEC-18 (external references, CC BY-NC research
  datasets, own recordings). `ffmpeg` 9.0.2 and `ffprobe` installed (2026-10-09).

## Status vocabulary

`not started` · `in progress (partial: what exists)` · `blocked (reason)` · `mocked` (interface
exists, fake implementation) · `implemented` (code exists, tests not yet written/passing) ·
`tested` (acceptance tests pass) · `validated` (live/source check or evaluation recorded) · `done`
(= tested, plus validated where the task says so, docs updated).

## Planning tasks

| Task | Status | Evidence |
| --- | --- | --- |
| Repository inspection | done 2026-10-08 | [CURRENT_STATE.md](CURRENT_STATE.md); 253 pytest collected, 135 vitest passed (offline) |
| Planning documents (11) + root CLAUDE.md | done 2026-10-08 | this directory |

## Phase A: Event-linked evidence

| Task | Status | Notes |
| --- | --- | --- |
| A-00 Scouting routes gated when public | partial 2026-10-09 | done: with `PUBLIC_READ_ONLY=1` the scouting, jobs and ingestion routers are not mounted (test in `tests/api/test_read_only.py`), prompted by an automated security review of `main.py`. Not done: the owner-token path that would let the owner use scouting features on the public host |
| A-01 Scouting state foundation | tested 2026-10-08 | `backend/app/state/{connection,migrate,ids}.py`, `migrations/0001_init.sql`, `app/api/capabilities.py`, `/api/meta/capabilities`, `DataLayout.state_db_path`, `get_state_db`; namespace change reopens the file. 17 tests in `tests/state/` + `tests/api/test_capabilities_and_state.py` |
| A-02 `games` family | tested 2026-10-08 | `backend/app/events/games.py` (`derive_games`, `incomplete_game_ids`, `inconsistent_game_ids`), fetcher `fetch_games` in `ingestion/fetchers.py` (kept there to avoid a circular import; plan said `events/fetch_games.py`), schema + `STEP_ORDER` + `REQUIRED_IDS`, demo writes `games` for detail seasons, frontend coverage label. Read-only check on real 2024-25 logs: 2,460 team rows -> 1,230 games, leading zeros kept, 0 inconsistent, 5 neutral-site games (Mexico City, Paris, NBA Cup) flagged `neutral_site`. **Backfill not yet run** (user's ingestion still writing `manifest.json`). |
| A-03 Capability probe + fixtures | validated 2026-10-09 | `backend/app/ingestion/capabilities.py`, CLI `probe-capabilities`, 13 tests; live run for game 0022400061 (12 provider calls incl. gamerotation retries); 6 fixtures recorded with URLs redacted; findings in DECISIONS Q-1..Q-3 and the capability log below. Note: failed calls are not cached, so re-running the probe retries `gamerotation` live each time |
| A-04 events / participants / id map | validated 2026-10-09 | `backend/app/events/{normalize_pbp,id_map,repository}.py`, fetcher `fetch_events` (merges per season), `--game-ids/--games-limit` on CLI, API and manager, demo writes shot-only events, 32 new tests. Live: 12 games of 2024-25 ingested (5,998 actions); id map 2,128/2,128 `exact`. Deviation from plan: events are on demand (never in `all`) and always re-run when requested |
| A-05 External reference adapter + evidence items | validated 2026-10-09 | migration `0002_media_registry.sql` (7 tables), `backend/app/evidence/{models,registry,evidence_items,availability,link_events,cli}.py`, `adapters/{base,nba_stats_events}.py`, `Settings.video_sources` + `media_reference_stale_after_days`, capabilities reports configured sources; 18 tests. Live: 2,128 references/links/evidence items for the 12 ingested 2024-25 games; 12 availability checks -> 12 `available` with clip metadata (no URLs stored); 2,116 still `unverified` (one call each to verify) |
| A-06 Read API | tested 2026-10-09 | routers `games.py`, `events.py`, `evidence.py`, `GET /api/shots/{game}/{event}/evidence`; repository additions (`game`, `games`, `game_coverage`, `game_events_page`, `shot_for_event`), `evidence/read.py`; 15 API tests incl. leading zeros, pagination caps, unmapped shot, cross-namespace 404, demo events. Game-id paths accept `^[0-9A-Z]\d{9}$` because demo ids start with `D` |
| A-07 Frontend (game page, shot evidence, coverage) | tested 2026-10-09 | `/games` list, `/games/:gameId` (header + coverage, paginated event table with period/FG filters in the URL, event detail panel), Shooting lab: clicking a shot row sets `?shot=<game>:<event>` and opens the evidence panel; `ExternalReferenceButton` (opens provider page in a new tab, availability badge, metadata), `EvidenceList`, Data & methods 'Video coverage' section; nav entry 'Games'. 8 vitest + 4 Playwright tests (real-data parts skip when the pilot game is absent). Workflow spec's stale 2019-20 matchup assumption fixed (matchups now ingested from 2017-18) |
| A-08 Hardening + docs | done 2026-10-09 | `tests/isolation/test_namespace_isolation.py` (6 tests: per-namespace state files, evidence invisible across namespaces, games/events do not cross, demo shot resolves its synthetic event, demo/provider ids refused, auto-mode namespace switch swaps everything). Found and fixed: `events_for_shot` assumed `pbp_v3`. Regression results in the validation table |

## Phase B: Evidence review and authorised media

| Task | Status | Notes |
| --- | --- | --- |
| B-01 Media settings, storage, ffmpeg capability | tested 2026-10-09 | `backend/app/evidence/{storage,ffmpeg}.py` (content-addressed keys under `originals/ derived/ incoming/`, path-traversal refusal, atomic streamed writes with size cap and sha256, promotion to content address; ffmpeg/ffprobe detection, bounded runs in their own process group with timeout and cancellation, probe helpers), `DataLayout.media_dir`, `MEDIA_*` settings, capabilities report `ffmpeg.ffprobe` and `media_limits`; 15 tests (ffmpeg-dependent ones skip when absent). **ffmpeg 9.0.2 installed by the user on 2026-10-09** |
| B-02 Durable jobs + worker | tested 2026-10-09 | migration `0007_jobs.sql`, `backend/app/jobs/{models,queue,handlers,publish,runner,worker,inline}.py`, routes `/api/jobs[/{id}[/cancel]]`, capabilities `worker_alive` + `jobs`, `make worker`, `JOBS_*` settings; 21 tests (idempotent enqueue, FIFO claim with leases, heartbeat/progress, retry with jittered backoff, cancel queued/running, lease expiry requeue/fail, worker lock takeover, restart recovery, atomic publish with file rollback, scratch cleanup, inline mode) |
| B-03 Upload + permissions + probe | tested 2026-10-09 | `POST /api/media/uploads` (multipart via `python-multipart`; declared-size 413 before reading, streamed spool with byte cap, extension allowlist, ffprobe sniff -> 415, promotion to `originals/<sha>`, dedupe by sha256 returns the existing asset with 200), `source_permissions` captured per upload (`unknown` when no operations granted), `probe_media` job (duration, dimensions, rational frame rate and time base, codecs, VFR heuristic, limits -> non-retryable failure and asset `failed`), `GET /api/media[/{id}]`, soft `DELETE`; `NonRetryableError` in the runner; 7 tests (ffmpeg-dependent) |
| B-04 Playback derivative + thumbnails + Range | tested 2026-10-09 | handlers `make_playback` (libx264/aac, faststart, `-fps_mode cfr` when VFR; idempotent per version+params) and `make_thumbnails` (JPEG every N s + `index.json`), both published with `atomic_publish` and permission-gated (`playback_derivative`, `thumbnail`); probe chains them when permissions allow; inline runner drains follow-ups; `GET/HEAD /api/media/{id}/playback` (200/206/416, Accept-Ranges), `GET .../thumbs[/{n}]`; `StateDB.transaction` made re-entrant; 14 tests incl. publish rollback with no row and no file |
| B-05 Segments, boundaries, anchors, validation | tested 2026-10-09 | `evidence/segments.py` (bounds, duration, classification checks; proposals unreviewed), `evidence/alignment.py` (anchors assigned to the containing live segment, replay/no-segment refused; `place_event` interpolates only within one segment and period, no extrapolation, stopped clock is a dead zone, error = max(anchor errors) + 30 ms/10 s; `validate_asset` reports monotonic_clock, anchors_in_live_segments, links_within_segments, interpolated_links_have_error, single_period_per_segment), `registry.set_link_timing`, `detect_shot_boundaries` job (ffmpeg scene score 0.4, contiguous `unknown` proposals, `thumbnail` permission, idempotent per model version); routes `GET/POST/PATCH /api/media/{id}/segments`, `.../anchors`, `GET .../alignment/place`, `GET .../alignment/validate`, `POST .../jobs/detect-boundaries` (202); 11 tests, worked example from DATA_MODEL §14 reproduced |
| B-06 Event-video links (managed) | tested 2026-10-09 | `evidence/links.py`: `create_managed_link` (asset must be a managed original whose permissions allow `view`; segment must belong to it; event must exist in Parquet; `manual` needs a window inside the segment; `interpolated` uses `alignment.place_event`, a 4 s / 3 s window clipped to the segment, `timing_error_ms = ceil(placement error)` and `supporting_anchor_ids`; replay segments and un-bracketed clocks refuse interpolation; unique (event, asset, segment) returns the existing link), one `evidence_items(kind=video_segment, class=reviewed_observation)` per link with the event's participants as `player_ids`; `review_link` updates link and item; `evidence_for_event` now carries `segment`; routes `POST /api/events/{system}/{game_id}/{event_id}/links` (201 / 200 existing), `PATCH /api/evidence/links/{id}`, absent in read-only mode; 7 tests |
| B-07 Annotations, revisions, vocabulary, FTS, guide | tested 2026-10-09 | migration `0008_annotations.sql` (`annotations`, append-only `annotation_revisions` with snapshot + diff, FTS5 `annotations_fts` maintained in code); `evidence/vocabulary.py` (13 actions, `validate(action, outcome)`, `catalog()`); `evidence/annotations.py` (create/update/review/delete each append a revision; window inside segment; identity rule: player id ⇔ status ≠ unknown, also for participants; `sampling_method` mandatory; demo/provider id refusal per namespace; notes stored verbatim and returned as `notes.content` + `trust=untrusted_free_text`; delete sets `deleted_at`, keeps the row; listing by segment/asset/player/action/review/game plus FTS `q`); `events.repository.game_roster` + `GET /api/games/{game_id}/roster`; router `/api/annotations` (vocabulary, list, create, detail with revisions, patch, review, delete) absent in read-only mode; `docs/scouting/LABELING_GUIDE.md`; 11 tests |
| B-08 Evidence lifecycle + snapshots | tested 2026-10-09 | `evidence/annotation_evidence.py` keeps one `evidence_items(kind=annotation, class=reviewed_observation)` per annotation in step on every save (summary, players, review, status); `evidence/lifecycle.py`: `supersede_annotation` (revision + item `superseded` with `superseded_by` + `flag_claims_citing` appends a note to every `report_claims` row citing the item, once per status), `mark_asset_evidence` (asset soft delete → link items `deleted`, claims flagged); `evidence/snapshots.py`: `export_snapshots` writes `evidence_snapshots__v{n}` and `annotation_snapshots__v{n}` via `write_family(suffix=)` with `source=scouting-snapshot`, `note=snapshot_version=n` (deleted annotations leave the snapshot; seasons resolved from `games`/`events`), DuckDB view unions versions; new `evidence_snapshots` family (`player_ids` list<int64>); jobs `export_snapshot` and `purge_media` (retention `media_purge_after_days`, refuses assets with active evidence, keeps shared originals, clears `storage_key`, removes derivatives; `dry_run`); routes `GET /api/snapshots`, `POST /api/snapshots/export`, `POST /api/media/purge` (inline runs synchronously via `wait=True`); 6 tests |
| B-09 Evidence review frontend | tested 2026-10-09 | `/evidence` library (capability banner ffmpeg/worker/inline, upload dialog with mandatory permission source + allowed operations, asset table, evidence item filters, snapshot export/version) and `/evidence/:assetId` workbench (HTML5 playback of the derivative, state card for every VIDEO_PIPELINE §5 state incl. permission unknown / no ffmpeg / no worker / failed+retry, timeline with segments, anchors, annotations, playhead and [ ] window, tabs: segments (add, classify, review, detect cuts), anchors (add at playhead with clock, review, rule report), events (link by interpolation or manual window with play-by-play datalist), annotations (vocabulary-driven form with identity/sampling rules, roster subject picker, list with review bar and soft delete)); player profile Evidence panel; nav entry; keyboard: space, ←/→ (shift ×5), [ ]; URL `?t&seg&ann&in&out&game`; backend `POST /api/media/{id}/jobs/retry`; 17 vitest + 1 pytest + e2e `review.spec.ts` (upload → ready → segment → anchor → annotate → review when ffmpeg and a worker exist; degraded assertions otherwise) |
| B-10 Pilot protocol document | document done 2026-10-09; pilot data none yet | `docs/scouting/PILOT.md`: scope (8 players incl. two without media, 12 ingested games, 150–250 segments, four reviewed-trait event types + catch-and-shoot 3s), allowed footage sources, nine-step checklist in the UI, metrics M1–M7 with SQL, decisions the pilot settles. Pilot assets: **none exist**; the six synthetic e2e clips were soft-deleted and the e2e suite now cleans up after itself |

## Phase C: Scouting profiles and comparison

| Task | Status | Notes |
| --- | --- | --- |
| C-01 Trait registry + statistical traits | tested 2026-10-09 | `backend/app/scouting/{traits,compute,defense_traits}.py`, router `scouting.py` (`/api/scouting/traits`, `/api/scouting/traits/{player_id}`); 33 traits (catalog-backed, per-36/per-100, two defense-dashboard differences, shrunk matchup points allowed, combine measurements); 19 tests over the demo dataset |
| C-02 Role templates + candidate search | tested 2026-10-09 | `backend/app/scouting/{roles,role_store,candidates,fingerprint}.py`, `trait_matrix` in `compute.py`, migration `0003_scouting.sql` (`role_templates` only; shortlists/reports tables arrive with C-04/C-05), routes `/api/scouting/roles[/{id}]`, `/api/scouting/candidates` (GET built-in/saved, POST custom); 17 tests. Deviation: plan put all Phase C tables in one migration |
| C-03 Profile snapshots + reviewed-observation traits | tested 2026-10-09 | `backend/app/scouting/{observations,profiles}.py`, four reviewed-observation traits in the registry, `annotation_snapshots` schema (`SNAPSHOT_FAMILIES`, excluded from `all` and from the demo), migration `0004_profiles.sql`, routes `/api/scouting/profiles/{id}` and `.../snapshots`; role validation now rejects reviewed traits as components and requires them for `optional_video_traits`; 13 tests |
| C-04 Shortlists | tested 2026-10-09 | migration `0005_shortlists.sql`, `backend/app/scouting/shortlists.py`, routes under `/api/scouting/shortlists`; entries unique per player, ranking meta (template, funnel, fingerprint, cohort) frozen at save, manual/compare adds have no score; frontend `store/shortlist.ts` (active id + namespace reset in `AppShell`), `apiSend`, hooks `useShortlists`/`useShortlistDetail`; 8 backend + 3 frontend tests |
| C-05 Deterministic reports + claim validator | tested 2026-10-09 | `backend/app/scouting/{claims,reports}.py`, migration `0006_reports.sql`, routes under `/api/scouting/reports`; validator rules per COPILOT §4 (existence/active, rounding tolerance per trait units, reviewed-only citations, model estimates downgraded, bare text -> interpretation, unsupported-request classifier); byte-identical Markdown for identical data; 20 tests |
| C-06 Scouting workspace UI | tested 2026-10-09 | `/scouting` (`pages/Scouting.tsx` + `pages/scouting/*`), `/scouting/shortlists/:id`, `/scouting/reports/:id`, profile `ScoutingPanel`, compare `EvidencePanel`, nav entry; mutations with query invalidation; 8 vitest + 2 Playwright tests (statistics -> shortlist -> draft report -> downgraded claim, on demo or real data) |

## Phase D: Copilot

| Task | Status | Notes |
| --- | --- | --- |
| D-01 Provider abstraction, none/fixture | not started | |
| D-02 Typed tools | not started | |
| D-03 Agent loop + sessions | not started | |
| D-04 Anthropic provider + streaming | not started | live smoke needs a user-supplied key |
| D-05 Claim validation + injection defence | not started | |
| D-06 Copilot UI + evals | not started | |

## Phase E: Narrow CV

| Task | Status | Notes |
| --- | --- | --- |
| E-01 `cv/` scaffold + worker integration | not started | |
| E-02 Licensing review + model cards | not started | must precede any weights download |
| E-03 Shot-release baseline + split + eval | not started | needs labelled pilot clips |
| E-04 Shot-release model + anchor proposals | not started | |
| E-05 CVAT import/export | not started | |
| E-06 Detection/tracking + identity UI | not started | |
| E-07 Court calibration + experimental positions | not started | |

## Phase F: Roster modelling (documented, not scheduled)

F-01 … F-06: not started; see plan for prerequisites. F-04 has no identified data source.

## Blocked / deferred

- None blocked. Deferred choices are listed in DECISIONS.md.

## Last validation results

| Check | Date | Result |
| --- | --- | --- |
| `cd backend && uv run pytest --collect-only -q` | 2026-10-08 | 253 tests collected (not executed for this plan) |
| `make test-backend` | 2026-10-09 (B-09) | 552 passed (551 before B-09 + retry route test) |
| `make test-frontend` | 2026-10-09 (B-09) | 27 files, 171 passed |
| `make lint` | 2026-10-09 (B-09) | ruff check + format clean; oxlint clean after renaming the `q` hook helper to `useEnvelopeQuery` (warnings only) |
| `make build` | 2026-10-09 (B-09) | tsc + vite build ok |
| `make e2e` | 2026-10-09 (B-09) | 18 passed against the real namespace (API on :8000 with ffmpeg, `make worker` running, Vite on :5173) |
| `cd frontend && npx vitest run` | 2026-10-08 | 17 files, 135 tests passed |
| `make e2e` | — | not run during planning (needs API running) |
| Source capability checks (play-by-play, video endpoints) | 2026-10-09 | performed for game 0022400061 via `cli probe-capabilities`; see capability log |

## Source capability log

| Date | Endpoint | Game / params | Result | Fields seen |
| --- | --- | --- | --- | --- |
| 2026-10-09 | `playbyplayv3` | GameID 0022400061 | ok, 402 actions (`game.actions`) | actionNumber, clock (`PT11M48.00S`), period, teamId, teamTricode, personId, playerName, playerNameI, xLegacy, yLegacy, shotDistance, shotResult, isFieldGoal, scoreHome, scoreAway, pointsTotal, location, description, actionType, subType, videoAvailable, shotValue, actionId |
| 2026-10-09 | `playbyplayv2` | GameID 0022400061 | empty body `{}` | — |
| 2026-10-09 | `gamerotation` | GameID 0022400061 | HTTP 500 after 4 attempts (twice) | — |
| 2026-10-09 | `boxscoretraditionalv3` | GameID 0022400061 | ok, 25 player rows | `boxScoreTraditional.{home,away}Team.players`: personId, firstName, familyName, nameI, playerSlug, position, comment, jerseyNum, statistics; `starters`, `bench` |
| 2026-10-09 | `videoeventsasset` | GameID 0022400061, GameEventID 7 / 9 / 11 | ok, 1 playlist entry + 1 videoUrls entry each | playlist: gi, ei, y, m, d, gc, p, dsc, ha, hid, va, vid, hpb, hpa, vpb, vpa, pta; Meta.videoUrls: uuid, sdur/mdur/ldur, surl/murl/lurl, sth/mth/lth (URLs not stored) |
| 2026-10-09 | `videodetailsasset` | TeamID 1610612738, PlayerID 1628369, GameID 0022400061, FGA | ok, 18 clips | same playlist shape |

Raw log: `data/nba/capability_log.jsonl` (append-only; 16 lines after two runs).

## Pilot data (counts from `data/nba/scouting.sqlite`)

2026-10-09 (after B-10): schema v8. External references only: 2,128 `video_assets(kind=external_reference)` for
the 12 ingested 2024-25 games (12 verified `available`, rest `unverified`), 2,128 `event_video_links`, 2,128
`evidence_items(kind=external_reference, class=reference)`, 2,128 view-only permissions. **Managed media: none
live.** Six synthetic test clips (`testsrc`, 3 s) uploaded by the Playwright suite on 2026-10-09 are soft-deleted
(8 segments, 8 anchors and 2 annotations on them; the 2 annotation evidence items are `deleted`); `POST
/api/media/purge` removes their files after the 7-day window. Pilot segments, anchors, annotations: **0** (none
yet). No snapshot exported.

## Relevant decisions for the next task

DEC-12 (one tool-using agent, deterministic tools, provider abstraction, no-key mode; the product says which
mode is running), DEC-13 (structured claims with validated citations), DEC-19 (API keys backend-only; copilot
routes are not mounted on public read-only hosts), COPILOT.md §1–§3.

## Context for incomplete migrations or jobs

None. Note: an unrelated provider ingestion run (`make ingest` for 1996-97…2022-23, all families)
was in progress on this machine during planning; it writes to `data/nba/` and must not be
interrupted by scouting work that rewrites Parquet families.

## Session log

| Date | Session summary | Changed files | Next |
| --- | --- | --- | --- |
| 2026-10-09 (B-10) | Pilot protocol written; real-namespace hygiene: six synthetic e2e clips and two annotations soft-deleted (reversible until purge), review e2e now cleans up after itself; pilot data section states real counts | docs/scouting/PILOT.md, docs/scouting/{IMPLEMENTATION_PLAN,PROGRESS}.md, frontend/e2e/review.spec.ts | D-01 (plus user labeling time per PILOT.md) |
| 2026-10-09 (B-09) | Evidence review frontend (library + asset workbench + profile panel), retry route; TDD (vitest degraded states first) + e2e with a live worker. Lesson: react-router's `setSearchParams(fn)` is not a chained updater, so multi-key writes within one keystroke must be batched and read the live location | frontend/src/pages/{EvidenceLibrary,EvidenceAsset}.tsx, frontend/src/pages/evidence/*, frontend/src/pages/player/EvidencePanel.tsx, frontend/src/hooks/useEvidenceApi.ts, frontend/src/lib/{types,api}.ts, frontend/src/{routes.tsx,components/layout/AppShell.tsx,pages/PlayerProfile.tsx}, frontend/e2e/review.spec.ts, backend/app/api/routers/media.py, backend/tests/api/test_media_retry.py, docs | B-10 |
| 2026-10-09 (B-08) | Evidence lifecycle (annotation items, supersede, claim flagging, asset-delete propagation), versioned snapshot export, purge job, snapshot/purge routes; TDD | backend/app/data/{schemas,paths,parquet_io}.py, backend/app/evidence/{annotation_evidence,lifecycle,snapshots,annotations,evidence_items}.py, backend/app/jobs/handlers/{export_snapshot,purge_media,all}.py, backend/app/jobs/inline.py, backend/app/api/routers/{media,event_links}.py, backend/tests/evidence/{test_lifecycle,test_snapshots}.py, backend/tests/jobs/test_snapshot_purge_jobs.py, docs | B-09 |
| 2026-10-09 (B-07) | Annotations with revisions, vocabulary v1, FTS notes search, roster lookup, labeling guide; TDD (migration comments must not contain semicolons: the runner splits on them) | backend/app/state/migrations/0008_annotations.sql, backend/app/evidence/{annotations,vocabulary,evidence_items,registry}.py, backend/app/events/repository.py, backend/app/api/routers/{annotations,games}.py, backend/app/main.py, backend/tests/evidence/{test_annotations,test_vocabulary}.py, backend/tests/api/test_annotations_api.py, docs/scouting/LABELING_GUIDE.md, docs | B-08 |
| 2026-10-09 (B-06) | Managed event-video links (manual / interpolated), video_segment evidence items, review propagation, write routes gated from read-only mode; TDD | backend/app/evidence/{links,read}.py, backend/app/api/routers/event_links.py, backend/app/main.py, backend/tests/evidence/test_links.py, backend/tests/api/test_event_links_api.py, docs | B-07 |
| 2026-10-09 (B-05) | Segments, alignment anchors and interpolation, validation report, cut-detection proposals, routes; TDD (one test value corrected: the monotonicity case must raise the clock above the first anchor) | backend/app/evidence/{segments,alignment,registry}.py, backend/app/jobs/handlers/{detect_shot_boundaries,all}.py, backend/app/api/routers/media.py, backend/tests/evidence/{test_segments,test_alignment}.py, backend/tests/jobs/test_shot_boundaries.py, backend/tests/api/test_segments_api.py, docs | B-06 |
| 2026-10-09 (B-04) | Playback/thumbnail handlers, Range playback, derivative registry; TDD | backend/app/evidence/{playback,registry}.py, backend/app/jobs/handlers/{make_playback,make_thumbnails,probe_media,all}.py, backend/app/jobs/inline.py, backend/app/api/routers/media.py, backend/app/state/connection.py, backend/tests/{api/test_playback_range.py,jobs/test_media_handlers.py,state/test_connection.py}, docs | B-05 |
| 2026-10-09 (B-03) | Upload intake, permissions, probe handler, media routes; TDD | backend/app/evidence/{uploads,registry}.py, backend/app/jobs/handlers/{__init__,probe_media,all}.py, backend/app/jobs/{runner,worker}.py, backend/app/api/routers/media.py, backend/app/main.py, backend/pyproject.toml (+python-multipart), backend/tests/api/test_media_upload.py, docs | B-04 |
| 2026-10-09 (B-02) | Durable job queue, worker, inline runner, atomic publish; TDD | backend/app/state/migrations/0007_jobs.sql, backend/app/jobs/**, backend/app/api/routers/jobs.py, backend/app/api/capabilities.py, backend/app/{config,main}.py, Makefile, .env.example, backend/tests/jobs/*, backend/tests/api/test_jobs_api.py, docs | B-03 |
| 2026-10-09 (B-01) | Media store + ffmpeg tooling with TDD; ffmpeg now installed | backend/app/evidence/{storage,ffmpeg}.py, backend/app/api/capabilities.py, backend/app/{config.py,data/paths.py}, backend/tests/evidence/{test_storage,test_ffmpeg_tools}.py, backend/tests/api/test_capabilities_media.py, .env.example, README.md, docs/scouting/{IMPLEMENTATION_PLAN,PROGRESS,CURRENT_STATE}.md | B-02 |
| 2026-10-09 (C-06) | Scouting workspace, shortlist and report pages, profile/compare panels; TDD + e2e | frontend/src/pages/{Scouting,ShortlistDetail,ReportView}.tsx, frontend/src/pages/scouting/*, frontend/src/pages/player/ScoutingPanel.tsx, frontend/src/pages/compare/EvidencePanel.tsx, frontend/src/{lib/types.ts,hooks/useApi.ts,routes.tsx}, frontend/src/components/layout/AppShell.tsx, frontend/src/pages/{PlayerProfile,Compare}.tsx, frontend/e2e/scouting.spec.ts, docs | D-01 |
| 2026-10-09 (C-05) | Claim validator + deterministic report drafts; TDD | backend/app/scouting/{claims,reports}.py, backend/app/state/migrations/0006_reports.sql, backend/app/api/routers/scouting.py, backend/tests/scouting/{test_claims,test_reports}.py, backend/tests/api/test_scouting_reports.py, docs/{METHODOLOGY,PLATFORM_OVERVIEW}.md, docs/scouting/{IMPLEMENTATION_PLAN,PROGRESS}.md | C-06 |
| 2026-10-09 (C-04) | Shortlists backend + frontend store; TDD | backend/app/state/migrations/0005_shortlists.sql, backend/app/scouting/shortlists.py, backend/app/api/routers/scouting.py, backend/tests/scouting/test_shortlists.py, backend/tests/api/test_scouting_shortlists.py, frontend/src/store/shortlist.ts, frontend/src/lib/{api,types}.ts, frontend/src/hooks/useApi.ts, frontend/src/components/layout/AppShell.tsx, frontend tests, docs | C-05 |
| 2026-10-09 (C-03) | Reviewed-observation traits, profile builder, snapshots with staleness; TDD | backend/app/scouting/{observations,profiles,traits,compute,roles}.py, backend/app/data/schemas.py, backend/app/ingestion/pipeline.py, backend/app/state/migrations/0004_profiles.sql, backend/app/api/routers/scouting.py, backend/tests/scouting/{test_observations,test_profiles,test_traits}.py, backend/tests/api/test_scouting_profiles.py, backend/tests/{demo/test_generate,ingestion/test_pipeline}.py, docs/{METHODOLOGY,PLATFORM_OVERVIEW,DATA_SOURCES}.md, docs/scouting/{IMPLEMENTATION_PLAN,PROGRESS}.md | C-04 |
| 2026-10-09 (C-02) | Role templates, custom role store, candidate search with funnel and eligibility, routes; TDD | backend/app/scouting/{roles,role_store,candidates,fingerprint,compute}.py, backend/app/state/migrations/0003_scouting.sql, backend/app/api/routers/scouting.py, backend/tests/scouting/{test_roles,test_candidates}.py, backend/tests/api/test_scouting_candidates.py, docs/METHODOLOGY.md, docs/PLATFORM_OVERVIEW.md, docs/scouting/{IMPLEMENTATION_PLAN,PROGRESS}.md | C-03 |
| 2026-10-09 (C-01) | Trait registry + computation service with TDD | backend/app/scouting/*, backend/app/api/routers/scouting.py, backend/app/main.py, backend/tests/scouting/*, backend/tests/api/test_scouting_traits.py, docs/METHODOLOGY.md, docs/PLATFORM_OVERVIEW.md, docs/scouting/{IMPLEMENTATION_PLAN,PROGRESS}.md | C-02 |
| 2026-10-08 | Repository inspection and planning; created docs/scouting/* and root CLAUDE.md | docs/scouting/{README,CURRENT_STATE,ARCHITECTURE,DATA_MODEL,VIDEO_PIPELINE,PROFILES_AND_RANKING,COPILOT,CV_ROADMAP,IMPLEMENTATION_PLAN,PROGRESS,DECISIONS}.md, CLAUDE.md | A-01 |
| 2026-10-09 (A-08) | Isolation tests, one repository fix, Phase A docs sweep (plan statuses, DEC-20/21, CURRENT_STATE, README) | backend/tests/isolation/*, backend/app/events/repository.py, docs/scouting/{IMPLEMENTATION_PLAN,DECISIONS,PROGRESS,CURRENT_STATE}.md, README.md | C-01 |
| 2026-10-09 (A-07) | Frontend for event-linked evidence with TDD (vitest) and Playwright; replaced a 12 h-old stale API dev server to run e2e | frontend/src/lib/types.ts, frontend/src/hooks/useApi.ts, frontend/src/components/evidence/*, frontend/src/pages/shooting/{ShotEvidencePanel,ShotTable,state}.ts*, frontend/src/pages/ShootingLab.tsx, frontend/src/pages/{Games,GameDetail}.tsx, frontend/src/pages/games/*, frontend/src/pages/methodology/{VideoCoverageSection.tsx,sections.ts}, frontend/src/pages/Methodology.tsx, frontend/src/routes.tsx, frontend/src/components/layout/AppShell.tsx, frontend/e2e/{evidence,workflow}.spec.ts, docs | A-08 |
| 2026-10-09 (A-06) | Read API for games/events/evidence with TDD; smoke-tested in-process against the real data dir | backend/app/api/routers/{games,events,evidence,shots}.py, backend/app/main.py, backend/app/events/repository.py, backend/app/evidence/read.py, backend/tests/api/test_games_events_evidence.py, docs/scouting/PROGRESS.md, docs/PLATFORM_OVERVIEW.md | A-07 |
| 2026-10-09 (A-05) | Media registry + external references with TDD; live linking of 12 games and 12 availability checks | backend/app/state/migrations/0002_media_registry.sql, backend/app/evidence/**, backend/app/api/capabilities.py, backend/app/api/routers/meta.py, backend/app/config.py, backend/tests/evidence/*, backend/tests/api/test_capabilities_and_state.py, docs/scouting/PROGRESS.md, docs/DATA_SOURCES.md | A-06 |
| 2026-10-09 (A-04) | Play-by-play layer with TDD; live ingestion of 12 games; agreement 100 % exact | backend/app/data/schemas.py, backend/app/events/{normalize_pbp,id_map,repository}.py, backend/app/ingestion/{fetchers,pipeline,manager,cli}.py, backend/app/api/routers/ingestion.py, backend/app/demo/{derive,generate}.py, frontend/src/pages/methodology/coverage.ts, backend/tests/{events/*,ingestion/test_events_step.py,ingestion/fake_provider.py,ingestion/test_pipeline.py,demo/test_generate.py}, docs/{DATA_SOURCES,METHODOLOGY,PLATFORM_OVERVIEW}.md, docs/scouting/* | A-05 |
| 2026-10-09 (A-03) | Capability probe module + CLI, live run for the pilot game, fixtures recorded (URLs redacted), findings written to DECISIONS/CURRENT_STATE/VIDEO_PIPELINE. Also earlier this session: partial-step resume fix, nba_api session reset fix | backend/app/ingestion/{capabilities,cli}.py, backend/tests/ingestion/test_capabilities.py, backend/tests/fixtures/nba_api/*__game_0022400061*.json, docs/scouting/{DECISIONS,CURRENT_STATE,VIDEO_PIPELINE,PROGRESS}.md | A-04 |
| 2026-10-08 (A-02) | Implemented A-02 with TDD (11 new tests). Backfill of `games` for ingested seasons deferred until the provider ingestion exits | backend/app/events/{__init__,games}.py, backend/app/data/schemas.py, backend/app/ingestion/{pipeline,fetchers}.py, backend/app/demo/generate.py, frontend/src/pages/methodology/coverage.ts, backend/tests/{events/test_games.py,ingestion/test_games_step.py,demo/test_generate.py}, docs/{DATA_SOURCES,PLATFORM_OVERVIEW}.md, docs/scouting/{PROGRESS,CURRENT_STATE}.md | A-03 (after ingestion finishes), then A-04 |
| 2026-10-08 (A-01) | Implemented A-01 with TDD: state package, migrations runner, ULIDs, namespace guard, capabilities endpoint, app wiring | backend/app/state/*, backend/app/api/capabilities.py, backend/app/api/{deps,routers/meta}.py, backend/app/data/paths.py, backend/app/main.py, backend/tests/state/*, backend/tests/api/test_capabilities_and_state.py, docs/scouting/{PROGRESS,CURRENT_STATE}.md | A-02 |
| 2026-10-08 (deploy) | Added public read-only mode (`PUBLIC_READ_ONLY`, CORS setting), `docker-compose.prod.yml` + `deploy/Caddyfile`, nginx caching, `make sync-data`/`deploy-up`, `docs/DEPLOYMENT.md`; DEC-19, Q-10, task A-00 | backend/app/{config,main}.py, backend/app/api/routers/shots.py, backend/tests/api/test_read_only.py, docker-compose.prod.yml, deploy/Caddyfile, frontend/nginx.conf, Makefile, docs/DEPLOYMENT.md, docs/scouting/* | A-01 (A-00 before public scouting) |
| 2026-10-08 (later) | User confirmed: personal non-commercial project, no footage. Web search for openly licensed basketball footage recorded as DEC-18; Q-4/Q-5 resolved; Q-9 added; `dataset_import` adapter added to VIDEO_PIPELINE §1 | DECISIONS.md, VIDEO_PIPELINE.md, PROGRESS.md | A-01 |

## Copy-paste continuation instruction

```
Read CLAUDE.md, then docs/scouting/README.md and docs/scouting/PROGRESS.md. Follow the resume protocol.
Implement task D-01 from docs/scouting/IMPLEMENTATION_PLAN.md (tests first). Update PROGRESS.md before you stop.
```
