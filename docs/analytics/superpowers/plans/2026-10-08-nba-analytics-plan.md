# Implementation Plan: NBA Analytics Research Tool

Spec: `../specs/2026-10-08-nba-analytics-design.md`. Each phase ends with passing tests and a commit.

## Phase 0: Foundation
- [x] uv backend project (Python 3.13), Vite React TS frontend, Tailwind v4, deps installed
- [x] `.gitignore`, `.env.example`, `Makefile` (`make dev`, `make test`, `make demo-data`, `make ingest`)
- [x] Vite: Tailwind plugin, `/api` proxy to `:8000`, Vitest config, `@/` alias
- [x] First commit

## Phase 1: Analytics core (TDD)
- [x] `metrics.py`: safe_div, efg, ts, per36, per100, ast_to; tests incl. zero denominators
- [x] `uncertainty.py`: wilson_interval, beta_shrink; tests
- [x] `aggregation.py`: sum-then-ratio aggregation, traded-player dedupe; tests
- [x] `court.py`: constants (ft), provider units (tenths of ft, origin at hoop center), conversion both
      ways, zone distance checks; tests
- [x] `shooting.py`: hexbin assignment, bin aggregation with Wilson + low-sample flag, points per FGA,
      league zone baselines, relative FG%; tests
- [x] `percentiles.py`, `composite.py`; tests incl. missing-component ineligibility

## Phase 2: Data layer
- [x] Parquet schemas (pyarrow) per family, `schemas.py`
- [x] Demo generator: seeded, 10 seasons, 30 fictional teams, ~450 players/season with careers,
      game logs → season totals → shots consistent with game FGA/FGM; matchups, lineups, on/off,
      combine anthro with provenance; writes Parquet + manifest under `demo/`
- [x] DuckDB views + repositories; namespace resolution (`auto` → nba if manifest ok else demo)
- [x] Tests: generator invariants (sum of game logs == season totals; shots == FGA), repository queries

## Phase 3: Ingestion pipeline (real provider)
- [x] Provider protocol, nba_api provider with pacing/retry/backoff/timeout, raw cache with provenance
- [x] Normalizers per family using response headers; fixture-based tests
- [x] Pipeline runner with plan/resume/manifest; CLI `python -m app.ingestion run --seasons … --families …`
- [x] On-demand player shot fetch endpoint that caches to Parquet

## Phase 4: API
- [x] Routers: meta (namespace, manifest, seasons, metric definitions), players (search, profile,
      career, percentiles), league (explorer rows with normalization), shots (markers, hexbins, zones,
      league baseline, filters), matchups (by offender/defender, pair detail, heatmap), teams (season,
      roster contributions, stints, lineups, on/off), rankings (lenses + composite), ingestion status
- [x] Param validation, bounded result sizes, CSV export endpoint
- [x] TestClient tests

## Phase 5: Frontend shell
- [x] Theme tokens (navy/charcoal/accent, light theme), layout, nav, demo banner, URL state hooks,
      API client + TanStack Query hooks, Plotly wrapper with theme, DataTable (TanStack Table + virtual),
      comparison-group store, MetricTooltip with definitions
- [x] Pages A–H as per spec (delegate pages in parallel once the shell and API contract exist)

## Phase 6: Verification & docs
- [x] pytest coverage report; vitest (134); `tsc -b && vite build`; Playwright smoke (9 specs)
- [x] Browser inspection of every page; fix layout/scale issues
- [x] README, DATA_SOURCES.md, METHODOLOGY.md, LIMITATIONS.md, `.env.example`
- [x] Final report
