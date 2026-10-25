# Fantasy UI migration into the Courtside frontend (phase 2)

Goal: the full ESPN 9-cat copilot (setup, draft, recap, health, season link/sync, performers,
imports/exports) runs inside `frontend/` at `/fantasy`, looks and behaves exactly like
`legacy/fantasy-frontend/`, and talks to `services/fantasy` through `/api/fantasy/*`.

## Decisions

1. **Verbatim port, not a rewrite.** `legacy/fantasy-frontend/src` is copied to
   `frontend/src/fantasy/` unchanged except: API base `/api/fantasy`, one template download href,
   a "Courtside analytics" link in its sidebar, and 9 strict-TypeScript fixes.
2. **Full-screen sub-app.** `/fantasy` is a top-level route rendered outside the analytics
   `AppShell`, so the fantasy charcoal sidebar / warm canvas layout is untouched. The fantasy hash
   router (`?session=<id>#/draft`) keeps working because it only reads `location.pathname`.
3. **CSS isolation at build time.** The eight fantasy stylesheets stay byte-identical; a PostCSS
   prefixer (`postcss-prefix-selector`, limited to `src/fantasy/styles/`) nests every rule under
   `.fantasy-root` and maps `:root`, `html`, `body`, `#root` to that container. Tailwind's preflight
   is neutralised inside the subtree with `.fantasy-root * { all: revert }` in `@layer base`, so the
   fantasy markup sees browser defaults exactly as it did standalone. The analytics global
   `:focus-visible` rule is excluded from the subtree with `:where(:not(.fantasy-root *))`.
4. **Fonts.** `index.html` also loads Barlow Semi Condensed and IBM Plex Mono.
5. **Tests travel with the code.** 21 vitest files run under the Courtside vitest config; the three
   Playwright specs live in `frontend/e2e/fantasy/` with their own config
   (`playwright.fantasy.config.ts`) that boots a throwaway fantasy API on a temp data dir.
6. **Verification of "looks the same".** Pixel diffs of the legacy UI and `/fantasy` rendering the
   same session at the same viewport, per screen.
7. `legacy/fantasy-frontend/` is removed once 5 and 6 pass; `services/fantasy/Makefile openapi`
   regenerates the client into `frontend/src/fantasy/api/`.

## Status (2026-10-24)

Done. Steps 1-6 complete; `legacy/fantasy-frontend/` removed. Outcome recorded as DEC-31 in
`docs/fantasy/DECISIONS.md` and in `docs/fantasy/PROGRESS.md`.

## Steps

1. Copy sources + specs, add deps (lucide-react, postcss-prefix-selector, openapi-typescript).
2. Wrapper `frontend/src/fantasy/FantasyApp.tsx`; route; nav entries; fonts; CSS scoping.
3. Strict TS fixes; vitest, tsc -b, oxlint.
4. Playwright: analytics smoke + fantasy suite.
5. Pixel comparison legacy vs migrated; fix any deltas.
6. Remove legacy, update Makefiles, README, CLAUDE.md, docs/fantasy/DECISIONS.md + PROGRESS.md.
