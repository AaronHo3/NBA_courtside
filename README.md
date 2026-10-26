# Courtside

One local-first NBA workspace built from two earlier projects:

- **Analytics** (from `nba_advanced_statistics`): player/team research workbench. FastAPI + DuckDB
  over Parquet, React + Vite + Tailwind frontend. This frontend is now the main Courtside UI.
- **Fantasy** (from `fantasy_draft_simulator`): ESPN nine-category draft copilot and in-season
  companion (draft, recap, ESPN league link and sync, season odds, performers, CSV imports, session
  export/import). FastAPI + SQLite sessions + Parquet snapshots. Its UI renders inside the main
  Courtside shell at `/fantasy`, on the same design tokens as the research pages.

Nothing talks to the network on request paths; both services bind to localhost. The browser loads
player headshots and team logos from the public NBA/ESPN image CDNs (initials and tricodes are the
fallback when an image is unavailable).

## Demo

https://github.com/user-attachments/assets/db43b44b-a879-44b6-97f1-d34184eb0bfe

A 74-second tour: the research pages, a live draft with recommendations, then my league's matchups,
power rankings, free agents and performers. It runs against a copy of my own ESPN league for the
2026-27 season: real NBA players, the real schedule and this season's game logs, with every
manager, team and league name replaced. Pause and scrub; each screen stays up for a few seconds.
The same file is in the repo at [docs/media/courtside-demo.mp4](docs/media/courtside-demo.mp4), and
a short loop of the fantasy half is below.

![Courtside: league matchups, power rankings, free agents and performers](docs/media/courtside-demo.gif)

| | |
|---|---|
| [![Draft: best pick now with category impact](docs/media/shots/draft.png)](docs/media/shots/draft.png) **Draft copilot.** Value above replacement, category impact under your strategy, whether the player survives until your next pick, and the next-best alternatives. | [![This week's matchup with per-category odds](docs/media/shots/league-matchup.png)](docs/media/shots/league-matchup.png) **League matchups.** Simulated weeks on the real NBA schedule give a win chance per category, with ESPN's running totals underneath. |
| [![Power rankings heatmap](docs/media/shots/power-rankings.png)](docs/media/shots/power-rankings.png) **Power rankings.** Expected categories won against the league-average opponent, and each team's chance in every category. | [![Free agents with the swap panel](docs/media/shots/free-agents.png)](docs/media/shots/free-agents.png) **Free agents.** Each add ranked against your roster with the cheapest drop, actual vs projected lines, and in-season minutes with a per-player override. |
| [![Player profile: eight seasons of trends](docs/media/shots/player-profile.png)](docs/media/shots/player-profile.png) **Player profile.** Season-by-season stints, rate trends, shot zones and matchup history for any player. | [![Who guards whom](docs/media/shots/matchups.png)](docs/media/shots/matchups.png) **Matchups.** Tracked scorer–defender pairs: where a scorer's efficiency fell or rose, with sample-size caveats attached. |
| [![Shooting lab hexbins](docs/media/shots/shooting-lab.png)](docs/media/shots/shooting-lab.png) **Shooting lab.** Hexbins, provider zones or raw markers; frequency and accuracy encoded separately with Wilson intervals. | [![Team performers](docs/media/shots/performers.png)](docs/media/shots/performers.png) **Performers.** Who carried a fantasy team this week and who beat their projection, from ESPN's applied box scores. |

The demo is scripted and reproducible: `node frontend/scripts/demo-tour.mjs --session <id> --out <dir>`
drives the app with Playwright while `make dev` is running, records the video and takes one
screenshot per step; `--short` records only the fantasy highlights used for the GIF. Point it at a
session whose names are already pseudonymous. The MP4 and GIF were encoded with ffmpeg
(`libx264 -crf 24` and a 12 fps, 960 px palette GIF).

## The interface

One shell for both halves: a grouped sidebar (Overview · NBA research · Scouting & film · Fantasy ·
Data & methods), a header with a breadcrumb and one compact context area (the NBA season picker and
compare tray on research pages; the fantasy session, league, week, last sync and demo flag on
fantasy pages), and a ⌘K palette for players and pages. The fantasy copilot renders inside this
shell with the shared tokens; it has no sidebar of its own. Dark is the primary theme (toggle in
the sidebar footer). Design tokens live in `frontend/src/index.css` (`--c-*`); the copilot's
`frontend/src/fantasy/styles/tokens.css` aliases them. Specs:
`docs/superpowers/specs/2026-10-24-courtside-redesign.md`, revised by
`docs/superpowers/specs/2026-10-25-courtside-redesign-v2-brief.md` (plan:
`docs/superpowers/plans/2026-10-25-courtside-redesign-v2.md`).

**Type and contrast.** Body text is 14px in both halves (Tailwind `text-sm`, fantasy `--fs`), with a
15px `text-base` step for emphasised lines; tables are 13px; 12px (`text-meta`, fantasy `--fs-xs`)
is for secondary metadata only. Controls are 34px (small 28px), tabs 36px, table rows 36px. Every
text token is measured at ≥ 4.5:1 on the surfaces it is used on, in both themes, by
`frontend/src/lib/contrast.test.ts` (`node frontend/scripts/contrast-report.mjs` prints the
matrix); `--c-ink-4` is decorative only and never used for text.

**Navigation.** One Fantasy group: Draft, Recap, My league, Performers, Setup. My league has five
views (Matchups, Power rankings, Free agents, Results, Track record; defined once in
`src/fantasy/lib/seasonTabs.ts`) that are the season tabs, the sidebar sub-items and the
breadcrumb's last step at once; `#/season?tab=matchups` and the other
`tab=` deep links still work. The URL is the only route state: every hash-query write dispatches a
`locationchange` event, and the shell and the fantasy router read the location through
`useSyncExternalStore`, so the view, URL, breadcrumb, page title and selected sidebar item stay in
step through tab changes, sidebar and palette jumps, reloads and Back/Forward (tabs push a history
entry; filters replace it). Player profiles read "NBA research / Players / <name>".

- **Overview** (`/`): this week's matchup first, with win, tie and loss chances kept apart from the
  expected category score, actual totals and games scheduled; the three most vulnerable categories;
  compact power rank and category outlook; leading contributor and biggest overperformer; next
  actions; recently viewed players. The track record explains when results become available
  instead of showing empty tiles.
- **Draft**: recommendation first. The card ("Best pick now", or "Previewing <name>" with a way
  back) keeps a stable height while recalculating and separates projected production, fantasy
  value and category impact (bars on a shared zero baseline); "Draft to my team" stays visible at
  1280×800. Timing, model tier and revision live in a quiet status line. "My team" docks as a third
  column from 1180px and opens as a drawer below that; peeking at a player is a non-modal drawer, so
  the picker stays usable. Stale-recommendation checks, pick confirmation and undo work as before.
- **League matchups**: each card separates the projected outcome (per-category chances, ties
  counted half for each side) from actual ESPN totals, with schedule volume and injuries in one
  line and assumptions in a disclosure; only the league's configured categories appear.
- **Power rankings**: a sortable heatmap with sticky team column and header, a fixed 0–100% scale
  with a legend, and your row marked; picking another team opens a category-by-category comparison
  with yours.
- **Free agents**: built around the swap. Rows lead with the player, value, best drop and net Δ;
  category detail expands per row and the full table is behind "Advanced table". Rank by projection
  or by actual production (this week or season to date, after "Refresh game logs", with freshness
  shown beside it); the swap panel draws add and drop on one scale (the API's `drop_z`), labels
  actual vs projected lines, and holds the minutes override.
- **Performers**: team summary, key players (leading contributor, biggest overperformer), a
  sortable player × category heatmap, actual vs expected, then the full table; totals / per-game is
  explicit throughout, and "NBA profile" links return to the same team and week.
- **Explorer**: select, then act. A click selects and highlights the player in the chart and
  table; profile and compare are explicit actions in the selection strip. Size and colour encodings
  are labelled and the population filters sit in a disclosure next to the chart.
- **Player profile**: a scannable hero (portrait and logo with fallbacks, team colours, the
  copilot's draft status and ADP when a session is open), research and fantasy season scopes kept
  distinct, a career timeline that shows it scrolls, then Performance · Shooting · Advanced ·
  Fantasy.
- **Shooting**: the court sized to the panel, with zone detail beside it when there is room;
  frequency, accuracy and relative-to-league encodings, attempt counts and Wilson intervals stay.
- **Matchups** (research): the result leads with its sample size and uncertainty; the
  observation-not-causation caveat stays beside it.
- Scouting, Rankings, Teams, Compare, Games, Evidence and Data & methods share the same page
  header, toolbar, pinned-identity tables and method disclosures.

Shared primitives (`frontend/src/components/ui`, `components/layout`, `components/table`,
`components/charts`, with plain-CSS counterparts in `frontend/src/fantasy/components/ui`):
`PageHeader` (context and tabs slots), `Toolbar`, `PlayerIdentity` / `TeamMark`, `StatTile` and
`Delta`, `Tabs` and `Segmented`, `DataTable` (pinned first column, sticky header, 36px rows, keyboard
row focus), `ChartFrame` (question, legend, keyboard summary), `Drawer` (modal unless `modal={false}`),
`Disclosure`, `Freshness`, `Skeleton` and the empty / error / loading states. Dialogs, drawers and
the palette share one layer stack, so only the top layer traps focus and handles Esc.

`node frontend/scripts/capture-screens.mjs --session <id> --out <dir>` captures every page at 1440,
1280, 768 and 390 px (`--theme light`, `--reduced-motion`, `--pages`, `--full-page`) and reports
horizontal overflow; `frontend/scripts/demo-tour.mjs` records the tour in the Demo section. Both
need `make dev` running.

## Layout

```
frontend/                 Courtside UI (React 19, Vite, Tailwind v4, Plotly, D3, TanStack)  :5173
frontend/src/fantasy/     the fantasy copilot UI, plain CSS, served at /fantasy
services/analytics/       analytics API (Python 3.13, uv)                                   :8001
services/fantasy/         fantasy API   (Python 3.12, uv)                                   :8002
data/analytics/           (gitignored) raw cache, Parquet, manifests, media, scouting.sqlite
data/fantasy/             demo + templates tracked; nba/ snapshots and sessions/ gitignored
docs/analytics/, docs/fantasy/   each project's docs, plus ORIGINAL_README.md / ORIGINAL_CLAUDE.md
exports/fantasy/          (gitignored) fantasy CLI exports
```

The two backends both ship a top-level Python package called `app`, so they keep **separate
virtual environments** (`services/*/.venv`) and are never imported together.

## Prerequisites

Python 3.12 and 3.13 via [uv](https://docs.astral.sh/uv/) (uv downloads them if missing), Node 20+
(tested on 24), `make`. `ffmpeg`/`ffprobe` are optional (analytics managed video).

## Run

```bash
make install   # uv sync in both services, npm ci in the frontend
make dev       # analytics :8001, fantasy :8002, Courtside UI :5173 — Ctrl-C stops all three
```

Open http://127.0.0.1:5173 for the analytics workbench and http://127.0.0.1:5173/fantasy for the
fantasy copilot (session ids stay in the URL as before: `/fantasy?session=<id>#/season`). One
sidebar covers both. Override ports with `make dev ANALYTICS_PORT=8011 FANTASY_PORT=8012 FRONTEND_PORT=5183`.

| Browser path          | Forwarded to                | As        |
| --------------------- | --------------------------- | --------- |
| `/api/analytics/*`    | `http://127.0.0.1:8001`     | `/api/*`  |
| `/api/fantasy/*`      | `http://127.0.0.1:8002`     | `/api/*`  |

The Vite dev server (`frontend/vite.config.ts`) rewrites the prefix; each service still serves its
original routes and response shapes (`/docs` on each port shows the OpenAPI schema). The analytics
UI calls `/api/analytics/...` through `src/lib/api.ts`; the fantasy UI has its own client
(`src/fantasy/api/client.ts`, base `/api/fantasy`, error format `{code, message, detail}`).

### How the fantasy UI is embedded

`frontend/src/fantasy` is the copilot app (hash router, plain CSS), rendered at `/fantasy` inside
the shared `AppShell`: the shell supplies the sidebar, breadcrumb and context area, and the
copilot's tokens alias the shared palette. Its stylesheets stay isolated: `vite.config.ts` prefixes
every rule with `.fantasy-root` at build time, `src/index.css` reverts Tailwind's preflight and
utilities inside that container, and Tailwind never scans `src/fantasy` for class names. Components
there use plain CSS classes, never Tailwind utilities, and never import from the analytics tree
(`src/fantasy/lib/isolation.test.ts` guards this); research pages reach the copilot through
`src/lib/fantasyBridge.ts`. Regenerate its typed client with
`make -C services/fantasy openapi`. Decision records: `docs/fantasy/DECISIONS.md` (DEC-31 isolation,
DEC-32 shared shell, DEC-35 route state, type scale and dialogs).

## Data

- **Analytics** reads `data/analytics/{demo,nba}/` (override with `NBA_DATA_DIR` in
  `services/analytics/.env`). With a populated `nba` manifest the API serves the real namespace
  automatically. Regenerate the synthetic set with `make demo-data`; ingest real seasons with
  `make -C services/analytics ingest SEASONS="2024-25"`.
- **Fantasy** reads `data/fantasy/` (override with `COPILOT_DATA_DIR` in `services/fantasy/.env`):
  `sessions/sessions.sqlite` (draft sessions and event log), `nba/snapshots/` (projection
  snapshots), `nba/normalized/` (players, schedule, game logs), `nba/live/` (per-league ESPN sync),
  `nba/raw/` (provider cache), `demo/` and `templates/` (tracked fixtures). CLI docs it writes go to
  `docs/fantasy/`, exports to `exports/fantasy/`.
- Everything under `data/analytics/`, `data/fantasy/nba/`, `data/fantasy/sessions/` and
  `exports/` is gitignored.

## Configuration and secrets

Each service reads only its own `.env` (`services/analytics/.env`, `services/fantasy/.env`); see
the `.env.example` next to each. All `.env` files are gitignored. Optional private ESPN cookies
(`COPILOT_ESPN_SWID`, `COPILOT_ESPN_S2`) go in `services/fantasy/.env` only and are never logged,
exported or sent to the browser.

## Checks

```bash
make test                  # all of the below
make test-analytics        # pytest + coverage (services/analytics)
make test-fantasy          # pytest (services/fantasy)
make test-frontend         # vitest (analytics + fantasy UI) + tsc -b
make lint                  # ruff (both services) + oxlint (frontend)
make e2e                   # analytics Playwright suite incl. e2e/a11y.spec.ts; needs `make dev` running
make e2e-fantasy           # fantasy Playwright suite incl. e2e/fantasy/navigation.spec.ts; boots its own API (:8010) and Vite (:5175)
```

Inside `frontend/`: `npx vitest run` (unit and component tests, including the contrast matrix in
`src/lib/contrast.test.ts`), `npm run typecheck` (`tsc -b`), `npm run lint` (oxlint). The backends'
pytest suites run with `make test-analytics` and `make test-fantasy`; the fantasy one includes a
concurrency test for the per-thread SQLite connections in `app/persistence/store.py`.

Service-specific commands (ingestion, snapshot builds, ESPN link/sync, benchmarks, evaluations)
live in `services/analytics/Makefile` and `services/fantasy/Makefile`; run them with
`make -C services/<name> <target>`.

## Not adapted yet

- `services/analytics/deploy/` (docker-compose files, Caddyfile) and the two Dockerfiles are
  copied verbatim from the analytics project and still assume the old `backend/` + `frontend/`
  layout. Local development does not use them.
