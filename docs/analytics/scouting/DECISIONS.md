# Decisions, assumptions and open questions

Canonical home for architecture decisions. Each entry states the decision, why, what was rejected,
and its status. **Selected** decisions are binding until a later entry supersedes them.
**Deferred** choices are listed at the end with the task that must resolve them. Record a new entry
(DEC-nn) whenever a session changes architecture; never edit history silently.

Format: `DEC-nn  Title  [Selected | Deferred | Superseded by D-mm]  (date)`.

## Selected decisions

### DEC-01 Extend, do not replace (2026-10-08) [Selected]
The scouting copilot is a set of new packages inside `backend/app/` and new routes/pages inside the
existing React app. Existing analytics, repositories, envelope, URL state and namespace resolution
are reused as-is ([CURRENT_STATE.md](CURRENT_STATE.md) §5). Alternatives rejected: a separate
service (duplicates metric logic, breaks the single `/api` proxy), a rewrite (no benefit).

### DEC-02 SQLite for mutable application state, one file per namespace (2026-10-08) [Selected]
Mutable records (media registry, annotations, shortlists, reports, agent sessions, jobs) live in
`data/<namespace>/scouting.sqlite` using the stdlib `sqlite3` module (SQLite 3.47 in the venv),
WAL mode, `foreign_keys=ON`, migrations as numbered SQL files applied by a tiny runner
(`backend/app/state/migrate.py`). Parquet stays the home of analytical, append-mostly data.
Why: zero new dependencies, transactional, concurrent readers with a single writer (one API process
plus one worker process is the supported topology), file-per-namespace gives physical isolation.
Rejected: Postgres (deployment burden for a local tool), DuckDB tables for mutable state (DuckDB is
in-memory here and rebuilt on namespace change; its concurrency model fits analytics, not
transactional updates), JSON files (no integrity).

### DEC-03 Authority per entity: SQLite is authoritative for mutable rows; Parquet snapshots are read models (2026-10-08) [Selected]
For every entity in [DATA_MODEL.md](DATA_MODEL.md) one representation is authoritative. Reviewed
annotations and evidence are exported to versioned Parquet snapshots
(`evidence_snapshots`, `annotation_snapshots`) by an explicit "publish snapshot" job so DuckDB can
join them with statistics. Snapshots carry `snapshot_version`; readers never write them; the SQLite
row remains the truth and a snapshot is regenerated, never patched.

### DEC-04 Content-addressed media store outside Parquet/DuckDB (2026-10-08) [Selected]
Originals: `data/<namespace>/media/originals/<sha256[:2]>/<sha256>.<ext>`, immutable. Derivatives:
`data/<namespace>/media/derived/<asset_id>/<processing_version>/{playback.mp4, thumbs/, meta.json}`.
Database rows store `storage_key` (relative to the namespace media root) never client paths.
Why: deduplication by hash, trivial integrity checks, safe deletion semantics. Rejected: UUID
filenames (no dedup), storing blobs in SQLite (file sizes).

### DEC-05 One durable worker process polling SQLite jobs (2026-10-08) [Selected]
`python -m app.jobs.worker` claims rows from `processing_jobs` with a lease (`locked_by`,
`lease_until`), heartbeats, retries with backoff, honours cancellation, publishes outputs atomically
(write to temp, then one transaction flips `status` and inserts output rows), and recovers expired
leases after restart. The API only enqueues and reads status. For tests and a one-command dev
experience, the same job functions can run in an in-process thread (`JOBS_INLINE=1`) with the same
persistence. Rejected: Redis/Celery/RQ (new infrastructure for a local tool), running ffmpeg inside
requests (timeouts, no resume), reusing `IngestionManager` (non-durable, in-memory progress).

### DEC-06 Play-by-play v3 is the canonical event source; v2 and shot ids are mapped, not assumed (2026-10-08) [Selected]
`events` are keyed by `(namespace, provider, game_id, source_event_id)` where `source_event_id` is
`playbyplayv3.actionNumber` and `source_event_system = "pbp_v3"`. A separate `event_id_map` family
records verified correspondences between `pbp_v3.actionNumber`, `pbp_v2.EVENTNUM` and
`shots.game_event_id`, with a `method` and `verified_at`. Until task A-04 records real responses and
measures agreement, `shots.game_event_id == actionNumber` is a **hypothesis**. Rejected: assuming
equality (the brief forbids it), re-ingesting shots from play-by-play (loses provider zone labels).

### DEC-07 Provider endpoints are candidates until recorded (2026-10-08) [Selected]
Every new endpoint (`playbyplayv3`, `gamerotation`, `boxscoretraditionalv3`, `leaguegamefinder`,
`videoeventsasset`, `videodetailsasset`) is wired through the existing `StatsProvider` and a
fixture is recorded from a real response **before** a normalizer is finalised. A bounded capability
probe (`cli probe-capabilities --game-id ... --event-ids ...`, max 10 events per run, paced) records
actual behaviour into `data/nba/capability_log.jsonl` and PROGRESS.md. Nothing in the UI claims an
endpoint works until that log says so.

### DEC-08 External-reference video mode is the MVP; managed media requires an authorised asset (2026-10-08) [Selected]
Phase A ships `event_video_links` of kind `external_reference` holding only metadata and a
provider page reference; the UI opens it in a new tab. No automatic download, no embedding of
provider streams, no scraping. Managed media (Phase B) accepts only user-supplied local files with
a recorded `source_permissions` row; unknown permission means view-only in-app and no processing.
Rejected: downloading provider clips (terms and reliability unknown; the brief forbids assuming it),
embedding via iframe (unknown permission).

### DEC-09 Piecewise alignment, never one global offset (2026-10-08) [Selected]
Alignment between media presentation time and game clock is a set of `alignment_anchors`
(`(asset_id, media_pts_ms) <-> (period, clock_ms)`), each with a method and an error estimate, and
event-level `event_video_links` with their own `media_start_ms/media_end_ms`. Segments are
classified `live | replay | unknown`. Interpolation is only allowed between two anchors in the same
`period` with no cut between them. See [VIDEO_PIPELINE.md](VIDEO_PIPELINE.md) §6.

### DEC-10 Tracks are local; identity is a separate, reviewable assignment (2026-10-08) [Selected]
`tracks.track_id` is unique only within a `tracking_context` (asset, segment, model version).
`identity_assignments` map a track to a `player_id` with `method`, `confidence_raw`
(uncalibrated, never shown as a probability), and `review_status`. Unknown stays unknown.

### DEC-11 Trait layer: four evidence classes, never merged in a score (2026-10-08) [Selected]
Scouting profiles separate `statistical`, `reviewed_observation`, `model_estimate` and
`interpretation`. Only `statistical` traits enter role-template rankings in Phase C. Video and
model traits appear beside the ranking with their coverage; a template may declare an optional
video trait, but its presence changes **eligibility labels**, not weights across players.
Rankings are "match to selected criteria", not predictions.

### DEC-12 Copilot: one tool-using agent, deterministic tools, provider abstraction, no-key mode (2026-10-08) [Selected]
`backend/app/copilot/` holds a single agent loop over typed tools that call existing repositories.
`LLMProvider` protocol with `anthropic` (optional dependency group `copilot`), `fixture` (replays
recorded tool/turn transcripts for tests) and `none` (tools usable directly, no narrative). The
default is `none`; the UI shows which mode is active. Keys stay in backend env
(`SCOUT_LLM_PROVIDER`, `ANTHROPIC_API_KEY`), never in the browser. No raw video is sent to any
model unless `SCOUT_ALLOW_EXTERNAL_MEDIA=1` is set explicitly. Rejected: multi-agent frameworks
(no demonstrated need), agent-side SQL (forbidden), embeddings in the MVP (metadata + FTS5 suffice
for the pilot's volume).

### DEC-13 Structured claims with validated citations (2026-10-08) [Selected]
Agent output is a list of `Claim` objects (text, type, scope, evidence_ids, numeric_refs,
limitations, counterevidence). A validator checks evidence ids exist in the current namespace, numbers
match tool outputs within formatting tolerance, and no claim of type `reviewed_observation` cites
unreviewed annotations. Failing claims are downgraded or dropped and the report records that.

### DEC-14 CV runs in a separately managed environment (2026-10-08) [Selected]
`cv/` is its own uv project with its own `pyproject.toml` and Python pin; the worker invokes it as a
subprocess with a JSON job file and reads JSON/Parquet outputs. The analytics backend stays on
3.13 and never imports torch. Rejected: adding torch to `backend/` (version coupling, start-up cost).

### DEC-15 First CV task: shot-release moment detection in event-linked clips (2026-10-08) [Selected]
Justification in [CV_ROADMAP.md](CV_ROADMAP.md) §3: it needs no identity, has ground truth
derivable from manual anchors, directly improves alignment and thumbnails, and is measurable in
frames of error. Rejected as MVP: full-game multi-object tracking, player identification,
defender distance.

### DEC-16 Pilot: 2024-25 Regular Season, 8 players, 12 games, 150–250 segments (2026-10-08) [Selected]
2024-25 is complete locally for every game-level family and is a finished season (stable ids).
The pilot deliberately includes two players with no media and games with ambiguous events
(duplicate clock readings, replays). Pilot assets do not exist yet; the plan never claims they do.

### DEC-18 Footage sourcing policy: external references, openly licensed research datasets, user recordings (2026-10-08) [Selected]
The user has no footage and the project is personal and non-commercial (Q-4, Q-5 answered
2026-10-08). Footage for Phases B and E comes only from: (a) provider event pages opened externally
(DEC-08); (b) research datasets whose licence permits non-commercial use, imported as managed
media with `source_permissions(source=dataset:<name>, authorization_ref=<licence URL>,
allowed_operations=[view, playback_derivative, thumbnail, cv_processing])` and the licence file
stored beside the originals; (c) footage the user records. Candidates verified on 2026-10-08 (web
search, licence lines quoted from the official pages): SportsMOT (CC BY-NC 4.0; basketball clips
from YouTube broadcasts with MOT tracking labels; download via Codalab sign-up),
conniemy/BasketballVideo (CC BY-NC 4.0; 20 NBA HD games cut into ~20-minute parts, 25 fps
1920×1080, Baidu-hosted, no annotations, games/seasons unstated), DeepSport basketball-instants
(CC BY-NC-ND or BY-NC-SA depending on release; LNB Pro A arena images, useful for calibration and
detection only). Not adopted: tools that bulk-download clips from nba.com video servers (NSVA,
BARD, nba-pbp-video) because stats.nba.com's terms for that use were not confirmed; the app will
not implement or wrap such a downloader. A dataset's licence does not clear the league's underlying
rights; use stays private and non-commercial, and nothing is redistributed.
Rejected: scraping YouTube or nba.com; claiming "publicly viewable" equals "downloadable".

### DEC-19 Public read-only deployment of the analytics app; scouting features need access control before going public (2026-10-08) [Selected]
The user wants the current platform viewable by others. The existing app gains `PUBLIC_READ_ONLY=1`
(ingestion routes unregistered, on-demand provider fetch refused), `docker-compose.prod.yml` (API
with read-only data mount, nginx web, Caddy for HTTPS) and `make sync-data` (rsync Parquet +
manifest from the ingestion machine). Ingestion stays on the user's Mac. The deployment has no
authentication, which is acceptable for read-only statistics but not for Phases B–D (uploads,
annotations, shortlists, reports, copilot sessions, media playback of licensed datasets). Those
features are therefore gated: before any scouting route is enabled on the public host, a task adds
single-owner access control (Q-10). Until then scouting work runs locally (`make dev`).
Rejected: exposing uploads/annotations publicly without auth; running ingestion on the server
(provider blocks cloud ranges; also an abuse vector).

### DEC-20 Play-by-play is ingested per game, never as part of `all`, and always re-runs when requested (2026-10-09) [Selected]
A season is 1,230 `playbyplayv3` calls (~40 min at the default pacing), so `events` (and its
aliases `event_participants`, `event_id_map`) are on-demand families: `FAMILIES=events` with
`--game-ids` or `--games-limit`, merged into the season file, and never skipped as "already ok"
because coverage is per game. The plan's A-04 text assumed season-level skipping; this supersedes
it. `games` (derived locally) stays a normal seasonal family.

### DEC-21 Demo events are shot-only and labelled (2026-10-09) [Selected]
The demo generator writes `events`/`event_participants`/`event_id_map` with one event per
synthetic shot (`source_event_system = demo_shots`) so every family exists in both namespaces and
the UI can be exercised without provider data; the manifest note says so. Readers must resolve an
event's system from the game's events rather than assuming `pbp_v3` (bug found by A-08's isolation
tests and fixed in `events/repository.py`).

### DEC-17 Plan documents live in `docs/scouting/`; task granularity differs from `writing-plans` (2026-10-08) [Selected]
The repository's earlier spec and plan live in `docs/superpowers/`. The brief asked for a
self-contained `docs/scouting/` set with stable task ids, status, acceptance criteria and tests; the
`writing-plans` skill's step-level code listings would be premature for work that spans months and
endpoints not yet recorded. Each task therefore lists files, interfaces, steps, tests and
acceptance criteria; the implementing session writes the failing test first (TDD) from those.

## Assumptions (marked, reversible)

- A-1 The product is private research for one user on one machine for the duration of Phases A–E.
  Commercial use would require revisiting DEC-08 and the licensing review in CV_ROADMAP §6.
- A-2 No authorised NBA footage is available today. Phase B is designed to be useful with any
  legally held local file (including non-NBA practice footage for tooling validation) and with
  external references only.
- A-3 No video-provider agreement exists. The `licensed_provider` adapter is an interface only.
- A-4 Sending **text** (statistics, annotation notes, claim drafts) to an external LLM is acceptable
  when a key is configured by the user; sending media is not, unless explicitly enabled (DEC-12).
- A-5 Hardware for CV is the current Apple M4 Pro (CPU + MPS); no CUDA. Model choices must have a
  CPU path.
- A-6 One API process and at most one worker process run at a time (SQLite single-writer model).

## Open questions (do not block the plan; resolve by the task listed)

| # | Question | Default used | Resolve in |
| --- | --- | --- | --- |
| Q-1 | Do `videoeventsasset` / `videodetailsasset` return usable metadata (and what fields) from this network, and for which seasons? | **Partly resolved 2026-10-09 (A-03, game 0022400061, 2024-25):** both answer. `videoeventsasset(GameID, GameEventID)` returns `resultSets.playlist` (17 fields: gi, ei, y/m/d, gc, p, dsc description, ha/hid/va/vid teams, hpb/hpa/vpb/vpa scores, pta) and `resultSets.Meta.videoUrls` (uuid, durations, direct CDN mp4/jpg URLs in 3 sizes). `videodetailsasset(TeamID, PlayerID, GameID, ContextMeasure=FGA)` lists the same shape for every FGA of that player in the game (18 clips). Only metadata (uuid, description, duration, flags) may be copied to the registry; URLs stay in the raw cache (DEC-08). Season coverage beyond 2024-25 unknown. | A-05 uses the metadata; coverage by season is a later bounded probe |
| Q-2 | Do `shots.game_event_id` and `playbyplayv3.actionNumber` agree for all shot events in a sample of games? | **Confirmed on 12 games (2026-10-09, A-04): 2,128 of 2,128 shots `exact`, 0 probable/ambiguous/unmapped.** The `event_id_map` stays the only join path (DEC-06) so a future divergence is recorded, not assumed away. Earlier note: for game 0022400061 actions 7, 9, 11, 13 are field goals by the same players at the same clock as shots 7, 9, 11, 13. `playbyplayv2` returned an empty body `{}` for this 2024-25 game, so v2 is not a fallback for recent seasons. Full per-game verification and the `event_id_map` remain A-04's job | A-04 |
| Q-3 | Which `gamerotation` time base is used (`IN_TIME_REAL` tenths of a second from game start?) | **Unresolved:** `gamerotation(GameID=0022400061)` answered HTTP 500 on 2026-10-09 (8 attempts over two runs, including after 12 s read timeouts). Possibly needs `LeagueID=00`; retry with that parameter in F-01. `boxscoretraditionalv3` works (`boxScoreTraditional.{home,away}Team.players` with position, jerseyNum, statistics; `starters`/`bench` keys present) and can supply starters | F-01 |
| Q-4 | Is the product private research or commercial? | **Resolved 2026-10-08: personal, non-commercial project development.** | AGPL/NC licences acceptable while unshipped |
| Q-5 | Is authorised local footage available? | **Resolved 2026-10-08: none.** Footage will come from DEC-18 sources | B-10 pilot sizing follows the datasets actually imported |
| Q-6 | May the agent send text to an external model? | Yes when key configured (A-4) | User answer before DEC-01 copilot default changes |
| Q-7 | Which detector/weights license is acceptable (AGPL vs Apache-2.0)? | Prefer Apache-2.0/MIT weights; AGPL only if the product stays private and unshipped | E-02 licensing review |
| Q-8 | Will `ffmpeg` be installed via Homebrew (LGPL/GPL build) | Required for Phase B; capability check gates features | B-01 |
| Q-10 | Access control for scouting features on the public host: single shared token in a cookie set by a login page, or HTTP basic auth at Caddy, or keep scouting local-only? | Scouting features stay local-only (not registered when `PUBLIC_READ_ONLY=1`) until decided; default proposal is Caddy basic auth in front of `/api/scouting`, `/api/media`, `/api/annotations`, `/api/copilot`, `/api/jobs` plus a `SCOUT_OWNER_TOKEN` checked by the API | new task A-00 (see plan) |
| Q-9 | Can the 20 NBA games in conniemy/BasketballVideo be identified (teams, date) so their play-by-play can be ingested and the pilot season moved to match? | Unknown until a sample is inspected; if not identifiable, those files support Phase B tooling and CV stages 1–3 but not event-linked evidence | B-10 |

## Deferred choices

- Embeddings / vector retrieval for annotations: deferred until FTS5 proves insufficient (DEC-12).
- CVAT integration: import/export of CVAT XML/JSON is planned (E-05); running CVAT is not.
- Multi-user review and authentication: out of scope for Phases A–E.
- Possession parser rules for edge cases (jump balls, technical free throws): rules are specified in
  VIDEO_PIPELINE §11 but implementation is Phase F.
