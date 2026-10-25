# Courtside Research: platform overview (state as of 2026-10-08)

This document describes exactly what the platform contains and can do today, so that anyone (or any
AI assistant) extending it starts from facts. Repository: `nba_player_analysis`. Local-first; nothing
is deployed. Code is TypeScript (frontend) and Python (backend). Tests: 253 pytest, 134 vitest,
9 Playwright smoke tests, all passing.

## 1. Architecture in one paragraph

A Python ingestion pipeline pulls data from stats.nba.com through the `nba_api` library, caches every
raw JSON response under `data/nba/raw/`, normalises it into typed Parquet files under
`data/nba/parquet/<family>/`, and records status per (family, season, season type) in
`data/nba/manifest.json`. A FastAPI backend (`backend/app`) exposes those files through DuckDB views
as a JSON API under `/api`. A React 19 + Vite + Tailwind frontend (`frontend/src`) renders eight
pages with Plotly.js charts, a D3/SVG court, TanStack Table/Query, and URL-encoded view state. A
second, fully synthetic namespace (`demo`, fictional teams and players, ids ≥ 9,000,000) exists for
development when the provider is unavailable; the API serves one namespace at a time and the UI shows
an amber banner whenever the demo is served. The browser never contacts the provider.

Stack: Python 3.13, uv, FastAPI, Pydantic v2, pandas, NumPy, SciPy, DuckDB, PyArrow, nba_api 1.11.4;
React 19, TypeScript, Vite 8, Tailwind v4, plotly.js 4, d3, @tanstack/react-table v8, react-query v5,
react-router 7, zustand 5, vitest, Playwright.

## 2. Data currently loaded (real namespace `nba`)

Seasons: Regular Season for 1996-97 through 2025-26 (30 seasons) are loading; as of writing, season
summaries exist for all 30 and game-level detail is complete for 2021-22 through 2025-26 with older
seasons filling in. Playoffs and Pre Season are supported by the pipeline but not yet ingested. Three
seasons (2004-05, 2006-07, 2016-17) have `partial` player-season rows from provider timeouts; a rerun
of the same command repairs them. The provider does not publish: matchups before 2017-18, defense
dashboards before 2013-14, lineups and on/off before roughly 2007-08, shot locations before 1996-97,
combine measurements before 2000-01. Those cells are `missing` with a note, never fabricated.

Dataset families (one Parquet directory each; columns are snake_case; missing values are null, never 0):

| Family | Grain | Source endpoint | Key columns |
| --- | --- | --- | --- |
| `teams` | team | `nba_api` static table | team_id, abbreviation, full_name, conference, division |
| `players` | player (5,235 all-time) | `commonallplayers` + `commonplayerinfo` bios on demand | full_name, birthdate, country, school, position (G/F/C, hyphenated combos like F-G), height_in (roster-listed, usually with shoes), weight_lb, draft_year/round/number, from_year, to_year, is_active, height_source |
| `combine_anthro` | player × combine year | `draftcombineplayeranthro` | height_wo_shoes_in, height_w_shoes_in, weight_lb, wingspan_in, standing_reach_in, body_fat_pct, hand_length_in, hand_width_in, combine_season |
| `player_season` | player × season × season type × team stint, plus one aggregate row (team_id 0, "TOT", is_aggregate true) per traded player | `leaguedashplayerstats` Base + Advanced, league-wide plus one call per team | gp, w, l, min, fgm, fga, fg3m, fg3a, ftm, fta, oreb, dreb, reb, ast, tov, stl, blk, blka, pf, pfd, pts, plus_minus, dd2, td3, age, off_rating, def_rating, net_rating, ast_pct, ast_to, ast_ratio, oreb_pct, dreb_pct, reb_pct, tm_tov_pct, efg_pct, ts_pct, usg_pct, pace, pie, poss |
| `player_game_logs` | player × game | `playergamelogs` | game_id, game_date, matchup, home, opponent_team_id, wl, full box line, plus_minus |
| `team_season` | team × season × season type | `leaguedashteamstats` Base + Advanced + Four Factors | box totals, w, l, off/def/net_rating, pace, poss, pie, efg_pct, ts_pct, fta_rate, tm_tov_pct, oreb_pct, opp_efg_pct, opp_fta_rate, opp_tov_pct, opp_oreb_pct, ast_pct, ast_to, reb_pct |
| `team_game_logs` | team × game | `teamgamelogs` | as player game logs, team level |
| `games` | game (derived from both teams' game logs; no provider call) | `derived:team_game_logs` | game_id (string, leading zeros), game_date, home_team_id, away_team_id, home_score, away_score, status, neutral_site |
| `events` | play-by-play action (per game, on demand) | `playbyplayv3` | source_event_id (actionNumber), source_order, duplicate_of, period, clock_ms, action_type, sub_type, description, team_id, person_id, is_field_goal, shot_result, shot_value, x_legacy, y_legacy, score_home/away, video_available, raw_json |
| `event_participants` | event × structured participant | `playbyplayv3` | role (actor, substituted_out, jumper), person_id, team_id, source_slot |
| `event_id_map` | shot × play-by-play action | derived | pbp_v3_action_number, shots_game_event_id, method, confidence, verified_at |
| `shots` | shot event (≈219,000 per season) | `shotchartdetail` per team (league-wide call is capped at 102,400 rows, so never used) | game_id, game_event_id, player_id, team_id, opponent_team_id, game_date, home, period, minutes/seconds_remaining, event_type, action_type, shot_type (2PT/3PT), shot_zone_basic/area/range (provider labels kept verbatim), shot_distance, loc_x, loc_y (tenths of a foot from the hoop centre), shot_made_flag |
| `shot_league_zone_avg` | season × provider zone | `shotchartdetail` LeagueAverages | fga, fgm per zone |
| `matchups` | offensive player × defensive player × season (≈140,000 pairs per season) | `leagueseasonmatchups` | gp, matchup_min, partial_poss, player_pts, team_pts, matchup_ast/tov/blk, matchup_fgm/fga/fg3m/fg3a/ftm/fta, sfl; help_* columns are null |
| `defense_dash` | defender × defense category × season | `leaguedashptdefend` for Overall, 3 Pointers, 2 Pointers, Less Than 6Ft, Less Than 10Ft, Greater Than 15Ft | gp, g, freq, d_fgm, d_fga, normal_fg_pct |
| `lineups` | five-man lineup × team × season | `leaguedashlineups` Base + Advanced | group_id, group_name, player_ids, gp, w, l, min, poss, box totals, off/def/net_rating, pace |
| `on_off` | team × player × season × court status (On/Off) | `teamplayeronoffsummary` | gp, min, plus_minus, off_rating, def_rating, net_rating |

Conventions that every consumer relies on:

- Every percentage column (fg_pct, ts_pct, usg_pct, ast_pct, reb_pct, tm_tov_pct, four factors) is a
  **fraction** (0.283, not 28.3). The provider's player `TM_TOV_PCT` arrives as 0-100 and is divided by
  100 on ingest.
- Counting stats are stored as season **totals**; per game / per 36 / per 100 possessions are computed
  on request (per 100 only when `poss` is present).
- Traded players: stint rows carry the team from the request filter (the provider stamps rows with the
  player's current team); league-level queries use the aggregate row where one exists.
- Shot coordinates: origin at the hoop centre, x to the right as seen from behind the basket, y toward
  half court, units are tenths of a foot. Court geometry constants live in
  `backend/app/analytics/court.py` and are served by `/api/meta/court`.
- Every row carries `source` and `fetched_at`.

Provider access: works from a residential US connection with `nba_api`'s shipped headers at a 1.5 s
request delay with retries and backoff; the provider's edge holds clients without modern Chrome
headers, so ad-hoc curl requests hang. Test with `uv run python -m app.ingestion.cli probe`.

## 3. Backend analytics (tested, reusable; `backend/app/analytics/`)

- `metrics.py`: null-safe eFG% = (FGM + 0.5·3PM)/FGA, TS% = PTS/(2·(FGA + 0.44·FTA)) with 0.44 labelled
  an approximation, per-36, per-100, per-game, AST/TO, points per FGA (never called per possession).
- `uncertainty.py`: Wilson 95% intervals; Beta shrinkage of proportions toward a prior with strength
  expressed in pseudo-attempts.
- `aggregation.py`: sum-then-ratio pooling; traded-player stint handling with possession-weighted
  ratings; multi-game percentages always from pooled totals.
- `court.py`: regulation geometry, provider coordinate conversion, three-point line test, provider
  zone classifiers (basic, area, range).
- `shooting.py`: pointy-top hexagonal binning (axial coordinates, configurable size), per-bin FGA, FGM,
  FG%, Wilson interval, low-sample flag, points per FGA, frequency share, league FG% in the bin's
  provider zone and the difference; provider-zone summaries.
- `percentiles.py`: mid-rank percentiles within a population, lower-is-better flipping.
- `composite.py`: transparent weighted composites; percentile or z-score normalisation within the
  eligible cohort; a player missing any component is ineligible rather than re-weighted; every
  component's raw value, normalised value, weight and contribution is returned.

## 4. API (FastAPI, `backend/app/api/routers/`; every response is `{success, data, error, meta}`)

- `GET /api/meta/status` (namespace, is_demo, seasons, default season, coverage matrix, available
  families), `/api/meta/metrics` (metric catalog: key, label, kind, definition, formula, direction,
  source), `/api/meta/court`, `/api/meta/teams`, `/api/meta/manifest`.
- `GET /api/players/search?q=`, `/api/players/{id}` (bio, roster and combine measurements with
  provenance, all season rows incl. stints and TOT rows, pooled career totals, team timeline),
  `/api/players/{id}/percentiles?season&population=all|position|team|custom&ids&min_minutes&normalization`.
- `GET /api/league/explorer?season&season_type&normalization=totals|per_game|per_36|per_100&team_id&position=G|F|C&min_gp&min_minutes&age_min&age_max&q`
  (one row per player with box, advanced, physical and on/off columns) and `/api/league/explorer.csv`.
- `GET /api/shots/markers|hexbins|zones|filters|league-zones` with `player_id` (up to 12, comma
  separated) and/or `team_id`, plus opponent, period, shot type, made, distance range, date range,
  game, zone, action type, home/away; `size_ft` and `min_attempts` for bins; markers capped at 20,000.
  `POST /api/shots/fetch-player` triggers an on-demand fetch in the real namespace.
- `GET /api/matchups/offense/{id}` and `/defense/{id}` (raw FG%, shrunk FG% with the prior's mean and
  strength, Wilson interval, points per partial possession, qualification by `min_poss`),
  `/api/matchups/pair`, `/api/matchups/heatmap?team_id&opponent_team_id`, `/api/matchups/availability`,
  `/api/defense/{id}` (defense dashboard with d_fg_pct − normal_fg_pct).
- `GET /api/teams`, `/api/teams/league?season`, `/api/teams/roster-metrics?season` (usage Gini,
  top-three minutes share, continuity, minutes-weighted height and age, 3PA rate), `/api/teams/{id}/seasons`,
  `/api/teams/{id}/season?season&min_lineup_poss` (team row, roster contributions with shares,
  lineups, on/off, stints with first and last game).
- `GET /api/rankings/lenses`, `/api/rankings?season&lens&mode=rate|cumulative&normalization=percentile|zscore&min_gp&min_minutes&position`,
  `POST /api/rankings/custom` with user-defined components.
- `GET /api/ingestion/status|progress`, `POST /api/ingestion/run|probe`.

### Added by the scouting extension (2026-10-09)

| Route | Returns |
| --- | --- |
| `GET /api/games?season=&season_type=&limit=&offset=` | games of a season (derived family), paginated |
| `GET /api/games/{game_id}` | one game plus coverage counts (events ingested, shots, mapped shots, evidence items) |
| `GET /api/games/{game_id}/events?period=&action_type=&person_id=&is_field_goal=&limit=&offset=` | play-by-play events in source order; `meta.coverage` explains an empty result |
| `GET /api/events/{system}/{game_id}/{event_id}` | one event with every duplicate copy, participants, the mapped shot (with map method/confidence) and its evidence items (external references carry `reference.external_url`, `availability`, metadata; never media URLs) |
| `GET /api/shots/{game_id}/{game_event_id}/evidence` | the event and evidence behind one shot via `event_id_map`; `data: null` with `meta.reason` when unmapped |
| `GET /api/evidence?player_id=&game_id=&kind=&status=&review_status=&limit=&offset=` | evidence items of the active namespace, paginated (limit ≤ 200) |
| `GET /api/evidence/{evidence_id}` | one item with its referent (link, asset, permissions); 404 outside the active namespace |
| `GET /api/meta/capabilities` | ffmpeg, CV runtime, LLM provider, worker, configured video sources, state database version |
| `POST /api/media/uploads`, `GET /api/media[/{id}]`, `DELETE /api/media/{id}` | authorised local uploads (streamed, size-capped, content-sniffed, deduplicated by hash) with a permission statement per upload and a probe job that records duration, dimensions, frame rate, time base and codecs; local-only (not mounted in public read-only mode) |
| `GET/HEAD /api/media/{id}/playback`, `GET /api/media/{id}/thumbs[/{n}]` | browser playback of the managed derivative with Range support, and thumbnails; both refused (403) unless the asset's recorded permissions allow them |
| `GET/POST/PATCH /api/media/{id}/segments`, `GET/POST/PATCH /api/media/{id}/anchors`, `GET /api/media/{id}/alignment/place?period&clock_ms`, `GET /api/media/{id}/alignment/validate`, `POST /api/media/{id}/jobs/detect-boundaries` | video segments (live / replay / unknown / non-game) with review status, clock anchors that belong to one live segment, placement of a game clock on the media timeline by interpolation within a segment and period only (with a stated error), a rule-by-rule validation report, and an ffmpeg cut-detection job that proposes unreviewed segments (needs the `thumbnail` permission); local-only |
| `POST /api/events/{system}/{game_id}/{event_id}/links`, `PATCH /api/evidence/links/{link_id}` | link a play-by-play event to a segment of an authorised managed asset, either by hand (window inside the segment) or by interpolation between the segment's clock anchors (derived window with a stated timing error and the anchors used); each link becomes a citable `video_segment` evidence item carrying the event's participants, and review marks propagate to it; local-only |
| `GET /api/games/{game_id}/roster` | both teams' players for a game from the player game logs, with names where the players table has them; the subject picker for annotations |
| `POST /api/media/{id}/jobs/retry` | enqueue a fresh probe for an asset whose processing failed or never ran; chains playback and thumbnails when the permissions allow; local-only |
| `GET /api/annotations/vocabulary`, `GET/POST /api/annotations`, `GET/PATCH/DELETE /api/annotations/{id}`, `POST /api/annotations/{id}/review` | observable-action annotations on a segment window (vocabulary v1 with outcome validation, mandatory sampling method, visibility, identity status that must match the presence of a player id, demo/real id separation); every save, review and soft delete appends a revision with a diff; free-text notes are stored verbatim, searchable, and returned under a content field marked untrusted; local-only |
| `GET /api/snapshots`, `POST /api/snapshots/export`, `POST /api/media/purge` | versioned Parquet snapshots of evidence items and annotations (the read model DuckDB joins to player seasons; readers take the latest version), and the retention job that removes files of soft-deleted assets after the purge window while keeping anything active evidence still cites; local-only |
| `GET /api/jobs?status=&kind=`, `GET /api/jobs/{id}`, `POST /api/jobs/{id}/cancel` | the durable job queue (media processing, snapshots): status, attempts, lease, progress, events |
| `GET /api/scouting/traits` | the trait registry (definitions, units, qualification, limitations, version) |
| `GET /api/scouting/traits/{player_id}?season=&keys=&min_gp=&min_minutes=&position=` | trait records for one player: value, interval, percentile within the qualified cohort, sample, coverage, qualification result, limitations |
| `GET /api/scouting/roles`, `GET /api/scouting/roles/{id}`, `POST /api/scouting/roles` | built-in and saved role templates (components, filters, caveats, cohort defaults) |
| `GET /api/scouting/profiles/{player_id}?season=&min_gp=&min_minutes=&position=` | a profile: statistical traits, reviewed-observation traits (unsupported until annotations exist), measurements with provenance, stints, evidence ids, snapshot id and data fingerprint; `GET .../snapshots` lists stored snapshots with `stale` |
| `GET/POST /api/scouting/shortlists`, `GET/PATCH/DELETE /api/scouting/shortlists/{id}`, `POST .../entries`, `PATCH/DELETE .../entries/{player_id}` | saved candidate lists (from a role template's top-N or explicit player ids) with the ranking context frozen at save time; pin and note per entry; namespace-bound |
| `GET/POST /api/scouting/reports`, `GET/PATCH /api/scouting/reports/{id}`, `POST .../claims` | deterministic report drafts from a shortlist or player ids (sections per evidence class, Markdown), claim validation (evidence must exist and be active, numbers must match, labels never upgrade), interpretation text and draft/final status |
| `GET /api/scouting/candidates?role=&season=&min_gp=&min_minutes=&position=&limit=&offset=`, `POST /api/scouting/candidates` (custom template) | ranked candidates with score, eligibility, missing components, contributions, trait values, video-coverage label; `meta` has the funnel, template, registry version, data fingerprint and disclaimer |

## 5. Frontend pages (`frontend/src/pages/`) and what each can do today

1. **League explorer** (`/`): every qualified player on one scatter; any numeric metric on x, y, bubble
   size and colour (categorical for position, sequential for numbers); presets (usage vs TS%, volume
   vs efficiency, assists vs turnovers, offense vs defense, age vs productivity, wingspan vs blocks,
   on/off vs minutes); filters for team, position, min games, min minutes, age, text; normalisation
   toggle; median lines; hover cards; click opens the profile; lasso/box select adds players to the
   comparison group; linked virtualised table with sort and filter; CSV export (server-side and
   client-side).
2. **Player profile** (`/players/:id`): bio and measurements with provenance (roster vs combine never
   mixed; wingspan-to-height ratio only when measured); career timeline with stints; season table with
   stint and TOT rows and per game / per 36 / totals; trend small multiples across seasons;
   season-in-focus tiles; percentiles against all qualified, positional peers, teammates or the
   comparison group; zone shooting summary; top matchups as scorer and as defender; defense dashboard.
3. **Shooting lab** (`/shooting`): SVG half court from served geometry; layers for markers (made/missed),
   hexbins (size or opacity = frequency, colour = FG%, FG% relative to league zone average, or points
   per FGA on fixed, comparable colour domains), provider zones, and density; adjustable hex size and
   low-sample threshold; every filter the shot data supports, with unsupported ones (defender distance,
   shot clock, touch time) explained; click a bin or zone to get attempts, makes, FG%, Wilson interval,
   league FG%, relative FG%, points per FGA and the filtered shot table; subject B for side-by-side or
   per-bin difference views (another player, a team, or the same player in another season); CSV export.
4. **Matchups** (`/matchups`): a player as scorer (which defenders he saw, with raw and shrunk FG%,
   intervals, points per possession) or as defender; qualification threshold and prior strength
   controls; "lowest/highest observed efficiency among qualifying matchups" callouts (never "worst
   matchup"); dot chart with error bars; pair detail across seasons; team-pair heatmap of scorers vs
   defenders; defense dashboard by category; explicit attribution caveats.
5. **Compare** (`/compare?ids=`): two to six players; aligned small multiples for production,
   shooting efficiency, passing and turnovers, rebounding, defensive indicators, usage and role,
   impact indicators, physical measurements; full metric table with best-per-row highlighting and
   CSV; career trajectories aligned by season, age or career year; zone shot profiles; optional radar
   with stated percentile normalisation and cohort sizes; group synced between URL and persisted store.
6. **Teams** (`/teams`) and **Team detail** (`/teams/:id`): league table with four factors; team
   profile scatter with direct labels; roster-shape vs outcome associations with Pearson r and n;
   multi-team comparison and net-rating trends; per team: trends across seasons, roster minute and
   point shares, stint Gantt (who played when, traded players marked), lineups with a minimum
   possession filter, on/off dumbbell chart, add-to-compare per player.
7. **Rankings** (`/rankings`): lenses (scoring efficiency, scoring production, playmaking, rebounding,
   defensive indicators, impact indicators, balanced) plus a custom composite builder with weights,
   direction, overlap warnings and URL encoding; rate vs cumulative toggle; percentile vs z-score;
   stacked contribution bars; per-player breakdown; ineligible players listed with what they lack.
8. **Data & methods** (`/methodology`): live namespace and ingestion status, coverage matrix, sources
   and retrieval times, metric definitions, thresholds, missing-data policy, uncertainty methods,
   shooting and matchup methodology, measurement provenance, demo description, known limitations.
   Mirrored in `docs/METHODOLOGY.md`, `docs/LIMITATIONS.md`, `docs/DATA_SOURCES.md`.

Cross-cutting: view state in the URL (shareable), global season and season-type picker, persisted
comparison group (reset when the namespace changes), dark and light themes, metric tooltips with
definition, formula and source everywhere, validated colour palette (categorical, sequential,
diverging), responsive to phone width, keyboard-operable controls.

### Added by the scouting extension (2026-10-09)

- **Games** (`/games`, `/games/:gameId`): every game of the season; a game page with teams, score,
  coverage counts, the paginated play-by-play (period and field-goal filters in the URL) and an event
  detail panel with source participants and clip references that open on the provider's site.
- **Evidence** (`/evidence`, `/evidence/:assetId`, local-only): footage you are authorised to use with its
  permission statement and processing state (ready, queued, no worker, no ffmpeg, failed with retry, permission
  unknown), a timeline of segments, clock anchors and annotations over HTML5 playback, event linking by
  interpolation or manual window, the vocabulary-driven annotation form with identity and sampling rules, review
  actions, evidence item filters and snapshot export. Player profiles gain an Evidence panel.
- **Shooting lab**: clicking a shot row (`?shot=<game>:<event>`) opens the event behind the shot via
  the verified id map, with its clip reference, or an explicit "no event mapped" state.
- **Data & methods**: a "Video coverage" section with evidence counts, reference states and machine
  capabilities (ffmpeg, CV runtime, LLM provider).
- **Scouting** (`/scouting`): role template picker (components, filters, caveats), cohort controls,
  ranked candidates with eligibility, contributions and a video-coverage label, a shortlist drawer
  (save top 20, add the compare group, pin/remove, draft a report); `/scouting/shortlists/:id` and
  `/scouting/reports/:id` (sections per evidence class, interpretation editor, claim list with
  validation badges, add-claim form, Markdown download, draft/final).
- **Player profile**: a scouting panel with statistical and reviewed-observation traits kept apart and
  the snapshot id; **Compare**: an evidence-coverage table per player.

## 6. Deliberately not implemented (don't assume these exist)

- No adjusted impact metrics (RAPM, EPM, RAPTOR, LEBRON or similar) and no play-by-play or possession
  parsing; impact indicators are the provider's PIE, net rating, plus-minus and raw on/off.
- No expected-shot-quality model (defender distance is not in the public shot data).
- No Playoffs or Pre Season data ingested yet (pipeline supports them via `--season-types`).
- No player tracking (speed, distance, touches), hustle stats, clutch splits, or box-score splits by
  month/opponent beyond what the shot filters provide.
- No authentication, no deployment, no scheduled refresh; everything runs locally via `make dev`.

## 7. Commands

```bash
make dev                                      # API :8000 + web :5173
make ingest SEASONS="2024-25" [FAMILIES=...]  # real data; resumable; see docs/DATA_SOURCES.md
make ingest SEASONS="2024-25" FAMILIES=player_bios   # bios for every ingested player lacking one
make ingest-status | make verify SEASON=2025-26 | make test | make e2e | make demo-data
```
