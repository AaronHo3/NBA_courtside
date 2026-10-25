# Computer vision roadmap

Canonical home for: staged CV capabilities, the chosen first task and why, annotation protocol for
training data, splits, model interfaces, runtime isolation, licensing and hardware assumptions,
measurement limitations, coordinate frames, and promotion gates. Feature storage is `video_features`,
`tracks`, `identity_assignments`, `court_calibrations` in [DATA_MODEL.md](DATA_MODEL.md) §7.

## 1. Stages

| Stage | Capability | Depends on | Output tables | Status gate |
| --- | --- | --- | --- | --- |
| 1 Basic media handling | thumbnails, shot (camera cut) boundaries, segment navigation, replay-detection **proposals** | ffmpeg only, no ML | `video_derivatives`, `video_segments(origin=shot_boundary_model)` | B phase; proposals always reviewed |
| 2 Assisted annotation | bounded person detection + short-term tracking inside a reviewed segment; action label **proposals** for the vocabulary subset `catch_and_shoot_3 / pull_up_shot / drive` using event context | stage 1, `cv/` runtime | `tracks`, `annotations(label_source=model)` | E phase; proposals never auto-reviewed |
| 3 Court mapping | manual landmark tool, homography per camera cut, ground-plane positions for track contact points, documented transforms | stage 2 | `court_calibrations`, `video_features(status=experimental)` | E phase |
| 4 Narrow behaviour task | one action (first candidate: closeout contest detection) using positions + events | stage 3 | `video_features`, proposals | later; only after stage 3 validation |

Not promised as MVP: full-game multi-object tracking, automatic player identification, defender
distance as a provider-equivalent field.

## 2. Runtime isolation (DEC-14)

`cv/` is a separate uv project. Contract with the worker:

```
uv run --project cv python -m cv.tasks.<task> --job /path/job.json --out /path/result.json
job.json:    {"task": "shot_release", "asset_playback": "<abs path>", "segments": [{"segment_id","start_ms","end_ms"}],
              "event_hints": [{"event_key", "clock_ms"}], "params": {...}, "model_version": "..."}
result.json: {"task", "model_version", "runtime": {"device": "cpu|mps", "seconds": ..}, "outputs": [...], "warnings": [...]}
```

Outputs larger than a few KB (per-frame tracks) are written as Parquet next to `result.json` and
referenced by path + sha256. The worker validates `result.json` against a pydantic schema before
inserting rows. `cv_runtime_available()` checks the venv and a `--selftest` call.

Hardware assumption (verified machine): Apple M4 Pro, 24 GB unified memory, no CUDA. Every model
must run on CPU; MPS acceleration is optional. Batch sizes and frame sampling are parameters.

## 3. First CV task: shot-release moment detection in event-linked clips (DEC-15)

**Task**: given a live segment linked to a known field-goal event (from `events` via
`event_video_links`), find the media timestamp of the shooter's release.

Why this first:
- No identity required (the event already names the shooter; the model finds the moment, not the
  person).
- Ground truth is cheap: a labeler scrubs to the release frame (±1 frame), the same action already
  performed when placing manual anchors.
- Direct product value: automatically proposes `alignment_anchors(method=cv_shot_release)`
  because the provider clock at a shot event is known from `events.clock_ms`, and produces the
  best thumbnail for the evidence card.
- Clear metric: absolute error in milliseconds between predicted and labelled release; coverage
  (fraction of clips where a confident prediction is emitted).

Interface: input segment window ±4 s around the expected moment (from existing anchors or the
provider clip start), output `{release_ms, score_raw, candidates: [...]}`. Baseline approaches, in
order of complexity: (a) motion-energy heuristic peaks (no ML), (b) pose-based wrist-above-head
detector on sampled frames, (c) small temporal classifier. Promotion requires beating (a).

Reference dataset: the pilot's reviewed segments (target 150–250, DECISIONS DEC-16), labelled by the
user with the in-app anchor tool, split by **game** (never by clip): train 60 % / validation 20 % /
held-out test 20 % of games, stratified by camera view. Metrics reported on held-out games only.

## 4. Annotation protocol for CV training data

- Labels come from the same `annotations` and `alignment_anchors` tables with
  `label_source = human`; model proposals are separate rows (`label_source = model:...`) and never
  overwrite human rows.
- Each labelled clip records `view`, `visibility`, venue (from `games.arena` or manual) so splits
  can be stratified and camera/venue variation measured.
- Disagreement: two labels for the same item are kept as revisions; the evaluation uses the
  reviewed head and reports inter-labeler difference when available.
- Review load estimate is recorded per task (minutes per clip) so the plan's "manual review load"
  stays a measurement, not a guess.

## 5. Coordinate frames and transforms

- Image frame: pixels, origin top-left.
- Court frame `full_court_v1` (VIDEO_PIPELINE §10): feet, origin centre court, ±47 × ±25.
- Hoop-relative shots frame: tenths of a foot, origin at the attacked hoop (existing).
- Transforms: image -> court via `court_calibrations.homography_json` valid only within
  `[valid_from_ms, valid_to_ms]` of one camera shot; court -> hoop-relative via
  `court.full_court_to_hoop_relative()` using the segment's `attacking_direction`.
- Ground contact: a player's court position is estimated from the **bottom-centre of the bounding
  box** (feet), not the box centre, and only when the feet are visible (`visibility = full`);
  jumping players get `airborne = true` and no position. The ball is never projected with the
  planar homography.

## 6. Licensing review (required before any weights are used)

| Component | Candidate | License concern | Decision rule |
| --- | --- | --- | --- |
| Person detector | RT-DETR / DETR variants (Apache-2.0), YOLO family (AGPL-3.0 for Ultralytics weights/code) | AGPL obligations if the product is distributed | prefer Apache-2.0/MIT; AGPL only while private and unshipped (Q-7) |
| Pose | RTMPose / ViTPose (Apache-2.0), MediaPipe (Apache-2.0) | model card restrictions | record license + model card in `docs/scouting/models/<name>.md` |
| Tracker | ByteTrack / OC-SORT (MIT) | none significant | |
| OCR (optional, score bug) | Tesseract (Apache-2.0), PaddleOCR (Apache-2.0) | | |

Datasets used for pretraining are noted; no additional external basketball datasets are downloaded
without recording their terms.

## 7. Measurement limitations (stated in the UI wherever a feature appears)

- Box centres are not ground positions; occlusion and crowd scenes break tracking; identity errors
  propagate to every downstream feature, which is why identity stays a reviewed assignment.
- Broadcast cameras pan and zoom; a calibration is valid for one camera shot only.
- Planar mapping is wrong for airborne points and for the ball.
- Vision-derived "defender distance" is experimental, stored separately, and never merges into
  provider shot rows or shot filters until validated (gate below).
- No biomechanics, injury-risk, effort or tactical-assignment claims: the pipeline measures
  positions and moments, not intent or load.

## 8. Promotion gates (`video_features.status: experimental -> validated`)

A feature is promoted only when all hold, recorded in `docs/scouting/evals/<feature>-<date>.md`:

1. Evaluated on held-out **games** not used for development, ≥ 3 venues / camera setups.
2. Task metric meets its provisional threshold: shot-release |error| median ≤ 100 ms and 90th
   percentile ≤ 250 ms on held-out clips with coverage ≥ 80 %; court position error ≤ 2 ft median on
   labelled landmarks; identity proposals ≥ 95 % precision at the operating threshold (recall is
   allowed to be low). Thresholds are **provisional** and must be justified against pilot data
   before being treated as targets.
3. Manual review load measured and acceptable (minutes per clip documented).
4. Failure modes documented (occlusion, replays, graphics overlays).
5. The methodology page and `docs/METHODOLOGY.md` describe the feature, its error, and its status.

Demotion: any later evaluation below threshold returns the feature to `experimental` and marks
dependent evidence `stale`.
