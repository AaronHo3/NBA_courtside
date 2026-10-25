# Courtside Research: an NBA player & team analytics workbench

A local-first research tool for exploring NBA players and teams from every angle the public data
supports: league-wide scatter exploration, player profiles with measurement provenance, an
interactive shot chart lab, offender-vs-defender matchups, multi-player comparison, team rosters,
lineups and on/off, transparent rankings, and a methodology page that documents every number.

- **Backend**: Python 3.13, FastAPI, pandas/NumPy/SciPy, DuckDB over Parquet (`backend/`)
- **Frontend**: React 19, TypeScript, Vite, Tailwind v4, Plotly.js, D3, TanStack Table/Query (`frontend/`)
- **Data**: a resumable `nba_api` ingestion pipeline (namespace `nba`) and a deterministic,
  visibly labelled synthetic dataset (namespace `demo`) so the app is fully usable even when
  stats.nba.com is unreachable. The two never mix.

## Quick start

Prerequisites: Python 3.12+ with [uv](https://docs.astral.sh/uv/), Node 20+ (tested on 24), `make`.

```bash
# 1. install
cd backend && uv sync && cd ..
cd frontend && npm install && cd ..

# 2. build the demo dataset (≈35 s, 11 MB, fictional teams and players)
make demo-data

# 3. run API (:8000) and web app (:5173) together
make dev
```

Open http://127.0.0.1:5173. The amber **Demo data** strip stays visible whenever synthetic data is
being served.

Useful URLs: `http://127.0.0.1:8000/docs` (OpenAPI), `http://127.0.0.1:8000/api/meta/status`
(namespace, seasons, coverage).

## Media prerequisites (scouting, Phase B)

Managed video (uploads you are authorised to use, playback derivatives, thumbnails) needs
`ffmpeg` and `ffprobe` on the machine running the API and worker: `brew install ffmpeg`. Without
them the app still runs; the Data & methods page reports the tools as unavailable and upload
processing is refused with a clear error. Limits live in `.env` (`MEDIA_*`).

## Loading real NBA data

The browser never talks to the provider; all provider traffic goes through the backend pipeline.

```bash
make ingest SEASONS="2024-25"                 # all families for one season
make ingest SEASONS="2024-25 2023-24" FAMILIES=player_season,team_season,shots
make ingest-status                             # coverage table for the real namespace
# play-by-play is per game and never part of `all`; pick games explicitly, then register clip references
cd backend && uv run python -m app.ingestion.cli run --seasons 2024-25 --families events --games-limit 12
cd backend && uv run python -m app.evidence.cli link-events --game-id 0022400001,0022400002 --check 10
cd backend && uv run python -m app.ingestion.cli probe   # is stats.nba.com reachable from here?
```

The pipeline fetches cheap league summaries first (teams, players, team and player season totals),
then combine measurements, game logs, lineups, on/off, defensive dashboards, matchups, and league-wide
shots last. Every raw response is cached under `data/nba/raw/`, every normalised family is written to
`data/nba/parquet/<family>/`, and `data/nba/manifest.json` records status (`ok`, `missing`, `stale`,
`failed`, `partial`), row counts, fetch timestamps and source for each (family, season, season type).
Re-running resumes: `ok` steps are skipped unless `--refresh` is passed; `partial` steps run again
and only their failed sub-requests hit the provider (the rest come from the raw cache).

Once the real manifest has usable data the API serves the `nba` namespace automatically
(`NBA_NAMESPACE=auto`); force one with `NBA_NAMESPACE=nba` or `NBA_NAMESPACE=demo` in `.env`.

Pacing, timeouts, retries and an optional proxy are configured in `.env` (see `.env.example`).
stats.nba.com rate-limits and blocks many networks (cloud providers, some ISPs, VPNs); if `probe`
reports unreachable, the demo namespace remains available and nothing in the UI pretends otherwise.

## Project layout

```
backend/app/analytics     metrics, uncertainty, aggregation, court geometry, shooting bins, percentiles, composite
backend/app/data          Arrow schemas, Parquet IO, manifest, DuckDB views, repositories, namespace resolution
backend/app/ingestion     provider abstraction, nba_api provider, cache, normalizers, pipeline, manager, CLI
backend/app/demo          deterministic synthetic league generator
backend/app/api           FastAPI routers (meta, players, league, shots, matchups, teams, rankings, ingestion)
backend/tests             pytest (analytics, data, demo invariants, API contract, ingestion fixtures)
frontend/src/pages        League explorer, Player profile, Shooting lab, Matchups, Compare, Teams, Rankings, Scouting, Games, Methodology
frontend/src/components   court SVG, Plotly wrapper + validated palette, virtualised table, UI primitives
frontend/e2e              Playwright smoke tests
docs/                     DATA_SOURCES.md, METHODOLOGY.md, LIMITATIONS.md, design spec and plan
data/                     (gitignored) raw cache, Parquet, manifests per namespace
```

## Commands

| Command | What it does |
| --- | --- |
| `make dev` | API with reload on :8000 and Vite on :5173 (Vite proxies `/api`) |
| `make demo-data` | Regenerate the synthetic dataset (deterministic; `--seed` in `backend/app/demo/generate.py`) |
| `make ingest SEASONS=... FAMILIES=...` | Run the real provider pipeline |
| `make ingest-status` | Print real-namespace coverage |
| `make worker` | Durable media/snapshot worker for the real namespace (or set `JOBS_INLINE=1` in `.env` for one-process dev) |
| `make test` | pytest with coverage + vitest |
| `make build` | Type-check and build the frontend |
| `make e2e` | Playwright smoke tests (needs `npx playwright install chromium` once and the API running) |
| `make lint` | ruff + oxlint |

## Docker

`docker compose up --build` starts the API (with the demo dataset generated on first start) and the
built frontend behind nginx on http://127.0.0.1:8080. Mount `./data` to persist ingested data.

## Troubleshooting

- **The app shows "no data found"**: run `make demo-data` (or `make ingest`). The API resolves the
  namespace at startup and after each ingestion run; restart it if you generated data by other means.
- **`curl` to stats.nba.com hangs but the probe says reachable**: expected. The provider's edge holds
  clients without the modern Chrome header set; the pipeline uses `nba_api`'s shipped headers. Trust the probe.
- **Provider timeouts / `ProviderError`**: stats.nba.com blocks many networks. Try from a residential
  connection, raise `NBA_REQUEST_DELAY_SECONDS`, set `NBA_PROXY`, and rerun; the pipeline resumes.
- **Season shows no shots/matchups**: check the coverage matrix on the Data & methods page. The demo
  only simulates game-level detail for its last three seasons; the provider publishes matchups from
  2017-18 and shot locations from 1996-97.
- **Port in use**: change `API_PORT` in `.env` and the proxy target in `frontend/vite.config.ts`.
- **Playwright cannot launch**: `cd frontend && npx playwright install chromium`.

## Documentation

- `docs/DATA_SOURCES.md`: endpoints per family, first available season, call counts, limits.
- `docs/METHODOLOGY.md`: formulas, thresholds, uncertainty, shooting geometry, ranking construction.
- `docs/LIMITATIONS.md`: what the data cannot support and what is intentionally not implemented.
- `docs/superpowers/specs/2026-10-08-nba-analytics-design.md`: architecture and decisions.
