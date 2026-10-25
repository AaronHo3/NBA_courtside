# Video pipeline: sources, permissions, ingestion, alignment, annotation

Canonical home for: video source adapters and permission handling, upload safety, derivative
processing, playback, clock/event alignment rules, the annotation protocol and action vocabulary,
sampling methods, and the possession/lineup reconstruction rules reserved for Phase F. Table fields
are in [DATA_MODEL.md](DATA_MODEL.md); the worker is in [ARCHITECTURE.md](ARCHITECTURE.md) §5.

## 1. Source adapters

```python
class VideoSourceAdapter(Protocol):
    name: str                                   # "nba_stats_events", "local_upload", "licensed:<vendor>"
    mode: Literal["external_reference", "managed_media"]
    def describe_event(self, event_key) -> ExternalReference | None: ...   # metadata only
    def check_availability(self, ref) -> Availability: ...                 # bounded, paced
    def register_asset(self, ...): ...                                      # managed mode only
```

| Adapter | Mode | What it stores | What it never does |
| --- | --- | --- | --- |
| `nba_stats_events` (Phase A) | external_reference | `video_assets(kind=external_reference, external_provider, external_url, availability)` and `event_video_links(alignment_method=provider_metadata or none)`; provider `video_available` flag copied to `events.video_available` | download, embed, proxy or cache any media; treat `video_available` as permission |
| `local_upload` (Phase B) | managed_media | sha256-addressed original, `source_permissions(source=user_upload)`, derivatives | accept URLs; accept files above limits; trust client paths |
| `dataset_import` (Phase B, DEC-18) | managed_media | CLI `media import --dataset <name> <dir>` registers files from an openly licensed research dataset with a `source_permissions` row carrying the licence URL and the dataset's allowed operations; the licence file is copied next to the originals | fetch anything from the network; accept datasets without a recorded licence |
| `licensed:<vendor>` (future) | managed_media | the same registry rows plus `source_permissions(source=licensed_provider:<vendor>, authorization_ref, expires_at)` | be implemented before an agreement exists (interface only) |

External reference construction for `nba_stats_events`: the reference stored is the provider's
events page for the game/event (`https://www.nba.com/stats/events/?GameID=<game_id>&GameEventID=<event_id>&flag=1`,
opened in a new tab), plus the metadata the A-03 probe showed `videoeventsasset` returns for an
event: description (`dsc`), period, teams, running score and the clip `uuid`/duration from
`Meta.videoUrls`. The direct mp4/jpg URLs in that response are **not** copied into the registry or
the UI; they remain in the raw cache only (DEC-08). `availability` starts `unverified` and becomes
`available` once the event's metadata call succeeds; season coverage outside 2024-25 is unknown.
`videoeventsasset` / `videodetailsasset` responses, if any, are stored in the raw cache like any
other endpoint and only **metadata fields** (ids, descriptions, durations, flags) are copied to the
registry. Stream URLs that appear in a response are not stored in the UI-facing columns.

Capability probe: `cli probe-capabilities --game-id 0022400001 --event-ids 7,12,55 --max 10`
goes through `StatsProvider` (pacing, retries), records `{endpoint, params, status, result_set_names,
row_count, fields_seen, fetched_at}` per call to `data/<namespace>/capability_log.jsonl`, and prints
a summary for PROGRESS.md. Bounded to 10 calls per invocation by default.

## 2. Permissions model

See `source_permissions` in DATA_MODEL §4. Enforcement points:

| Operation | Allowed when |
| --- | --- |
| Register metadata / show external link | always |
| In-app playback of managed media | `view` and `playback_derivative` present |
| Thumbnails / shot boundaries | `thumbnail` present |
| CV processing (detection, tracking, calibration) | `cv_processing` present |
| Sending frames or clips to an external model | `external_model` present **and** `SCOUT_ALLOW_EXTERNAL_MEDIA=1` |
| Export / redistribution | `redistribute` present |

`permission_status = unknown` denies everything except metadata display. The upload form requires
the user to pick a permission statement (for example "I recorded this footage" or "licensed under
<ref>") before the file is accepted; "I don't know" registers the asset as `unknown`.

No DRM circumvention, scraping, or stream capture is implemented anywhere.

## 3. Upload safety (Phase B)

- Multipart upload to `POST /api/media/uploads` with `Content-Length` required and
  `MEDIA_MAX_UPLOAD_BYTES` (default 4 GiB) enforced while streaming to a temp file in
  `media/incoming/`.
- Accepted containers after **content sniffing with ffprobe**, not by extension: `mp4, mov, mkv,
  webm`. Non-media or unparseable files are rejected (`415`) and the temp file removed.
- The stored name is the hash; `original_filename` is sanitised (`[^A-Za-z0-9._-]` -> `_`, max 120
  chars) and display-only.
- No URL fetcher endpoint exists. Server-side paths are never accepted from the client; the only
  way to add media is the upload endpoint or a documented CLI `media import <path>` run by the user.
- Storage keys are validated to be relative, normalised, and within `media/`; any `..` or absolute
  component is refused (`400`).
- Playback uses `Range` requests (`206`) over the derivative file via a streaming response that
  reads the file in chunks; `HEAD` supported; `Accept-Ranges: bytes`.
- Processing bounds: `MEDIA_MAX_DURATION_MS` (default 4 h), `MEDIA_MAX_PIXELS` (default 4K), per-job
  wall clock caps.

## 4. Derivatives and processing jobs

| Job kind | Input | Output | Notes |
| --- | --- | --- | --- |
| `probe_media` | original | asset metadata columns, `probe_json`, VFR detection | ffprobe; first job after registration |
| `make_playback` | original | `derived/<asset>/<v>/playback.mp4` (H.264, AAC, `-movflags +faststart`, constant frame rate by `-vsync cfr` when VFR) | browser playback; original untouched |
| `make_thumbnails` | playback | `thumbs/sheet.jpg` + `thumbs/index.json` (every N s) | segment navigation |
| `detect_shot_boundaries` | playback | proposed `video_segments(origin=shot_boundary_model, classification=unknown)` | ffmpeg `select='gt(scene,T)'`; proposals need review |
| `export_snapshot` | SQLite | Parquet snapshot families | see DATA_MODEL §12 |
| `cv_*` | playback or frames | features/tracks | Phase E, see CV_ROADMAP |

Each run records `processing_version`; re-running with a new version produces new derivative rows
and leaves old ones until a retention job removes derivatives older than `MEDIA_DERIVATIVE_RETENTION`
that no `video_segments` reference by version (segments reference the asset's presentation
timeline, not a derivative, so they survive regeneration).

Deletion: soft delete (`deleted_at`) immediately hides an asset; a `purge_media` job removes files
after `MEDIA_PURGE_AFTER` (default 7 days) unless evidence items referencing its segments are
`active`, in which case purge is refused and the UI explains why.

## 5. Playback and in-app behaviour per source state

| State | UI |
| --- | --- |
| External reference, `unverified` | "Open on provider site" button; badge "unverified"; no player |
| External reference, `unavailable`/`stale` | greyed link, last check time, "re-check" action (bounded) |
| Managed, `registered`/`probed` without playback derivative | metadata card; "processing queued" or "ffmpeg unavailable" |
| Managed, `ready` | HTML5 video from `/api/media/{asset_id}/playback`, thumbnail strip, segment list |
| Managed, `failed` | error from job, retry button (enqueues with a new attempt) |
| Permission unknown | metadata only; explanation of what would be needed |

## 6. Clock and event alignment

Video presentation time is not game time. Rules:

1. **Anchors are per segment.** An `alignment_anchor` belongs to one live segment. A segment
   boundary (cut, replay, commercial, graphics) ends the validity of anchors before it.
2. **Monotonicity check.** Within a live segment, `clock_ms` must strictly decrease as
   `media_pts_ms` increases, except while the clock is stopped (equal `clock_ms` allowed); a
   violation marks the segment `needs_review` and blocks interpolation.
3. **Interpolation** between two anchors in the same segment and period is linear in media time
   while the clock runs; a stopped-clock interval (free throws, timeouts) is a dead zone where an
   event can only be placed by its own anchor. `alignment_method = interpolated` and
   `timing_error_ms = max(anchor errors) + drift_allowance(gap)` with
   `drift_allowance = 30 ms per 10 s of gap` (provisional constant, revisited after pilot data).
4. **Same clock reading, several events.** Events sharing `(period, clock_ms)` (e.g. a foul and the
   following free throw, a made shot and the assist) are ordered by `source_order`; a link to one of
   them covers the others only if the labeler confirms (`review_status`).
5. **Edited clips** (provider clips, user trims) get `classification = live` with one anchor from
   provider metadata or manual placement; durations under 3 s are flagged.
6. **Variable frame rate** media must be converted to constant frame rate for playback; anchors are
   recorded against the playback derivative's presentation timeline and the asset stores
   `variable_frame_rate = 1` so CV jobs use PTS, not frame indices.
7. **Multiple views** of the same event are separate links with their own anchors; the evidence
   list groups them by event key.
8. **OCR-assisted anchors** (score-bug clock reading, Phase E optional) are `method = ocr_assisted`
   with `error_ms` from the OCR validation set, and remain `unreviewed` until confirmed.

Validation checks implemented as tests and as a `GET /api/media/{asset_id}/alignment/validate`
report: monotonicity per segment, no cross-segment interpolation, every link's
`media_start_ms/media_end_ms` inside its segment, `timing_error_ms` present for every
`interpolated` link, replay segments contain no `live`-classified links. Sample mapping in
DATA_MODEL §14.

## 7. Annotation protocol

In-app, lightweight: select a segment or a time range on the playback timeline, pick an action from
the vocabulary, optionally pick the subject (from the game's two rosters, which come from
`player_game_logs` for that `game_id`), mark identity as `verified | asserted | unknown`, set
visibility, outcome, participants, notes and supporting timestamps. Saving appends an
`annotation_revisions` row. Review is a separate action that sets `review_status`.

CVAT: import/export of CVAT-for-video XML (tracks with boxes) and a simple JSON for labels is
planned (E-05) for larger projects; running a CVAT server is not required.

Separation enforced by the vocabulary: **observable action** (what happened on screen),
**tactical interpretation** (why, in scheme terms) and **coaching judgment** (good/bad) are different
fields; the first is `action`, the second is a tagged `interpretation` annotation kind that cites the
observation, the third lives only in report `interpretation` claims.

## 8. Action vocabulary v1 (versioned; stored as `vocab_version = 1`)

| Key | Definition (observable) | Typical outcome keys |
| --- | --- | --- |
| `catch_and_shoot_3` | Receives a pass and shoots a 3 without a dribble | `made`, `missed`, `blocked`, `fouled` |
| `pull_up_shot` | Shoots after one or more dribbles | same |
| `drive` | Attacks the basket off the dribble past the first defender's hip | `finish_made`, `finish_missed`, `kick_out`, `turnover`, `foul_drawn` |
| `screen_set` | Sets a stationary screen on a defender | `defender_contact`, `slipped`, `switched`, `not_observable` |
| `cut` | Off-ball movement toward the basket or an open area to receive | `received`, `not_received` |
| `closeout` | Defender runs at a shooter after a pass | `contest_hand_up`, `late`, `blown_by`, `no_shot` |
| `help_rotation` | Defender leaves assignment to help | `stop`, `late`, `not_observable` |
| `box_out` | Makes contact to prevent an opponent's rebound | `secured_team`, `lost` |
| `post_up` | Establishes position with back to basket | `score`, `miss`, `pass_out`, `turnover` |
| `pass_creation` | Pass that leads directly to a shot attempt | `assist`, `shot_missed`, `secondary` |
| `turnover_live` | Loses the ball to the defense | `steal`, `deflection` |
| `unknown` | Action could not be determined | |
| `not_observable` | The relevant player or action is out of frame / obstructed | |

Labeling guide points (full guide: [LABELING_GUIDE.md](LABELING_GUIDE.md), written in B-07): one
primary action per annotation; label what is seen, not inferred; subject must be visually
identified before `verified`; use `not_observable` liberally; always record visibility.

## 9. Sampling and coverage (what an annotation set can support)

`sampling_method` is mandatory on every annotation and summarised per player per season:

| Method | Supports | Does not support |
| --- | --- | --- |
| `complete_event_set` (all provider events of a type in the covered games) | rates per opportunity within covered games, with `coverage = covered_games / games_played` | season-wide rates when coverage < 1 without a stated caveat |
| `systematic_sample` (e.g. every k-th possession of covered games) | estimates with sampling error stated | |
| `random_sample` | estimates with sampling error | |
| `curated` / `provider_selected` | examples and counterexamples only | any frequency or rate claim |

Rate claims require an opportunity denominator (e.g. closeouts observed / catch-and-shoot
opportunities faced) and the coverage figure; the trait layer refuses to compute a rate without
both (PROFILES_AND_RANKING §4). Contradictory examples and review disagreements are stored as
annotations (`review_status = reviewed_corrected`, revisions keep the disagreement) and surface in
profiles as `counterevidence`.

## 10. Full-court coordinate frame (for calibration; CV_ROADMAP §5 details)

`full_court_v1`: origin at the court centre, x along the length (−47 ft to +47 ft), y along the
width (−25 ft to +25 ft), units **feet**, right-handed as seen from the main broadcast camera
(home bench side is +y, documented per venue when it differs). Ground-plane positions only. The
transform to the existing hoop-relative `shots` frame (tenths of a foot, origin at the attacked
hoop, y toward half court) is explicit: `x_hoop = s * y_court * 10`, `y_hoop = (41.75 − |x_court|) * 10` with `s = ±1` determined by
`attacking_direction` (hoop centre is 4 ft + 15 in = 5.25 ft from the baseline, so 47 − 5.25 = 41.75 ft
from centre court; a point at the hoop maps to (0, 0), centre court to (0, 417.5), behind the hoop
to negative y). This mapping is a function in `analytics/court.py`
(`full_court_to_hoop_relative(x_ft, y_ft, attacking_direction)`) with tests at the corners, the
hoop and centre court. A planar mapping is invalid for the ball or any airborne point.

## 11. Possession and lineup reconstruction rules (reserved for Phase F)

Implemented only after `events` coverage is validated. Rules the parser must encode and test:

- **Initial lineups**: from `gamerotation` (`IN_TIME_REAL = 0` per period) when available, else from
  `boxscoretraditionalv3` starters for period 1 and inferred from first appearances otherwise
  (`confidence = inferred`).
- **Substitutions**: paired `substituted_out/in` participants; unpaired entries produce an
  `unknown_interval` until the next consistent state.
- **Period boundaries** end every stint and possession; the team to start each period follows the
  jump-ball/alternating rule as recorded, not assumed.
- **Free throws**: a possession ends on the last free throw of a trip (made, or missed and
  rebounded); technical free throws do not change possession; and-one sequences stay in the same
  possession.
- **Offensive rebounds** continue the possession; team rebounds after missed last free throws are
  handled by the explicit rebound event.
- **Jump balls**: possession assigned to the team of the `tipped_to` participant when present,
  else `unknown`.
- **Corrections and duplicates**: later events with the same id or contradicting score are kept with
  `duplicate_of`; the parser uses the last consistent state and marks the interval `uncertain`.
- **Missing or contradictory events**: when the score column disagrees with accumulated points, the
  interval is `uncertain`; when the clock jumps backwards, a new `unknown_interval` begins.
- **Coverage report** per game: share of game time in `complete` intervals; possession metrics are
  exposed only for games with coverage ≥ 0.98 and seasons with ≥ 95 % of games complete (provisional
  thresholds), always with the coverage number shown.
