# Pilot protocol (B-10)

A small, honest labeling pilot that produces the first reviewed observations the trait layer can
use, and the numbers that tell us whether the workflow is worth scaling. It records what exists;
it never assumes footage exists (DEC-16, DEC-18).

## 1. Scope

| Item | Value | Why |
| --- | --- | --- |
| Season | 2024-25 Regular Season | complete locally for every game-level family, stable ids |
| Players | 8, chosen from one role shortlist, **two of them deliberately without any media** | the two media-less players prove that profiles and reports degrade honestly (`unsupported`, "no reviewed observations") |
| Games | 12 of the 2024-25 games already ingested with play-by-play (see `GET /api/games?season=2024-25`, coverage column) | events, shot ids and external references already exist for them |
| Views | a mix: at least one broadcast recording, at least one non-broadcast view (own recording from a fixed position, or an openly licensed dataset clip) | alignment and identity rules must be exercised on both |
| Target | 150–250 reviewed segments; every annotation `complete_event_set` for the chosen event types | enough for rates with stated error on 2–4 players, and for a first shot-release training set (E-03) |
| Event types | `closeout`, `screen_set`, `cut`, `box_out` (the four reviewed-observation traits) plus `catch_and_shoot_3` for shot-release anchors | each has a trait definition with an opportunity denominator already |

## 2. Footage you may use

Only footage with a recorded permission statement is processed (DEC-08). Allowed sources, in
order of preference (DEC-18):

1. **Your own recordings** (`own_recording`): a phone or camera at a game you attended, or a
   screen-free re-recording is **not** allowed; a broadcast is the rights holder's.
2. **Openly licensed research datasets** (`dataset_import`): basketball video datasets released
   under CC BY-NC or similar; keep the licence URL in `authorization_ref`. Check the licence allows
   derivative files (the playback transcode and thumbnails) before ticking `playback_derivative`.
3. **External references** (nothing on disk): provider clip pages opened on nba.com. They are
   already linked for the 12 games (2,128 references). They cannot be annotated, only cited.

Never download, record or re-encode provider media. If in doubt, register the asset with
`permission_source = unknown`: it is stored and listed, nothing is processed.

## 3. Checklist (one asset at a time)

Everything below is done in `/evidence` and `/evidence/:assetId`; the API paths are in
`docs/PLATFORM_OVERVIEW.md` if you prefer the CLI or curl.

1. **Machine ready**: the library page banner shows `ffmpeg 9.x` and either `worker alive`
   (`make worker` in a second terminal) or `jobs inline`. Without one of them, uploads stay queued.
2. **Register**: Upload footage → choose the permission source → tick the operations you are
   authorised for (`view`, `playback_derivative`, `thumbnail`; `cv_processing` only if the licence
   allows model inference) → paste the licence or authorisation reference → Upload. Wait for the
   state card to read **Ready**. Record the start time (metric M1).
3. **Segments**: mark the live broadcast stretches as `live`; replays, graphics and ads as
   `replay` / `non_game`. Use **Detect cuts** to get proposals (they arrive `unknown`,
   unreviewed), then classify and mark each OK or Reject. Rule: anchors and annotations only live
   inside segments; a wrong `live` boundary silently breaks interpolation, so review every cut.
4. **Anchors**: in each live segment, pause on two frames where the score-bug clock is legible,
   at least 30 s apart and in the same period; enter period and clock (`m:ss.t`), `±120 ms` if
   you read a whole second, `±60 ms` if tenths were visible. The **Alignment rules** report must
   read "pass" before you link events. A stopped clock (free throws) is a dead zone: add its own
   anchor if you need an event there.
5. **Link events**: Events tab → game id → pick the play-by-play event → **Interpolate** (preferred,
   it records the anchors used and the timing error) or **Manual window** when the clock cannot be
   read. Link every event of the chosen types for the covered stretch, not just the interesting ones
   (that is what `complete_event_set` means).
6. **Label**: Annotations tab → select the segment → set the window with `[` and `]` (about one
   second before the action to one second after the outcome) → action and outcome from the
   vocabulary → subject from the roster with `verified` only when identified visually →
   `complete_event_set` → visibility → notes for anything a reviewer should see. Follow
   [LABELING_GUIDE.md](LABELING_GUIDE.md); `unknown` and `not_observable` are good labels.
7. **Review**: a second pass, ideally by another person or at least on another day: OK, Corrected
   (edit first, then mark) or Reject. Count disagreements (metric M3).
8. **Export**: library page → **Export snapshot now**. Profiles and candidate tables read only
   exported snapshots (DEC-03); the version number is shown on the library page.
9. **Check**: open one labelled player's profile → Reviewed observations shows a value with its
   coverage and interval; open a media-less player → the same rows read `unsupported` with a reason.

## 4. Metrics to record (per session, in PROGRESS "Pilot data")

| Id | Metric | How |
| --- | --- | --- |
| M1 | minutes from upload to Ready | state card timestamps / job `started_at`→`finished_at` (`GET /api/jobs?kind=probe_media`) |
| M2 | minutes of labeling per minute of live footage | wall clock ÷ live segment duration |
| M3 | review disagreements: `reviewed_corrected` + `rejected` over all reviewed | `GET /api/annotations?review_status=…` totals |
| M4 | alignment: links by method (`interpolated` vs `manual`) and median `timing_error_ms` | `event_video_links` |
| M5 | identity: share of annotations `verified` vs `asserted` vs `unknown` | `annotations.subject_identity_status` |
| M6 | coverage per labelled player: covered games / games played | profile "coverage" field |
| M7 | proposals accepted: detect-cuts segments kept as-is vs corrected vs rejected | `video_segments.origin = shot_boundary_model` by `review_status` |

SQL for M3–M7 (`sqlite3 data/nba/scouting.sqlite`):

```sql
SELECT review_status, COUNT(*) FROM annotations WHERE deleted_at IS NULL GROUP BY 1;
SELECT alignment_method, COUNT(*), MEDIAN(timing_error_ms) FROM event_video_links GROUP BY 1; -- MEDIAN: use DuckDB or order+limit in sqlite
SELECT subject_identity_status, COUNT(*) FROM annotations WHERE deleted_at IS NULL GROUP BY 1;
SELECT review_status, COUNT(*) FROM video_segments WHERE origin = 'shot_boundary_model' GROUP BY 1;
```

## 5. What the pilot decides

- Whether `drift_allowance = 30 ms per 10 s` is right (compare interpolated placements against
  manual checks on 20 events; revise VIDEO_PIPELINE §6 and record a DEC).
- Whether the vocabulary needs outcomes we kept writing in notes (propose v2, never edit v1).
- Whether shot-release anchors from `catch_and_shoot_3` windows are precise enough to seed E-03.
- Whether the labeling cost (M2) makes `complete_event_set` realistic beyond 12 games.

## 6. Status

See PROGRESS.md "Pilot data" for the live counts. As of 2026-10-09: **no pilot footage exists**.
The only managed assets ever registered were six synthetic test clips from the e2e suite, now
soft-deleted (the suite cleans up after itself from this date). External references: 2,128.
