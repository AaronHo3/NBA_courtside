# NBA Player & Team Analytics Research Tool: Design Spec

Date: 2026-10-08
Status: Approved brief supplied by the user (see the pasted requirements); this document records the
interpretation, assumptions, and architecture used to build it.

## 1. Intent

An interactive, local-first research dashboard for exploring NBA players and teams from every
statistically defensible angle the public data supports: efficiency, shooting location tendencies,
offender/defender matchups, career development, physical measurements, team composition, and impact
indicators. The user is a developer and basketball-analytics enthusiast who wants to click around,
link selections across charts and tables, build comparison groups, and understand exactly where each
number comes from.

Success looks like: one command starts the app; the user can explore a league population, open a
player, inspect an interactive shot chart, compare players, explore teams and rosters, examine matchups
(or see why they're unavailable), tune transparent rankings, export CSV, and read the methodology.

## 2. Constraints discovered

> **Correction (2026-10-08, later the same day):** the "unreachable" finding below was wrong. Hand-written
> curl/requests calls hang because stats.nba.com's edge holds requests that lack the modern Chrome
> client-hint headers; `nba_api`'s shipped header set is answered in about one second from this
> network. The real pipeline was then run live for 2025-26 (all families) and verified against the
> provider's own game logs. The demo namespace remains the fallback for networks the provider blocks.


- **stats.nba.com is unreachable from the build network** (TCP connection times out both inside and
  outside the tool sandbox; GitHub/PyPI respond in <0.5 s). cdn.nba.com returns 403. This is the
  provider's well-known network block, not a transient error.
- Therefore the app ships with, and is verified against, a **deterministic synthetic demo namespace**
  that is visibly labeled everywhere. The real `nba_api` ingestion pipeline is fully implemented,
  unit-tested against recorded-shape fixtures, and switches the app to real data automatically once
  it has been run successfully on a network the provider allows.
- Synthetic data never shares a table, file, or ranking with real data. Namespaces: `nba` (real) and
  `demo` (synthetic). Demo players and teams have fictional names so nothing can be mistaken for a
  real statistic.
- basketball-reference.com is reachable but its terms prohibit automated scraping; it is not used.

## 3. Architecture

```
frontend/   React 19 + TypeScript + Vite + Tailwind v4; Plotly.js (charts), D3 (court SVG),
            TanStack Table/Query/Virtual, react-router (URL-encoded state), zustand (comparison group)
backend/    Python 3.13, FastAPI + Pydantic v2, pandas/NumPy/SciPy, DuckDB over Parquet
data/       (gitignored) raw/<namespace>/… JSON cache, parquet/<namespace>/<family>/…, manifest.json
docs/       DATA_SOURCES.md, METHODOLOGY.md, LIMITATIONS.md, this spec, the plan
```

The browser never talks to the NBA provider. All provider traffic is in `backend/app/ingestion`.

### Backend modules

| Module | Responsibility |
| --- | --- |
| `app/config.py` | Settings from env (`NBA_DATA_DIR`, `NBA_NAMESPACE=auto|nba|demo`, pacing, timeouts) |
| `app/ingestion/providers/base.py` | `StatsProvider` protocol: `fetch(dataset, params) -> RawResponse` |
| `app/ingestion/providers/nba_api_provider.py` | nba_api-backed provider with pacing, timeout, bounded retry + exponential backoff |
| `app/ingestion/cache.py` | Raw JSON cache keyed by dataset + params hash, with fetch timestamp + provenance |
| `app/ingestion/normalize/*.py` | One normalizer per dataset family: raw result sets → typed DataFrame with stable ids |
| `app/ingestion/pipeline.py` | Resumable job runner: plan → fetch → normalize → validate → write Parquet → manifest |
| `app/ingestion/manifest.py` | `manifest.json`: per (family, season, season_type): status ok/missing/stale/failed, row count, fetched_at, source |
| `app/demo/generate.py` | Seeded synthetic generator producing the same Parquet families under `demo/` |
| `app/data/db.py` | DuckDB connection with views over Parquet globs for the active namespace |
| `app/data/repositories/*.py` | Query functions (players, seasons, shots, matchups, teams, lineups, on/off) |
| `app/analytics/metrics.py` | eFG%, TS%, per-36, per-100 (poss-based), AST/TO, safe division |
| `app/analytics/uncertainty.py` | Wilson intervals, empirical-Bayes beta shrinkage |
| `app/analytics/court.py` | Court geometry constants, provider coordinate conversion, zone helpers |
| `app/analytics/shooting.py` | Hexbin / zone aggregation, league baselines, relative FG%, points per FGA |
| `app/analytics/percentiles.py` | Percentile ranks within a comparison population |
| `app/analytics/composite.py` | Transparent weighted composite with eligibility and contribution breakdown |
| `app/analytics/aggregation.py` | Weighted multi-row aggregation (traded players, multi-season) |
| `app/api/routers/*.py` | `/api/meta`, `/api/players`, `/api/league`, `/api/shots`, `/api/matchups`, `/api/teams`, `/api/rankings`, `/api/ingestion` |

### Data families (Parquet, partitioned by season + season_type where applicable)

| Family | Grain | Source endpoint (real) |
| --- | --- | --- |
| `players` | player | `commonallplayers` + `commonplayerinfo` (on demand) |
| `combine_anthro` | player × combine year | `draftcombineplayeranthro` |
| `player_season` | player × season × season_type × team (plus `is_aggregate` row for multi-team) | `leaguedashplayerstats` Base+Advanced, Totals |
| `player_game_logs` | player × game | `playergamelogs` |
| `team_season` | team × season × season_type | `leaguedashteamstats` Base+Advanced+Four Factors |
| `team_game_logs` | team × game | `teamgamelogs` |
| `shots` | shot event | `shotchartdetail` (league-wide per season, or per player on demand) |
| `shot_league_zone_avg` | season × zone | `shotchartdetail.LeagueAverages` |
| `matchups` | off player × def player × season | `leagueseasonmatchups` (2017-18+) |
| `defense_dash` | defender × defense category × season | `leaguedashptdefend` (2013-14+) |
| `lineups` | 5-man lineup × team × season | `leaguedashlineups` |
| `on_off` | team × player × season | `teamplayeronoffsummary` |

Missing values are null. Traded players: per-team rows are kept as stints; the provider's league-wide
row (TEAM_ID 0 / "TOT") is stored with `is_aggregate=true`, and league-level queries use exactly one
row per player-season.

### Frontend pages

League Explorer, Player Profile, Shooting Lab, Matchup Explorer, Compare, Team Explorer, Rankings,
Data & Methodology. State that defines a view (season, filters, axes, selected players) lives in the
URL; the comparison group persists in localStorage and is mirrored into URLs on the Compare page.

## 4. Analytical rules

- eFG% = (FGM + 0.5·3PM)/FGA; TS% = PTS / (2·(FGA + 0.44·FTA)); 0.44 labeled as an approximation.
- Zero denominators return null, never zero or infinity.
- Multi-row percentages are recomputed from summed numerators and denominators.
- Per-100-possession rates are offered only where a possessions column exists.
- Shooting bins carry attempts, makes, FG%, Wilson 95% interval, and a low-sample flag below a
  user-adjustable attempt threshold; relative FG% is the bin FG% minus league FG% in the same zone.
- Points per FGA = (2·2PM + 3·3PM)/FGA; never called points per possession.
- Matchup shooting percentages are shown raw and shrunk toward the league matchup FG% using a Beta
  prior whose strength is stated in attempts; "lowest observed efficiency among qualifying matchups"
  wording is used instead of "worst matchup".
- Composite rankings: each component is percentile- or z-normalized within the chosen population,
  signed for direction, weighted; a player missing any component is ineligible by default.
- No named impact metrics are fabricated. Impact indicators are the provider's PIE, net rating, and
  on/off differentials, labeled as such.

## 5. Testing

pytest for metrics, uncertainty, aggregation, court conversion, shooting bins, composite eligibility,
normalizers (fixtures), demo generator invariants, and API filters via FastAPI TestClient. Vitest for
URL state, formatting, and key components. Playwright smoke: open a player, filter the explorer,
compare players, export CSV.

## 6. Out of scope (documented as future ideas)

RAPM-style adjusted impact models, play-by-play possession parsing, expected-shot-quality models
(defender distance is not in the public shot data), live in-season auto-refresh scheduling.
