# Courtside: repository instructions

Combined workspace: `frontend/` (main UI; the fantasy copilot UI is `frontend/src/fantasy`, served
at `/fantasy`), `services/analytics/`, `services/fantasy/` (two FastAPI apps, separate uv
environments, both have a package named `app`). Start with `README.md`; run `make dev`.

The domain invariants of each original project still apply to its service and must not be
relaxed during migration. Read them before touching that code:

- `docs/analytics/ORIGINAL_CLAUDE.md` (percentages are fractions, null is missing, demo and real
  data never mix, browser never contacts stats.nba.com, every row carries `source` and `fetched_at`).
- `docs/fantasy/ORIGINAL_CLAUDE.md` (FG%/FT% from summed makes and attempts, turnovers lower is
  better, availability replayed from the event log, revision fields on every recommendation, ESPN
  position/slot indexing, no network or LLM on the pick-commit path, pure engine functions).

Routing: the browser only calls `/api/analytics/*` and `/api/fantasy/*`; `frontend/vite.config.ts`
rewrites the prefix. Keep each service's existing `/api/*` routes and response envelopes.

Design system: tokens in `frontend/src/index.css` (`--c-*` palette, motion vars, Tailwind theme map),
shared components in `frontend/src/components/ui` (PlayerIdentity, StatTile, Delta, Tabs, Skeleton,
Toolbar), navigation in `frontend/src/components/layout/nav.ts`, the research↔fantasy seam in
`frontend/src/lib/fantasyBridge.ts`. Spec: `docs/superpowers/specs/2026-10-24-courtside-redesign.md`;
decision DEC-32. Dark is primary; keep teal/coral for signed differences and orange for actions.

Fantasy UI isolation (DEC-31 in `docs/fantasy/DECISIONS.md`): `src/fantasy/styles/*.css` are
prefixed with `.fantasy-root` at build time and Tailwind is reverted inside that container. Do not
add Tailwind classes to `src/fantasy` components, do not import fantasy CSS elsewhere, and keep
`@source not "./fantasy"` in `src/index.css`. The fantasy Playwright suite runs with
`make e2e-fantasy`; the analytics one with `make e2e` while `make dev` is up.

Fantasy progress/decision logs live in `docs/fantasy/PROGRESS.md` and `docs/fantasy/DECISIONS.md`;
analytics scouting work in `docs/analytics/scouting/`. Run `make test` before committing; never
commit `data/analytics/`, `data/fantasy/nba/`, `data/fantasy/sessions/`, `exports/`, or any `.env`.
