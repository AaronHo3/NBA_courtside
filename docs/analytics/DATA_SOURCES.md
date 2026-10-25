# Data sources

All real data comes from `stats.nba.com` through the [`nba_api`](https://github.com/swar/nba_api)
Python package (pinned `>=1.11.4`). The browser never talks to the provider: every request is made
by `backend/app/ingestion`, cached as raw JSON, normalised into the Arrow schemas in
`backend/app/data/schemas.py`, written as Parquet under `data/nba/parquet/<family>/`, and recorded
in `data/nba/manifest.json`. Nothing under `data/` is committed.

Missing values are **null, never zero**. Column names are the provider's headers in snake_case; the
normalizers read the headers *from each response* (the `Advanced` measure type returns columns that
`nba_api`'s static header lists do not know about).

When no real data has been ingested the API serves the labelled synthetic `demo` namespace
(`backend/app/demo`). Demo rows carry `source == "demo-synthetic"`; real rows carry
`source == "nba_api"` (or `"nba_api static"` for the teams table).

## Families

Season labels are `YYYY-YY` (e.g. `2024-25`). "Calls per season" is per season *and* season type.
Season types: `Regular Season`, `Playoffs`, `Pre Season`.

### `teams`

| | |
| --- | --- |
| Endpoint | `nba_api.stats.static.teams.get_teams()` (bundled with the package; **no network**) |
| Parameters | none |
| First season | n/a (current 30 franchises) |
| Calls per season | 0 |
| Limitations | Conference/division are not in the static table; `normalize/teams.py` adds the current alignment. Historical abbreviations (NJN, NOH, NOK, SEA, VAN, CHH) are aliased to their current franchise for opponent resolution. |

### `players`

| | |
| --- | --- |
| Endpoint | `commonallplayers` with `IsOnlyCurrentSeason=0` |
| Enrichment (`player_bios` step, on demand) | `commonplayerinfo` with `PlayerID=<id>` — one call **per player** |
| First season | all players in the provider's directory (`FROM_YEAR`/`TO_YEAR` are parsed) |
| Calls per season | 1 for the directory; `player_bios` adds one call per player (cap with `--players-limit N`) |
| Limitations | The directory has no height/weight/birthdate; those come only from the per-player enrichment. Heights are roster-listed (`height_source = "roster-listed (stats.nba.com)"`), i.e. the team's listing, not a measured value — use `combine_anthro` for measured anthropometrics. `is_active` is the provider's `ROSTERSTATUS` flag. |

### `combine_anthro`

| | |
| --- | --- |
| Endpoint | `draftcombineplayeranthro` with `SeasonYear=<season>` |
| First season | `2000-01` (earlier seasons are marked `missing` without a call) |
| Calls per season | 1 (season-keyed only; season type is ignored) |
| Limitations | Only players who attended the combine *and* were measured appear; many top picks skip measurements, so coverage is incomplete and biased. Values are already in inches/pounds; blanks become null. |

### `player_season`

| | |
| --- | --- |
| Endpoint | `leaguedashplayerstats`, `PerMode=Totals`, `MeasureType=Base` and `Advanced` |
| Calls per season | 2 league-wide + 2 × 30 per-team (`TeamID=<id>`) = **62** |
| Grain | one row per player × team stint (`is_aggregate = false`); traded players get **one** extra league-wide row with `team_id = 0`, `team_abbreviation = "TOT"`, `is_aggregate = true` |
| Limitations | The league-wide response holds one row per player (already pooled across teams); it is kept only for players with more than one stint. If the league-wide row is missing, `app.analytics.aggregation.with_aggregate_rows` builds it from the stints (sums for counting stats, possession-weighted ratings). `efg_pct`, `ts_pct`, `fg_pct`, `ast_to` are recomputed from the stored totals with the public formulas. Per-team calls that fail are logged and the step is written as `partial`. |

### `games`

| | |
| --- | --- |
| Endpoint | none (derived locally from `team_game_logs`, both teams' rows; `source_endpoint = "derived:team_game_logs"`) |
| First season | whatever `team_game_logs` covers |
| Calls per season | 0 |
| Grain | one row per game: `game_id` (string, leading zeros kept), `game_date`, `home_team_id`, `away_team_id`, `home_score`, `away_score`, `status = final`; `periods`, `attendance`, `arena` are null until a game-list endpoint is verified |
| Limitations | Neutral-site games (both rows say `@`: Mexico City, Paris, NBA Cup knockout rounds) carry `neutral_site = true`; their home/away slots are filled with the lower team id first because the logs name no host. A game with a single team row keeps both ids but the other side's score is null and the step is `partial`. Rows disagreeing on home/away or date are kept and counted in the manifest note. Run the `games` family after `team_game_logs`; if the logs are absent the step is `missing` with a note and makes no provider call. |

### `events`, `event_participants`, `event_id_map`

| | |
| --- | --- |
| Endpoint | `playbyplayv3` with `GameID=<game_id>` — one call **per game**; never part of `all` |
| How to run | `make ingest SEASONS="2024-25" FAMILIES=events` plus `--game-ids 0022400061,...` or `--games-limit N` via the CLI (`cd backend && uv run python -m app.ingestion.cli run --seasons 2024-25 --families events --games-limit 12`); without a game list the step is `missing` with a note. Results merge into the season file, so games can be added over time |
| Grain | `events`: one row per provider action (`source_event_system = pbp_v3`, `source_event_id = actionNumber`, `source_order` = position in the response, `duplicate_of` when an action number repeats), clock parsed to `clock_ms`, provider strings verbatim, the full action in `raw_json`. `event_participants`: one row per structured `personId` (`actor`, `substituted_out`, `jumper`); nothing is inferred from description text, so the incoming player of a substitution is not a participant. `event_id_map`: one row per shot in the covered games with `method` (`equal_ids` / `matched_on_clock_player_result`) and `confidence` (`exact` / `probable` / `ambiguous`) |
| First season | unknown beyond 2024-25; `playbyplayv2` returned an empty body for a 2024-25 game (2026-10-09) |
| Verified | 2026-10-09, 12 games of 2024-25: 5,998 actions, 2,128 field-goal actions = 2,128 shot rows, all 2,128 mapped `exact`; 371 actions (6 %) share an action number with a neighbour (e.g. turnover + steal); 467 team events carry no person |
| Limitations | Team events put the team id in `personId` (normalised to `team_id`, `person_id` null). A season needs 1,230 calls (~40 min at the default pacing); ingest the games you need. Defenders and lineups are never inferred from events. |

### `annotation_snapshots` (export, not ingested)

Typed Parquet export of reviewed annotations from the SQLite registry (one file per `snapshot_version`), consumed by the reviewed-observation traits. Never part of `make ingest`'s `all` and not generated by the demo; absent until the snapshot job (Phase B) runs. Readers take the latest version per season.

### External clip references (SQLite, not a Parquet family)

| | |
| --- | --- |
| Endpoint | `videoeventsasset` with `GameID`, `GameEventID` — one call per event, only when verifying availability (`python -m app.evidence.cli link-events --game-id ... --check N`) |
| What is stored | `video_assets(kind=external_reference)` with the provider events-page URL (`https://www.nba.com/stats/events/?GameID=...&GameEventID=...&flag=1`), an `event_video_links` row per field-goal event, a view-only `source_permissions` row and an `evidence_items(kind=external_reference, evidence_class=reference)` row. After a check: descriptive metadata only (description, period, teams, scores, clip uuid, duration) |
| What is never stored | the direct mp4/jpg URLs the endpoint returns; they stay in the raw cache (`data/nba/raw/video_refs/`) and nothing is downloaded or embedded |
| Verified | 2026-10-09: 12 of 12 checked references for 2024-25 games were `available`; coverage for other seasons is unknown until checked |

### `team_season`

| | |
| --- | --- |
| Endpoint | `leaguedashteamstats`, `PerMode=Totals`, `MeasureType=Base`, `Advanced`, `Four Factors` |
| Calls per season | 3 |
| Limitations | Four-factor opponent columns map to `opp_efg_pct`, `opp_fta_rate`, `opp_tov_pct`, `opp_oreb_pct`. A failed Advanced/Four Factors call leaves those columns null and marks the entry `partial`. |

### `player_game_logs` / `team_game_logs`

| | |
| --- | --- |
| Endpoint | `playergamelogs` / `teamgamelogs` with `Season=<season>`, `SeasonType=<type>` |
| Calls per season | 1 each |
| Derived | `home` from `MATCHUP` (`"vs."` = home, `"@"` = away); `opponent_team_id` by resolving the opponent abbreviation through the `teams` table; `game_date` parsed to a date |
| Limitations | Opponent abbreviations not in the teams table (defunct franchises) resolve to null. |

### `shots` and `shot_league_zone_avg`

| | |
| --- | --- |
| Endpoint | `shotchartdetail` with `PlayerID=0`, `TeamID=0`, `ContextMeasure=FGA`, `Season=<season>`, `SeasonType=<type>` |
| Result sets | `Shot_Chart_Detail` → `shots`; `LeagueAverages` → `shot_league_zone_avg` |
| First season | `1996-97` (earlier seasons are marked `missing` without a call) |
| Calls per season | 1 league-wide (≈200k rows for a regular season); **fallback** 30 per-team calls (`TeamID=<id>`) if the league-wide call fails |
| On demand | `fetch_player_shots(player_id, season, season_type)` (`POST /api/shots/fetch-player`) fetches one player and merges into the season file, de-duplicating on `(game_id, game_event_id)` |
| Derived | `home` = shooting team is `HTM`; `opponent_team_id` from `HTM`/`VTM`; `SHOT_ZONE_BASIC/AREA/RANGE` labels are stored **verbatim** |
| Limitations | The league-wide call is the slowest request in the pipeline and the one most likely to time out; raise `NBA_REQUEST_TIMEOUT_SECONDS` or rely on the per-team fallback. Coordinates are the provider's tenths of feet relative to the basket. |

### `matchups`

| | |
| --- | --- |
| Endpoint | `leagueseasonmatchups`, `PerMode=Totals`, `Season=<season>`, `SeasonType=<type>` |
| First season | `2017-18` (earlier seasons are marked `missing` without a call) |
| Calls per season | 1; **fallback** 30 calls with `DefTeamID=<id>` |
| Limitations | Matchup attribution is the provider's tracking-based "primary defender" assignment; it is probabilistic, credits only one defender per possession and ignores help defence. `help_blk`, `help_fgm`, `help_fga` are frequently null in older seasons. `partial_poss` is fractional possessions, not possessions. |

### `defense_dash`

| | |
| --- | --- |
| Endpoint | `leaguedashptdefend`, `PerMode=Totals`, `DefenseCategory` ∈ `Overall`, `3 Pointers`, `2 Pointers`, `Less Than 6Ft`, `Less Than 10Ft`, `Greater Than 15Ft` |
| First season | `2013-14` (tracking data) |
| Calls per season | 6 |
| Mapping | `CLOSE_DEF_PERSON_ID → player_id`, `PLAYER_LAST_TEAM_ID → team_id`, `D_FGM/D_FGA`, `NORMAL_FG_PCT`, `FREQ`, `GP`, `G` |
| Limitations | "Defended" means closest defender at the time of the shot, not matchup. `team_id` is the player's *last* team in the season. |

### `lineups`

| | |
| --- | --- |
| Endpoint | `leaguedashlineups`, `GroupQuantity=5`, `PerMode=Totals`, `MeasureType=Base` and `Advanced` |
| Calls per season | 2 |
| Derived | `player_ids` parsed from `GROUP_ID` (`"-123-456-..."`) |
| Limitations | Lineup data exists from 2007-08; earlier seasons return empty sets (recorded as `missing`). |

### `on_off`

| | |
| --- | --- |
| Endpoint | `teamplayeronoffsummary`, `TeamID=<id>`, `MeasureType=Advanced`, `PerMode=Totals` |
| Calls per season | 30 |
| Mapping | `PlayersOnCourt…` rows → `court_status = "On"`, `PlayersOffCourt…` → `"Off"`, `VS_PLAYER_ID → player_id` |

### Call budget

A full regular season is roughly **110 requests** (62 player_season + 3 team_season + 2 logs +
2 lineups + 30 on_off + 6 defense_dash + 1 matchups + 1 shots + 1 combine), plus one `players`
directory call. At the default 1.5 s pacing that is a few minutes per season when the provider
answers promptly; the shot chart call itself can take 30-90 s.

## Provider behaviour and known blocks

* `stats.nba.com` rate-limits and blocks aggressive or unfamiliar clients; cloud IP ranges and some
  regions are blocked outright (TCP timeouts rather than HTTP errors). `python -m app.ingestion.cli
  probe` tells you whether it answers from your network. Use `NBA_PROXY` if you must route traffic.
* The provider sends `nba_api`'s browser-like headers; keep `NBA_REQUEST_DELAY_SECONDS` ≥ 1.
* Timeouts, connection errors and HTTP 408/425/429/5xx are retried with exponential backoff and
  jitter (`NBA_MAX_RETRIES`, default 4). Other HTTP errors fail immediately and are recorded.
* Provider schemas drift. Normalizers use the headers in each response and only map the columns
  the Arrow schema needs; unknown columns are ignored, missing columns become null.

## Caching, resume and freshness

* Every request is cached at `data/nba/raw/<family>/<sha1(endpoint + sorted params)>.json` with
  `{endpoint, params, fetched_at, source, payload}`. Re-running a step re-uses cached payloads, so a
  re-run after a crash costs no provider calls for the parts already downloaded.
* The manifest is rewritten after **every** step. A new run skips steps whose entry is `ok` or
  `partial`; `--refresh` forces re-download and re-write.
* Entries for an in-progress season (start year equals the current year, or the previous year
  before July) are marked `stale` once older than 24 h and are re-fetched on the next run, bypassing
  cache files older than 24 h.
* Seasons a family does not exist for are recorded as `missing` with a note and no provider call:
  `matchups` < 2017-18, `defense_dash` < 2013-14, `shots` < 1996-97, `combine_anthro` < 2000-01.
* A failed step is recorded as `failed` with the error message; the run continues with the next
  step. Steps with some failed sub-requests (e.g. one of 30 teams) are written with status
  `partial` and a note listing what failed.

Manifest statuses: `ok`, `partial`, `missing`, `stale`, `failed`.

## Commands

Run from the repository root (`backend/` uses `uv`):

```bash
# Is the provider reachable from here?
cd backend && uv run python -m app.ingestion.cli probe

# Ingest everything for one or more seasons (Regular Season by default)
cd backend && uv run python -m app.ingestion.cli run --seasons 2024-25 2023-24

# Only some families / season types; force re-download
cd backend && uv run python -m app.ingestion.cli run --seasons 2024-25 \
    --season-types "Regular Season" Playoffs --families player_season,shots --refresh

# Player bios (one call per player; cap it)
cd backend && uv run python -m app.ingestion.cli run --seasons 2024-25 --families player_bios --players-limit 200

# Coverage table for the real namespace
cd backend && uv run python -m app.ingestion.cli status

# Makefile shortcuts
make ingest SEASONS="2024-25 2023-24" FAMILIES=all
make ingest-status
```

The API exposes the same operations: `GET /api/ingestion/status`, `POST /api/ingestion/run`
(`{"seasons": ["2024-25"], "season_types": ["Regular Season"], "families": ["all"], "refresh": false}`,
returns 202), `GET /api/ingestion/progress`, `POST /api/ingestion/probe`, and
`POST /api/shots/fetch-player` (`{"player_id": 201939, "season": "2024-25", "season_type": "Regular Season"}`).
Once a run has written usable real data the API switches from the `demo` namespace to `nba`
without a restart (`NBA_NAMESPACE=auto`).
