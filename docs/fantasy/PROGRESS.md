# Progress

## 2026-10-25 — Actual vs projected on the Free agents tab (DEC-33)
- Backend: `app/season/game_logs.py` (stored logs, `actual_lines`, `scope_window`), `GET/POST
  /season/game-logs[/refresh]`, `free-agents?actuals=`; `openpyxl` added for the CLI report.
  Tests: `tests/test_game_logs.py` (3) + API test in `tests/test_api_season.py`; full suite green.
- Frontend: rank-by control, refresh button with spinner and freshness line, actual columns,
  `SwapActuals` in the swap panel; `rank=` persisted in the hash. Tests added for table and tab.
- Verified live on the 1000T league: 812 logs through 2026-10-24; Carter 16.8 actual vs −1.6
  projected over Kuminga (−4.2 actual).

## 2026-10-24 — Redesign inside the Courtside shell (DEC-32)
- Copilot screens render inside the shared shell (no copilot sidebar); tokens aliased to the
  shared dark palette; performers: feature cards, category heatmap, totals/per-game, NBA profile
  links; draft pick flash and control transitions; `PlayerView.nba_id` added (backend test).
- Verified: backend `tests/test_api.py` 14 passed; frontend vitest, tsc, Playwright fantasy 4/4,
  analytics suites; screenshots at 1440 and 390 px (see repo root PROGRESS in README).

## 2026-10-24 — Merged into Courtside (DEC-31)
- This project is now `services/fantasy` (API, uv, Python 3.12) and `frontend/src/fantasy` (UI) of
  the Courtside repository; data in `data/fantasy`, docs here, exports in `exports/fantasy`.
  `make dev` at the repo root starts it with the analytics service; the UI is at
  http://127.0.0.1:5173/fantasy. Service CLI targets: `make -C services/fantasy <target>`.
- UI ported unchanged (see DEC-31 for the isolation mechanism and the three known pixel
  differences). Verified: backend 240 tests, frontend 242 unit tests (71 from here), `tsc` clean,
  Playwright 4/4 via `make e2e-fantasy` (ports 8010/5175), pixel diff against the standalone app
  below 0.2 % on every screen with identical page heights.
- Plan: `docs/superpowers/plans/2026-10-24-fantasy-ui-migration.md` (repo root docs).

## 2026-10-24 — Scored-category selector and weekly roster moves
- Setup: category preset (ESPN 9-cat / 8-cat without turnovers) and per-category toggles; the
  performers explainer, tooltip and drawer read the league's categories (unscored stats are
  labelled, never summed). The 1000Thieves session was already 8-cat; only the wording was wrong.
- `GET /season/moves?period=`: every post-draft add/drop from the event log, dated by matchup
  period, trades marked on both sides. Season → Matchups shows "Roster moves in week N" grouped by
  team; Teams panel and Recap rosters tag "added wk N".
- Verified: backend test `test_roster_moves_listed_per_period_with_trades_marked`, frontend 70 unit
  tests, tsc clean, Playwright 4/4.

## 2026-10-23 — UI redesign: basketball analytics workspace (DEC-30)
Spec `docs/superpowers/specs/2026-10-23-ui-redesign-design.md`, plan
`docs/superpowers/plans/2026-10-23-ui-redesign.md`. Frontend only.
- App shell: charcoal sidebar with session/league/sync context (icon rail under 1180 px, bottom tab
  bar on phones), page header with context chips and page-level filter bar, hash-persisted page
  selections (`lib/hashQuery.ts`).
- Design system: `styles/{tokens,base,shell,ui,charts,draft,season,performers}.css`, shared
  `components/ui/*`, hand-written charts in `components/charts/*`, lucide icons replace emoji.
- Draft: status strip, recommendation hero (value ± sd, fit, projected GP/MIN, availability,
  category impact as diverging bars), category profile with z bars, lineup-slot roster, snake board
  with team colours, compare dialog with aligned z bars.
- Season: featured matchup with the winner's chance as the key number and ESPN running totals
  under each category (labelled actual) beside the simulated odds; power rankings as a team ×
  category heatmap with a per-team profile on click; free agents with a swap panel (add, drop, net
  Δ, z by category); results with won/lost marks and a hatched projected row; track-record stat
  cards.
- Performers: stat row, leaderboards, diverging over/under chart, actual-vs-expected scatter with
  equality line, sortable table, detail drawer, explainer behind a disclosure; week-by-week trend
  shown as an unavailable state (no per-player history in the API).
- Verified: frontend 64 unit tests (19 files; new: hashQuery, scale, Tooltip, ChartFrame, charts,
  Sidebar, FreeAgentsTab), `tsc` clean, Playwright 4/4 on ports 8011/5177, screenshots at 1440 and
  390 px for every screen (`docs/screenshots/`).

## 2026-10-23 — Team performers, performance tracker, live scores (DEC-28, DEC-29)
- **Performers** tab: ESPN applied box scores per matchup period stored by every sync
  (`period_player_stats`; current and previous week), contribution and over-expectation leaderboards,
  sortable detail table with per-category breakdown, explainer with the league's unit sizes, ESPN
  headshots with initials fallback. `GET /season/performers`.
- `make performance`: week-by-week actual-vs-projection CSV/XLSX tracker and free-agent hot starts.
- ESPN feed fixes found in use: next-period roster view for same-day moves; `mMatchup` (not
  `mSchedule`) carries scores; `cumulativeScoreLive` via `mMatchupScore` is the live scoreboard;
  cached league reloads when another process synced; weekly projections frozen at week start
  (Track record tab).
- Daily lineups: season sims count every available player on his game days, best players first on
  crowded days; OUT / no-team players never start; teamless players are the default drop.
- Verified: backend 239 tests, frontend 47, Playwright 4; live on league 2075231076.

## 2026-10-19 — ESPN league link and in-season tracking (DEC-24..27)
Spec `docs/superpowers/specs/2026-10-19-espn-league-link-design.md`, plan
`docs/superpowers/plans/2026-10-19-espn-league-link.md`, branch `feat/espn-league-link`.
- Backend: `sources/espn_league.py` (public league parser, verified on league 2075231076),
  `season/{weeks,link,sync,live_status,power,free_agents,results,service}.py`, `roster_changed`
  events, `session_sync` cache, routes `POST /espn/link`, `/espn/link/apply`, `/espn/sync`,
  `GET /season/{overview,matchup,free-agents,results}`, CLI `espn-link`, `espn-sync`, `season`
  (ESPN results when linked), `make link SESSION= LEAGUE=`, `make sync SESSION=`.
- Frontend: Season screen (SyncBar, LinkDialog, Matchups, Power rankings, Free agents, Results),
  `seasonStore` with auto-refresh, teams views show post-draft adds.
- Verified here: backend 210 tests (incl. 17 season API, 8 analytics, 7 link/sync, 6 parser),
  frontend 35 unit, 3 e2e (new `season.spec.ts`: link → sync → matchups → power → free agents →
  results with ESPN mocked at the network layer). Real league: `espn-link` mapped 13/13 teams
  (high confidence), first `espn-sync` recorded 5 adds / 3 drops across 2 teams (George Hu's
  Ayton/Poole/Braun/+1 and Kevin Pi's waiver claim) from ESPN's transaction log, week-1 odds and
  power rankings printed; all four UI tabs render on the live league with no console errors.
- Open: ESPN says lineups lock per game (daily) while the session is weekly — surfaced as a warning,
  not applied. Period calendar derived (period 1 = Oct 20–25); confirm against ESPN after week 1.

## Current status (2026-10-10)

Phases 0–6 delivered as a working MVP. Everything below was actually run on this machine (Apple
Silicon macOS, Python 3.12, Node 24) on 2026-10-09/10.

### Verification results
- Backend: `uv run pytest` → **150 passed in 16.03s** (`backend/tests`, incl. `tests/sources` with recorded fixtures,
  no network). `uv run ruff check app tests` → All checks passed.
- Frontend: `npx vitest run` → 26 passed (revision guard, optimistic commit/rollback/retry, keyboard
  reducer, local state). `tsc --noEmit` clean. `npm run build` OK.
- End-to-end (`make e2e`, Playwright against a real backend on a temp data dir, demo snapshot):
  2 passed — (1) setup → confirm format → five opponent picks via keyboard picker → user on the
  clock → highlighted/shortlist exclude drafted → draft → undo → reload restores; (2) fixed punt
  re-ranks and labels the profile → picks CSV import → export/import round trip keeps strategy.
- Benchmarks (`make bench`, docs/BENCHMARKS.md, 600 players / 12 managers): Layer A p95 ≈ 12 ms;
  full fast recommendation p95 ≈ 10 ms; pick commit p95 0.17 ms; refinement reaches tier C
  (≥ 4 rollouts) inside a 1,000 ms budget, ≈ 2,200 weekly scenarios at 1,500 ms. The brief's
  targets (optimistic pick ≈ 100 ms, fast ranking < 250 ms p95, refinement ≈ 1–2 s) are met on
  this hardware; the UI applies picks optimistically before the server reply.
- Projection validation (`make validate`, docs/VALIDATION.md): 2025-26 holdout, 383 players;
  baseline beats naive last-season on every category (e.g. PTS MAE 2.70 vs 2.82, FT% 0.040 vs
  0.053). Retrospective and survivorship-biased, not a leak-free draft backtest.
- Real data (`make refresh` 2026-10-09, docs/DATA_SOURCES.md): 622 active NBA players, 1,723
  player-seasons (2023-24..2025-26), 84,768 game logs, 1,095 ESPN active players (eligibility, ADP,
  ranks; 348 ESPN projections), 1,200 scheduled games. Snapshot `nba-ef63bc7aa622`: 970 players.
- Manual UI check with the real snapshot: setup, draft (refined tier C in ≈ 1.3 s), setup imports,
  data health screens render without console errors.

### What works
- Manual league setup (formats, slots, caps, order, keepers, traded picks, lineup mode, strict
  eligibility), mandatory format confirmation, sessions list/resume/delete.
- Draft loop: keyboard picker, optimistic commit with idempotency keys and revision checks, undo,
  correction from the board, order edits with warnings, export/import JSON, batch CSV picks.
- Recommendations: Layer A (vectorized screening with slot-aware replacement, risk term, tiers,
  flags, computed reasons, before/after category deltas), Layers B/C (ADP + need opponent model,
  common-random-number draft rollouts, correlated weekly matchup simulation, each/most/roto
  objectives, survival probabilities, draft-now-vs-wait) as bounded background jobs with stale
  results rejected server- and client-side.
- Data: nba_api + ESPN public adapters with raw cache/retries/health; identity crosswalk with a
  review list; baseline projections validated on real data; ESPN projection blend; rookies' priors;
  schedule-based games per week and a daily-lineup collision approximation.
- Imports: projections / eligibility / ADP / picks CSV with preview, row errors, templates.

### Deferred / not verified
- Private ESPN league read-only import (`app/sources/espn_private.py`) is implemented against
  espn_api's payloads and unit-tested with fixtures, but NOT run against a real league (no
  credentials). Live draft feed: not supported.
- Auction drafts: unsupported (rejected at import, not offered in setup).
- Daily-lineup counted starts use an expected-collision approximation, not per-day optimization.
- Interval calibration of projection uncertainty and weekly simulation variance: unvalidated.
- Fantasy-playoff schedule weighting: not implemented (schedule weeks are available).
- Suggested-punt scenario comparison: toggle is display-only; no scenario table yet.
- No "H-score/G-score" implementation; the simpler documented approach is used (MODEL_CARD.md).
- The frontend subagent that wrote most of `frontend/src` was cut off by a rate limit before it
  could run e2e or write docs; the main session fixed two zustand selector bugs, the failing
  store test, added the import panel and the second e2e, and ran everything above.

### Next actions (if continued)
1. Verify the private-league import with real cookies (user-provided) and record the result.
2. Per-day lineup optimization for daily leagues; playoff-week weighting.
3. Suggested-punt scenario table (balanced vs one/two-category punts) with explicit apply.
4. Improve the projection model (the component that carried the evaluation): more seasons, minutes
   modeling, injury-aware games; then re-run `make evaluate`. Investigate why the refined layer does
   not help (Monte Carlo noise at small budgets, value-proxy opponents).

### 2026-10-10 — league settings applied (DEC-17)
Defaults now match the user's league (H2H each category, ties half, 13 rosters, C cap 4, weekly);
"My team" selector in the draft top strip; center cap enforced in Layer A and rollouts; tie-rule
control in setup. Tests re-run after the change (see counts above).

### 2026-10-10 — visibility features
`GET /sessions/{id}/profiles` (every manager's category totals, attempts, z-sums, per-category rank),
"League category profiles" tab, expandable shortlist breakdown rows (per game / z / weighted /
delta / simulated P(win)), preview of any player via picker rows and the drawer (the fast response
now carries `preview_candidate` scored against the roster without them). Backend 153 tests, frontend
26 unit + 3 e2e, all passing.

### 2026-10-10 — UI redesign (docs/UI_NOTES.md)
Scoreboard status strip, inline pick recording (no modal), position/availability filters, All
players sortable table, tabbed side panel (roster / categories / strategy / teams), history drawer
with recent picks + corrections + board + league profiles, Fit column and alternatives on the hero,
token-based stylesheet, mobile segmented layout. typecheck/vitest(26)/e2e(3) pass; screenshots at
1200 px and 390 px reviewed.

### 2026-10-10 — draft strategy evaluation (docs/EVALUATION.md)
`app/eval/mock_draft.py` + CLI `evaluate-draft` (`make evaluate`): paired retrospective mock drafts on
2025-26 (projections fit on 2023-24/2024-25, 412-player universe, value-order opponents, realized
scoring). Fast ranking beats the opponent bot (+0.53 ± 0.13 categories/matchup) and last-season
numbers (+1.0), ties projected-value-only (+0.06 ± 0.06); refined layer at 2 s not better than the bot
(−0.32 ± 0.31, n=20). DEC-18 keeps the fast score as the primary ordering. 8 s refined follow-up (docs/EVALUATION_refined_8s.md,
20 drafts): −0.14 ± 0.29 vs the bot, −0.01 ± 0.27 vs projected value; no gain from depth.

### 2026-10-10 — projection model upgrade (DEC-19)
Fetched 2020-21..2022-23 (6 seasons, 3,407 player-seasons, 165k game logs). `make research`
(docs/PROJECTION_RESEARCH.md) scored baseline variants and a learned ridge model on two holdouts; ridge
wins on rank correlation and minutes/games error. Model-vs-model drafts: +1.07 ± 0.11 (2025-26),
−0.07 ± 0.08 (2024-25). Real snapshot rebuilt with ridge. Tests: `tests/test_learned.py` added.

### 2026-10-10 — model push + games-played ablation (DEC-20)
Rich role features, GBM and ensemble variants (`learned.py`), GP ablation helper, `--user-model` specs in
the draft harness. Default projection is now `ens` (ridge + GBM, rich features). Games played: keep the
projected value; raw last-season GP hurts (docs/GAMES_PLAYED_ABLATION.md). Snapshot rebuilt, sessions
repointed.

### 2026-10-10 — ten seasons, four holdouts (DEC-21)
Fetched 2016-17..2019-20 (now 5,492 player-seasons, 273k game logs); games played normalized to an
82-game pace for the shortened seasons. Ensemble first on ranking quality in all four holdouts and
non-negative in all four paired-draft years; ridge lost one year badly. Snapshot `nba-292e5710e8f8`
(971 players) rebuilt on ten seasons; sessions repointed; backend restarted. 158 tests, lint clean.

### 2026-10-10 — punt advisor
`POST /sessions/{id}/punt-advisor` (app/recommend/punt_advisor.py): balanced vs single punts vs best
pair, completed with the fast continuation policy under each scenario's weights, scored by the weekly
simulation under the real rules; explicit Apply in Strategy tab (replaces the display-only toggle).

### 2026-10-10 — roster-aware weighting (DEC-22)
Tested category weights scaled by marginal win value given the roster; it hurt or tied in every
holdout, so it ships off by default (`Strategy.roster_aware`). Plain value ranking remains the
recommendation source.

### 2026-10-13 — rookie and lost-season adjustments (DEC-23)
Rookie ESPN projections discounted; players who missed all of last season get rate/games discounts from
an empirical 22-player return sample; both surfaced as flags in the shortlist. Snapshot rebuilt, sessions
repointed, backend restarted.

### 2026-10-17 — draft night + in-season tracker
Real draft recorded (session 5291db641583, 13 teams, 169 picks); league is 8 categories (no TOV), session
updated. Draft review workbook/report in exports/. `make season SESSION=<id>` (app/season/tracker.py): actual
weekly category standings from live NBA game logs, tested on preseason games; UI screen not built yet.

### 2026-10-25 — in-season minutes (DEC-34)
Season screens (free agents, power, odds) now rank on in-season minutes: stored game-log minutes
blended into projected minutes (weight n/(n+4), last 10 games) with per-player strategy overrides
(`minutes_overrides`) that win; per-minute rates stay projected. `app/season/minutes.py` + tests,
API fields `minutes` on free agents/overview, MIN column and override control in the Free agents tab.
Players without an NBA team are dropped from the free-agent list. Live session 5291db641583 has
Vucevic pinned at 5 min.

### 2026-10-25 — portfolio demo media
`frontend/scripts/demo-tour.mjs` records a scripted Playwright tour (video + screenshots) for the
README; `docs/media/` holds the GIF, MP4 and gallery shots. Recorded against a sanitized clone of
the live session (manager, team and league names replaced; players and stats real). The clone and
its league payload live only locally under `data/`, like every other session.

### 2026-10-25 — Courtside redesign v2 (DEC-35)
Shipped on `redesign/v2` (f8c66ca..0acbf11, plus the batched review fixes): a type scale and contrast-safe tokens in both themes
with a contrast test; event-driven route state and one fantasy navigation hierarchy (no separate
"League matchups" item; URL, breadcrumb, title and sidebar in sync); shared primitives (Disclosure,
Drawer with a `modal` prop, Freshness, ChartFrame, pinned/sticky DataTable, PageHeader context and
tabs) with plain-CSS fantasy counterparts; a matchup-first Overview; a recommendation-first draft
screen with impact bars, a quiet status line and a docked "My team" panel; matchup cards that
separate projected outcome from actual totals; sortable sticky power rankings with a two-team
comparison; free agents around the swap (detail rows, advanced table, add and drop on one scale via
the additive `FreeAgentView.drop_z`); performers in one order with a sortable heatmap; an
isolation guard test that keeps the copilot from importing analytics-side modules; select-then-act
Explorer; a scannable player profile; the shooting court with adjacent zone detail; matchup results
led by sample size; the remaining research pages on the shared header, toolbar and tables; a focus,
reduced-motion and dialog-layer pass; and per-thread SQLite connections in the session store. Verify
with `make test`, `make lint`, `make e2e` (with `make dev` up; includes `e2e/a11y.spec.ts`) and
`make e2e-fantasy` (includes `e2e/fantasy/navigation.spec.ts`); `node frontend/scripts/capture-screens.mjs
--session <id> --out <dir>` captures every page at 1440/1280/768/390 px for a visual pass. Known
deferred minors, all recorded in `.superpowers/sdd/2026-10-25-courtside-redesign-v2/progress.md`:
a few contrast edges outside the tested pairs (light primary-button hover, `.portrait.fallback` on
team colours) and gaps in the ink-4 guard; small accessibility follow-ups
(screen-reader names for ProbabilityPair sides, no page yet passing a ChartFrame `summary`,
document-level Esc for non-modal layers, focus fallback when an opener unmounts, aria-live on
Explorer keyboard selection); layout edges (narrow court at ~1024 px in split mode, overlay team
drawer styling at 761–1179 px); untested branches (tie and missing sorting in heatmaps, `drop_z` scale, Freshness on unparseable
dates); backend hygiene in the store (BEGIN without ROLLBACK on error, `export_session` not one
snapshot); and an unexplained 1-in-33 flake in `strategy_import.spec.ts`.

## How to resume
Read CLAUDE.md, this file, DRAFT_COPILOT_PLAN.md and DECISIONS.md. `make install && make test`.
Real data: `make refresh && make build-snapshot`. Ports 8000/5173 may be busy on this machine
(`make dev BACKEND_PORT=8020 FRONTEND_PORT=5180`).

## History
- 2026-10-09: Phase 0 (probes, docs), Phase 1 backend core, Phase 2 adapters (subagent), Phase 3/4
  engine layers, baseline + validation, CSV imports, schedule model.
- 2026-10-10: frontend finished (takeover from the subagent), e2e, benchmarks, docs reconciled.
