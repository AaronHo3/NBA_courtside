# Current state of the repository (verified 2026-10-08)

Canonical home for: what exists today, which files matter for the scouting extension, what is
reusable, and where the overview supplied with the planning brief was wrong or stale. Other
documents link here instead of restating repository facts.

Verification method: direct inspection of files, `rg --files`, dependency lockfiles, the installed
`nba_api` package, local manifest files, and two offline commands (`pytest --collect-only`,
`vitest run`). No network calls were made for this plan.

## 1. Stack and versions (from lockfiles and installed packages)

| Layer | Verified value | Notes |
| --- | --- | --- |
| Python | 3.13.5 in `backend/.venv`; `requires-python >= 3.12`; `.python-version` = 3.13 | uv-managed (`backend/uv.lock`) |
| FastAPI / Pydantic | 0.142.4 / 2.13.5 (+ pydantic-settings 2.15) | envelope helpers in `backend/app/api/envelope.py` |
| DuckDB / PyArrow / pandas / NumPy / SciPy | 1.5.6 / 25.0.1 / 3.0.6 / 2.5.3 / 1.18.1 | pandas 3 (copy-on-write semantics) |
| nba_api | 1.11.4 | endpoints resolved by module name at runtime, see §4 |
| scikit-learn, structlog, httpx, python-dotenv | present in `pyproject.toml` | structlog is declared but the app uses stdlib `logging` |
| sqlite3 | stdlib module, SQLite 3.47.1 in the venv (CLI 3.50.4) | no SQLite usage in the app today |
| Test tooling | pytest 9.1.1, pytest-asyncio, pytest-cov, ruff 0.16.10, mypy | 253 tests collected (`pytest --collect-only`, 2026-10-08) |
| Frontend | React 19.3.0, react-router-dom 7.18.4, TypeScript 6.0.3, Vite 8.3.3, Tailwind 4.3.3, Plotly 4.1.2, D3 7.9, TanStack Query 5.104 / Table 8.21.3 / Virtual 3.14, zustand 5.0.15 | `frontend/package.json`, `node_modules` |
| Frontend tests | vitest 5.0.3 (17 files, 135 tests passed on 2026-10-08), Playwright 1.64 (2 spec files, API must be running; not executed for this plan) | |
| Media tooling | `ffmpeg` 9.0.2 and `ffprobe` installed via Homebrew on 2026-10-09 (were absent at planning time) | detection and bounded runs in `backend/app/evidence/ffmpeg.py` (B-01) |
| Hardware | Apple M4 Pro, 14 CPU cores, 20 GPU cores, 24 GB unified memory | no CUDA; CV must target CPU / Apple MPS / CoreML |

## 2. Directory structure that matters

```
backend/app/
  config.py                 Settings (env prefix-less: NBA_DATA_DIR, NBA_NAMESPACE, pacing, max_rows)
  main.py                   create_app(): resolves namespace, builds Database, IngestionManager, routers
  api/envelope.py           ok(), records(), clean(), install_error_handlers()
  api/deps.py               get_db / get_layout / get_settings_dep / get_namespace (from app.state)
  api/params.py             SeasonParam, SeasonTypeParam, Normalization, validators
  api/routers/              meta, players, league, shots, matchups, teams, rankings, ingestion
  analytics/                metrics, uncertainty, aggregation, court, shooting, percentiles, composite, catalog
  data/paths.py             DataLayout(root, namespace): parquet/<family>/, raw/, manifest.json
  data/schemas.py           Arrow schemas for the 17 families (13 original + `games` A-02 + `events`, `event_participants`, `event_id_map` A-04); FAMILIES, SEASONAL_FAMILIES, conform(), to_arrow()
  data/manifest.py          Manifest / ManifestEntry (status ok|missing|stale|failed|partial)
  data/parquet_io.py        write_family() (atomic tmp+replace, stamps source/fetched_at), read_family()
  data/db.py                Database: in-memory DuckDB, one view per family, threading.Lock, refresh()
  data/namespace.py         resolve_namespace(): forced | real-if-usable | demo
  data/repositories/        common, league, players, shots, matchups, teams, rankings
  ingestion/providers/      base.py (StatsProvider protocol, RawResponse), nba_api_provider.py
  ingestion/cache.py        raw JSON cache keyed sha1(endpoint + sorted params)
  ingestion/fetchers.py     StepContext.get(), StepOutput, FETCHERS dict, per-team shots
  ingestion/normalize/      one module per family; common.py helpers (result_set, pick, cast_to_schema)
  ingestion/pipeline.py     IngestionPlan / Step / StepResult / RunReport, iter_run(), run()
  ingestion/manager.py      IngestionManager: one daemon thread, progress list, on_complete callback
  ingestion/cli.py          `run`, `status`, `probe`
  demo/                     deterministic synthetic league (ids >= 9,000,001, source "demo-synthetic")
  verify.py                 `make verify`: season totals vs summed game logs
backend/tests/              analytics, api (TestClient over a small demo dataset), data, demo, ingestion
                            (FakeProvider over recorded fixtures), verify
frontend/src/
  routes.tsx                createBrowserRouter; lazy pages under AppShell
  components/layout/AppShell.tsx   NAV array, demo banner, namespace sync of the compare store
  lib/api.ts                apiGet/apiPost/unwrap (throws ApiError on !success), buildQuery
  lib/urlState.ts           useParam / useNumberParam / useBoolParam / useListParam / useResetParams
  lib/types.ts              Status, Metric, PlayerRow, PlayerProfile, ... (mirrors API payloads)
  hooks/useApi.ts           one TanStack Query hook per endpoint; `q()` helper
  hooks/useSeason.ts        global ?season=&type= context + coverage lookups
  store/compare.ts          zustand persist, key `courtside-compare-v2`, syncNamespace() resets on change
  components/{court,charts,table,ui}   CourtChart (SVG), Plot wrapper + validated palette, DataTable, primitives
  pages/                    LeagueExplorer, PlayerProfile, ShootingLab, MatchupExplorer, Compare, Teams,
                            TeamDetail, Rankings, Methodology (+ per-page folders)
docs/                       DATA_SOURCES.md, METHODOLOGY.md, LIMITATIONS.md, PLATFORM_OVERVIEW.md,
                            superpowers/{specs,plans}/2026-10-08-nba-analytics-*.md
data/                       gitignored: nba/{parquet,raw,manifest.json}, demo/{parquet,raw,manifest.json}
```

There is no `CLAUDE.md`, `AGENTS.md` or `.claude/` directory in the repository (the global
`~/.claude/AGENTS.md` and rules apply). This plan adds a minimal root `CLAUDE.md`.

## 3. Data layer facts the scouting work depends on

- **Layout**: `data/<namespace>/parquet/<family>/<family>__<season>__<season_type_slug>.parquet`
  (global families have a single file). Writes are atomic (`.parquet.tmp` then `replace`). Manifest
  is rewritten after every step.
- **DuckDB**: `Database` opens an in-memory connection and creates one view per family over
  `read_parquet(glob, union_by_name=true)`; a family with no files becomes an empty typed table.
  `refresh()` is called after ingestion by `main._make_on_complete`. All queries go through a lock.
  Adding a family means adding it to `_SCHEMAS` in `schemas.py`; `FAMILIES` drives view creation,
  `DataLayout`, the ingestion `ALLOWED_FAMILIES`, and the demo generator contract.
- **Namespace**: resolved once at startup (`NBA_NAMESPACE=auto|nba|demo`) and re-resolved after each
  ingestion run. `app.state.layout` and `app.state.db` are swapped when the namespace changes. No
  request can address another namespace. Demo ids are `>= 9,000,001` (players) and
  `>= 9,100,001` (teams); demo rows carry `source == "demo-synthetic"`.
- **Identifiers**: `game_id` is stored as a **string** (e.g. `0022400001`, leading zeros preserved)
  in `player_game_logs`, `team_game_logs`, `shots`. `shots.game_event_id` is an int64 copied from
  `shotchartdetail.GAME_EVENT_ID`. Shots are deduplicated on `(game_id, game_event_id)`.
- **Conventions** (confirmed in code): percentages are fractions (`player_season.tm_tov_pct` is divided
  by 100 on ingest); counting stats are totals, re-scaled by `normalize_counting()`; null never zero
  (`safe_div`, `series_safe_div`); traded players have stint rows plus one `is_aggregate` row with
  `team_id = 0`, and `one_row_player_season()` picks exactly one row per player; every family carries
  `source` and `fetched_at`; shot `loc_x/loc_y` are tenths of a foot from the hoop centre, provider
  zone labels verbatim.
- **Raw cache**: every provider response is kept as JSON under `data/nba/raw/<family>/<sha1>.json`
  (871 MB today for 30 seasons). Provenance (`endpoint`, `params`, `fetched_at`, `source`) is stored
  with the payload.

## 4. Provider access and endpoint resolution

`NbaApiProvider.fetch(endpoint_name, params)` resolves the `nba_api` class by importing
`nba_api.stats.endpoints.<name>` and matching `cls.endpoint`. Any endpoint that ships with
`nba_api` 1.11.4 is therefore reachable without provider code changes; only a fetcher + normalizer +
schema are needed. Pacing (1.5 s), timeout (30 s), bounded retries with jittered backoff and an
optional proxy come from `Settings`. The browser never contacts the provider.

Endpoint classes present in the installed package that matter for Phase A (names are **candidates
until a response is recorded**; see [DECISIONS.md](DECISIONS.md) DEC-07):

| Class / endpoint | Parameters (from the installed source) | Result sets declared |
| --- | --- | --- |
| `playbyplayv3` (**recorded 2026-10-09**: nested `game.actions`, 402 actions, 23 fields incl. `shotValue`; fixture `playbyplayv3__game_0022400061.json`) | `GameID`, `StartPeriod`, `EndPeriod` | `PlayByPlay`: gameId, actionNumber, clock, period, teamId, teamTricode, personId, playerName, playerNameI, xLegacy, yLegacy, shotDistance, shotResult, isFieldGoal, scoreHome, scoreAway, pointsTotal, location, description, actionType, subType, videoAvailable, actionId; `AvailableVideo`: videoAvailable |
| `playbyplayv2` (**recorded 2026-10-09: empty body `{}` for a 2024-25 game**) | `GameID`, `StartPeriod`, `EndPeriod` | `PlayByPlay`: GAME_ID, EVENTNUM, EVENTMSGTYPE, EVENTMSGACTIONTYPE, PERIOD, WCTIMESTRING, PCTIMESTRING, HOME/NEUTRAL/VISITORDESCRIPTION, SCORE, SCOREMARGIN, PERSON1..3TYPE, PLAYER1..3_ID/_NAME/_TEAM_*, VIDEO_AVAILABLE_FLAG |
| `gamerotation` (**recorded 2026-10-09: HTTP 500 for 0022400061, 8 attempts**) | `GameID` | `HomeTeam`/`AwayTeam`: GAME_ID, TEAM_ID, PERSON_ID, IN_TIME_REAL, OUT_TIME_REAL, PLAYER_PTS, PT_DIFF, USG_PCT |
| `boxscoretraditionalv3` (**recorded 2026-10-09**: nested `boxScoreTraditional.{home,away}Team.players`, 9 fields each + `statistics`) | `GameID`, ranges | `PlayerStats`, `TeamStats`, starters/bench |
| `videoeventsasset` / `videoevents` | `GameID`, `GameEventID` | `expected_data = {}` in the library. **Recorded 2026-10-09:** `resultSets.playlist` (17 fields) + `resultSets.Meta.videoUrls` (14 fields); fixture `videoeventsasset__game_0022400061__event_7.json` (URLs redacted) |
| `videodetailsasset` / `videodetails` | `TeamID`, `PlayerID`, `ContextMeasure`, `Season`, `SeasonType`, many nullable filters incl. `GameID` | `expected_data = {}` in the library. **Recorded 2026-10-09:** same playlist shape, one entry per FGA of the player in the game; fixture `videodetailsasset__game_0022400061__player_1628369.json` |
| `videostatus` | game date / league | declared result set |
| `leaguegamefinder`, `scoreboardv2/v3` | season / date | game lists (candidate source for the `games` family) |

Observed provider behaviour recorded in the repo (not re-tested here): residential connection works
with `nba_api`'s shipped headers; ad-hoc curl hangs; league-wide `shotchartdetail` silently caps at
102,400 rows (shots are fetched per team); per-team `leaguedashplayerstats` reports current team;
`leaguedashptdefend` has per-category column names.

## 5. Reusable services and exact entry points

| Need | Reuse | Signature |
| --- | --- | --- |
| Population for candidate search | `app.data.repositories.league.league_population` | `(db, season, season_type, normalization, PopulationFilters) -> DataFrame` (one row per player, context + on_off_net + derived rates + normalisation) |
| Filters | `PopulationFilters(team_id, position, min_gp, min_minutes, age_min, age_max, query, player_ids)` | frozen dataclass |
| Composite scoring | `app.analytics.composite.compute_composite` | `(df, [ComponentSpec(metric, weight, higher_is_better)], normalization="percentile"|"zscore", require_all=True)` returns `score`, `eligible`, `missing`, `contributions` |
| Percentiles | `app.analytics.percentiles.percentile_rank(s)` | mid-rank, 0–100, null-safe |
| Metric definitions | `app.analytics.catalog.METRICS`, `METRIC_INDEX`, `COUNTING_KEYS`, `catalog()` | served at `/api/meta/metrics` |
| Ranking lenses | `app.data.repositories.rankings.LENSES`, `rank()` | the role-template mechanism should wrap `rank()` rather than re-implement it |
| Uncertainty | `wilson_interval(successes, trials, z)`, `beta_shrink(...)`, `shrinkage_weight(trials, prior_strength)` | |
| Pooled stints | `app.analytics.aggregation.one_row_per_player_season`, `with_aggregate_rows`, `sum_then_ratio`, `weighted_mean` | |
| Court geometry | `app.analytics.court.provider_to_feet`, `feet_to_provider`, `classify_provider`, `half_court_geometry` | hoop-relative half-court frame; **no full-court frame exists** |
| Shot queries | `app.data.repositories.shots.markers/fetch/hexbins/zones`, `ShotFilters` | `markers()` returns `game_id, game_event_id, ...` per shot |
| Matchups | `app.data.repositories.matchups.offense/defense/pair/heatmap/defense_dashboard` | season aggregates only |
| Player profile payload | `/api/players/{id}` (`bio`, `measurements`, `seasons`, `career`, `timeline`) | |
| Background work pattern | `IngestionManager` (single daemon thread, `running` flag, progress list, `on_complete`) | not durable; see Architecture §5 for why a new worker is needed |
| API conventions | `ok(data, meta)`, `records(df)`, `clean()`, `HTTPException` -> envelope, 422 on validation | |
| Frontend conventions | `q()` hook helper, `useParam*`, `useSeason()`, `Panel`/`PageHeader`, `DataTable`, `CourtChart`, `useCompare` | |
| Test conventions | `tests/conftest.py` builds a small demo dataset once per session and a `TestClient`; ingestion tests use `FakeProvider` over `tests/fixtures/nba_api/*.json` | |

## 6. Existing background processing, file serving, jobs

- The only background work is `IngestionManager` (one `threading.Thread`, in-memory progress,
  `409` when busy). It is not durable: a crash loses `last_run`, nothing is persisted except the
  manifest and raw cache, and there is no cancellation or retry of a run.
- File serving: none. No `StaticFiles`, `FileResponse`, uploads, or range handling. The only
  non-JSON response is the CSV `StreamingResponse` in `routers/league.py`.
- SQLite state: added by task A-01 (2026-10-08): `backend/app/state/` opens `data/<namespace>/scouting.sqlite`
  (WAL, foreign keys, numbered SQL migrations, namespace guard); no ORM.
- No authentication, no deployment beyond `docker-compose.yml` (API + nginx-served frontend).

## 7. Existing event, video, agent or scouting work

At planning time: none. Since then A-02 added `games` and A-04 added the play-by-play layer
(`backend/app/events/`: `games.py`, `normalize_pbp.py`, `id_map.py`, `repository.py`; fetcher
`fetch_events`, CLI `--game-ids/--games-limit`). Still absent: possession or lineup-stint
reconstruction, the evidence model, media, annotations, agent.

## 8. Data loaded locally (as of 2026-10-08; not a repository fact, will change)

`data/nba/manifest.json`: 30 Regular Seasons (1996-97 to 2025-26), 222 entries, 192 `ok`,
26 `missing` (pre-publication seasons), 4 `partial`. Game-level families (shots, matchups,
defense_dash, on_off) are complete for 2021-22 through 2025-26; an ingestion process for older
seasons was still running during planning. Playoffs are not ingested. Parquet totals 35 MB, raw
cache 871 MB. Demo namespace covers 2016-17 to 2025-26 with detail for the last three seasons.

## 9. Discrepancies between the supplied overview and the repository

| Overview statement | Verified reality |
| --- | --- |
| "Python backend ... FastAPI exposes DuckDB-backed analytics under /api" | Correct. |
| "Reported data families: 13" | Correct, and `shot_league_zone_avg` is written by the `shots` step (alias). |
| "Reported reusable analytics: metrics, uncertainty, aggregation, court, shooting, percentiles, composite" | Correct, plus `catalog.py` (metric definitions), which the overview omitted and which the scouting traits must extend. |
| "Pages: league explorer, player profile, shooting lab, matchups, compare, teams/team detail, rankings, data and methods" | Correct; routes in `frontend/src/routes.tsx`. |
| "Percentages are fractions" | Correct, including the provider's `TM_TOV_PCT` which is divided by 100. |
| "Every statistical row carries source and fetched_at" | Correct for all 13 families. |
| "No play-by-play ... no video ... no contracts ... no authentication, deployment, or scheduled refresh" | Correct. `docker-compose.yml` exists but is a local convenience, not a deployment. |
| "Defender distance, shot clock, touch time not present in the shot dataset" | Correct; `shots` has only `shotchartdetail` columns. |
| "Python 3.13, uv, FastAPI, Pydantic v2, DuckDB, PyArrow, pandas, NumPy, SciPy, nba_api, React 19, TypeScript, Vite, Tailwind, Plotly, Vitest, Playwright" | Correct; exact versions in §1. Not mentioned: scikit-learn and structlog are declared dependencies, D3 and TanStack Virtual are used, TypeScript is 6.x, Vite is 8.x. |
| Implicit: "stats.nba.com is reachable from here" | True from this residential network with `nba_api` headers; the repo's earlier "unreachable" conclusion is recorded as a correction in the design spec. Treat reachability as per-network. |
| Implicit: "nba_api video endpoints exist" | Classes exist (`videoeventsasset`, `videodetailsasset`, `videoevents`, `videodetails`, `videostatus`) but their `expected_data` is empty in the library, so response shape and availability are unknown until recorded. |
| Not in overview | `ffmpeg`/`ffprobe` are not installed; there is no full-court coordinate frame; `IngestionManager` is a non-durable thread; the compare store resets on namespace change (relevant to shortlists). |

## 9b. State after Phase A (2026-10-09)

Packages added: `backend/app/state/` (SQLite per namespace, migrations 0001–0002), `backend/app/events/`
(`games`, `normalize_pbp`, `id_map`, `repository`), `backend/app/evidence/` (registry, evidence
items, availability, link_events, adapters, read, CLI), `backend/app/ingestion/capabilities.py`;
routers `games`, `events`, `evidence`, plus `/api/shots/{game}/{event}/evidence` and
`/api/meta/capabilities`. Frontend: `/games`, `/games/:gameId`, `components/evidence/*`, the
Shooting lab evidence panel, the Data & methods "Video coverage" section. Families: 17.
Tests at the end of Phase A: 375 backend, 143 vitest, 13 Playwright (552 backend, 171 vitest, 18 Playwright after B-09 on
2026-10-09). Since then: managed media, worker, segments, alignment, managed event links,
annotations, evidence lifecycle, snapshot export and the review frontend (B-01…B-09), traits and
profiles (C-01…C-06). Still absent: pilot data (B-10), copilot (Phase D), CV (Phase E).

## 10. Constraints inherited by the extension

1. `FAMILIES` is a closed tuple; new analytical families are added in `schemas.py` and become
   DuckDB views automatically. Demo generation must either produce the new families or leave them
   absent (the empty-view behaviour makes absence safe).
2. `Database` is in-memory and rebuilt on namespace change. SQLite state must be opened per
   namespace and swapped the same way (`app.state`).
3. `max_rows` / `max_shot_rows` caps apply to API payloads; evidence listings need the same caps.
4. The frontend's `unwrap()` throws on `success: false`; new endpoints must keep the envelope.
5. Position filters accept only `G|F|C` and match hyphenated positions by part.
6. Tests build demo data per session (~seconds); scouting tests must not require real data, video
   files, ffmpeg, or network. Capability-gated tests must skip with a reason, not fail.
