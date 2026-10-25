# Courtside Redesign v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Courtside readable and decision-oriented: a type scale that passes contrast in both themes, a shell whose breadcrumb, title, sidebar and URL never disagree, and page layouts that put the one decision each page serves first.

**Architecture:** Tokens and primitives change first (Phase 1) so every later page task builds on the same type scale, control heights, header, table and disclosure patterns. Route state becomes event-driven (every hash-query write dispatches `locationchange`; screens subscribe instead of reading the hash once). Page tasks (Phases 2–4) are independent of each other and run in parallel; none changes an API contract, a store's revision logic, or a calculation. Phase 5 verifies at four viewports, two themes and reduced motion, then updates the docs.

**Tech Stack:** React 19 + Vite, Tailwind v4 (analytics side only), plain scoped CSS under `.fantasy-root` (DEC-31), zustand, TanStack Query/Table, Plotly (`react-plotly.js/factory`), hand-written SVG charts, vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-25-courtside-redesign-v2-brief.md` (binding); `docs/superpowers/specs/2026-10-24-courtside-redesign.md` (still binds where the brief is silent). Audit inputs: the contrast table in this plan's Appendix A, the before-captures under the scratchpad `before/` folder (80 PNGs, four viewports).

## Global Constraints

- No Tailwind utility classes inside `frontend/src/fantasy`; keep `@source not "./fantasy"` and the `.fantasy-root` reverts in `frontend/src/index.css`. Fantasy styling stays in `frontend/src/fantasy/styles/*.css`.
- No change to `/api/analytics/*` or `/api/fantasy/*` routes, response shapes, calculations, revision checks (`lib/revision.ts`, `draftStore` pending-commit flow), FG%/FT% aggregation, turnover direction, "—" for missing values, or demo/real separation.
- Body text 14–16px; table text 13–14px; nothing textual below 12px, and 12px only for secondary metadata. Every text token on every surface it is used on must measure ≥ 4.5:1 in both themes (Task 1 adds the test).
- Control heights: inputs/selects/buttons 34px (`sm` 28px), tabs 36px, hit targets ≥ 28px on desktop and ≥ 40px on touch widths (< 640px).
- Page gutter: 24px at ≥ 640px, 16px below; section gap 20px; panel padding 16px.
- Keep every `data-testid`, role and accessible name listed in Appendix B (the Playwright and vitest suites rely on them). Add new ids; do not rename.
- Teal/coral only for favourable/unfavourable and over/under expectation, always with a sign, glyph or label; orange only for actions and selection; amber for draft status and "mine".
- Reduced motion disables every transition and animation (existing `@media (prefers-reduced-motion: reduce)` blocks stay and gain any new keyframe).
- Commit after each task with a conventional message; run `npm run typecheck`, `npm run lint` (warnings in files you touched are errors) and `npx vitest run` before every commit.

## Review Focus

1. A fantasy session whose `league.categories` has eight entries (no TOV): matchup, power, free-agent and draft category lists must show exactly those eight, never a hard-coded nine (Task 6 test `renders only the league's categories`).
2. Browser Back after switching season tabs: the tab, breadcrumb, document title and sidebar item must all return together (Task 2 e2e `back restores the previous tab everywhere`).
3. A player with no headshot and a team with no logo (demo snapshot, or CDN blocked): initials and tricode fallbacks with the same footprint, no broken-image icon, no layout shift (Task 11 test `falls back without changing size`).
4. A 390px-wide draft screen while a pick is being saved: the on-clock cell, recommendation and "Draft to my team" button must stay visible without horizontal scroll, and the recommendation card must not change height when `rec-updating` appears (Task 5 test `keeps the card height while refining`).
5. Light theme: every link, delta, warning and demo chip must still be readable (Task 1 contrast test runs both themes; Task 15 captures light at 1440 and 390 for every page).

---

## Phase 1: foundations (sequential; everything else depends on these)

### Task 1: Type scale, contrast-safe tokens, control heights

**Files:**
- Modify: `frontend/src/index.css` (tokens `:root` and `[data-theme="light"]`, `@theme inline`, `body`, `.control`, add `--text-*` sizes)
- Modify: `frontend/src/fantasy/styles/tokens.css` (`--fs-*`), `base.css`, `shell.css`, `ui.css`, `draft.css`, `season.css`, `performers.css`, `charts.css` (literal sizes, hard-coded colours)
- Modify: analytics files using `text-[10px]`/`text-[11px]`/`text-ink-4` for text (Appendix A lists them)
- Create: `frontend/src/lib/contrast.ts`, `frontend/src/lib/contrast.test.ts`
- Create: `frontend/scripts/contrast-report.mjs` (prints the matrix; same math as the lib)

**Interfaces:**
- Produces: `contrastRatio(fg: string, bg: string): number` and `composite(rgba: string, over: string): string` in `lib/contrast.ts`; `readThemeTokens(css: string, theme: 'dark' | 'light'): Record<string, string>`.
- Produces: token values every later task may rely on (exact):
  - dark: `--c-ink-3: #a19b91`, `--c-ink-4: #6f6a62` (decorative only; no text under 14px), `--c-line-strong: rgba(255,255,255,.22)`, `--c-control-line: rgba(255,255,255,.28)`.
  - light: `--c-ink-3: #66615a`, `--c-ink-4: #8f8a82`, `--c-accent: #b8500f`, `--c-accent-hover: #d4621a`, `--c-pos: #0f7d70`, `--c-neg: #b53d31`, `--c-amber: #8a5d0b`, `--c-amber-fill: #e0a63a` (badge backgrounds only, with `--c-accent-ink` text), `--c-line-strong: rgba(20,18,14,.28)`, `--c-control-line: rgba(20,18,14,.34)`.
  - Tailwind sizes in `@theme inline`: `--text-xs: 13px` (line-height 18px), `--text-sm: 14px` (20px), `--text-base: 15px` (22px), new utility `text-meta` = 12px (16px) for secondary metadata only.
  - Fantasy sizes: `--fs-xs: 12px`, `--fs-sm: 13px`, `--fs: 14px`, `--fs-md: 16px`, `--fs-lg: 18px`, `--fs-xl: 24px`, `--fs-2xl: 32px`; `.fantasy-root` and `.app-main.embedded` font-size `var(--fs)`.
  - Control heights: analytics `.control` `min-height: 34px; padding: 6px 10px`; `Button` md 34px / sm 28px; `Tabs` md 36px; fantasy `input, select, textarea, button` `min-height: 34px`, `button.small` 28px, `.segmented button` 28px, `.tabs button` 36px, `.status-strip select` 28px.

- [ ] **Step 1: Write the failing contrast test**

`frontend/src/lib/contrast.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { contrastRatio, composite, readThemeTokens } from './contrast'
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const PAIRS: Array<[fg: string, bg: string, min: number]> = [
  ['--c-ink', '--c-page', 4.5], ['--c-ink', '--c-overlay', 4.5],
  ['--c-ink-2', '--c-page', 4.5], ['--c-ink-2', '--c-overlay', 4.5],
  ['--c-ink-3', '--c-page', 4.5], ['--c-ink-3', '--c-surface', 4.5], ['--c-ink-3', '--c-raised', 4.5], ['--c-ink-3', '--c-overlay', 4.5],
  ['--c-accent', '--c-page', 4.5], ['--c-accent', '--c-surface', 4.5], ['--c-accent', '--c-raised', 4.5],
  ['--c-accent-ink', '--c-accent', 4.5],
  ['--c-pos', '--c-page', 4.5], ['--c-pos', '--c-surface', 4.5], ['--c-neg', '--c-page', 4.5], ['--c-neg', '--c-surface', 4.5],
  ['--c-amber', '--c-page', 4.5], ['--c-amber', '--c-surface', 4.5],
  ['--c-accent-ink', '--c-amber-fill', 4.5],
  ['--c-control-line', '--c-surface', 2.5],
]
describe.each(['dark', 'light'] as const)('%s theme text contrast', (theme) => {
  const t = readThemeTokens(css, theme)
  it.each(PAIRS)('%s on %s ≥ %s', (fg, bg, min) => {
    const over = t[bg].startsWith('rgba') ? composite(t[bg], t['--c-surface']) : t[bg]
    const front = t[fg].startsWith('rgba') ? composite(t[fg], over) : t[fg]
    expect(contrastRatio(front, over)).toBeGreaterThanOrEqual(min)
  })
})
it('ink-4 is never used as a text colour', () => {
  // grep-style guard: no `text-ink-4` utility and no `color: var(--ink-4)` in CSS
})
```
The ink-4 guard reads `frontend/src` recursively (skip tests) and asserts zero matches for `text-ink-4` and `color: var(--ink-4)` / `color: var(--c-ink-4)`.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/lib/contrast.test.ts`
Expected: FAIL — module `./contrast` not found.

- [ ] **Step 3: Implement `lib/contrast.ts`** — WCAG 2.x relative luminance; `readThemeTokens` parses the `:root { … }` block, then overlays the `:root[data-theme="light"] { … }` block when `theme === 'light'`; supports `#rgb`, `#rrggbb`, `rgb()`, `rgba()`.

- [ ] **Step 4: Change the tokens** in `index.css` to the values in Interfaces; add `--c-control-line` and `--c-amber-fill` to both themes and to `@theme inline` (`--color-control-line`, `--color-amber-fill`). Change `select.control, input.control` to use `--c-control-line` and the heights above. Add the `--text-*` sizes and the `text-meta` utility (`@utility text-meta { font-size: 12px; line-height: 16px; }`).

- [ ] **Step 5: Replace sub-13px analytics text** — every `text-[10px]` and `text-[11px]` in Appendix A becomes `text-meta` (metadata: nav group labels, kbd hints, table header labels, badge text, portrait tricode) or `text-xs` (anything a person reads as content). Replace every `text-ink-4` on text with `text-ink-3`. Keep `text-ink-4` only on dividers/placeholders. `StatTile` label becomes `text-meta uppercase tracking-wide text-ink-3`; `DataTable` header cells `text-xs`. `Button` sizes per Interfaces. Sidebar group labels: `text-meta font-semibold uppercase tracking-[0.1em] text-ink-3`.

- [ ] **Step 6: Fantasy sizes and colours** — set the `--fs-*` scale; replace literals `9px`, `10px`, `10.5px`, `11px` in the files listed in Appendix A with `var(--fs-xs)` (or remove the rule where the element is decorative); replace `#fff` in `shell.css:69,202-211` and the pastel `#8fe0a8`/`#ff9c94` in `draft.css:115,121` with `var(--ink)`, `var(--good)`, `var(--bad)`; `.ctx.demo` uses `background: var(--c-amber-fill); color: var(--c-accent-ink)`. Fantasy `font-weight: 700` on non-display selectors becomes 600. Control heights per Interfaces. Hover borders use `var(--teal)` (accent) instead of `var(--ink-4)`.

- [ ] **Step 7: Run the contrast test and the whole frontend suite**

Run: `cd frontend && npx vitest run && npm run typecheck && npm run lint`
Expected: contrast tests PASS for both themes; existing tests PASS (fix any that asserted a now-changed class).

- [ ] **Step 8: Write `scripts/contrast-report.mjs`** that imports the same lib via `tsx`-free approach (duplicate the three functions in plain JS, 40 lines) and prints the Appendix A matrix for both themes; run it and paste the output into the task's commit message body.

- [ ] **Step 9: Commit** — `feat(ui): raise the type scale and make tokens pass contrast in both themes`

### Task 2: Route state, shell context and navigation hierarchy

**Files:**
- Modify: `frontend/src/fantasy/lib/hashQuery.ts`, `hashQuery.test.ts`
- Modify: `frontend/src/components/layout/nav.ts`, `nav.test.ts`, `AppShell.tsx`
- Create: `frontend/src/store/crumb.ts` (page-provided breadcrumb + title), `frontend/src/components/layout/ShellContext.tsx` (fantasy and research context clusters, extracted from AppShell), `frontend/src/components/layout/useDocumentTitle.ts`
- Modify: `frontend/src/fantasy/screens/SeasonScreen.tsx`, `PerformersScreen.tsx`, `frontend/src/fantasy/components/season/FreeAgentsTab.tsx` (use the new hash-query hook)
- Modify: `frontend/src/fantasy/FantasyApp.tsx` (title no longer hard-coded; it comes from the crumb store)
- Modify: `frontend/src/pages/PlayerProfile.tsx`, `TeamDetail.tsx`, `GameDetail.tsx` (set page crumbs)
- Modify: `frontend/src/components/CompareTray.tsx`, `frontend/src/pages/Compare.tsx` (the "Compare · n/6" control)
- Create: `frontend/e2e/fantasy/navigation.spec.ts`

**Interfaces:**
- `hashQuery.ts` adds `setHashQuery(patch: Record<string, string | null>, opts?: { push?: boolean }): void` (writes with `pushState` when `push`, else `replaceState`, then dispatches `new Event('locationchange')`); `replaceHashQuery` stays as an alias of `setHashQuery(patch)` so nothing else breaks; `useHashQuery(): HashQuery` subscribes to `hashchange`, `popstate`, `locationchange`.
- `nav.ts`: the Fantasy group becomes `draft`, `recap`, `season` (label "My league", `to: '#/season'`), `performers`, `setup`; `league-matchups` is removed. `activeNavId('/fantasy', '#/season?tab=matchups')` returns `'season'`. New `export const SEASON_TABS: Array<{ id: 'matchups'|'power'|'free-agents'|'results'|'predictions'; label: string }>` lives in nav.ts (the single source for sidebar sub-items, SeasonScreen tabs and crumbs). New `fantasyCrumbs(hash: string): string[]` returns e.g. `['My league', 'Matchups']`, `['Performers']`, `['Draft']`.
- `store/crumb.ts`: `useCrumb` zustand store `{ parts: Array<{ label: string; to?: string }>; set(parts): void; clear(): void }`; pages call `useSetCrumb(parts)` (effect hook that sets on mount/change and clears on unmount).
- AppShell derives the breadcrumb: group label › item label › crumb parts (fantasy: the season tab; research detail pages: the page-set parts). `document.title` = `${last crumb} · Courtside`.
- The sidebar shows the five `SEASON_TABS` as indented sub-items under "My league" only while `activeId === 'season'`; each sub-item links to `#/season?tab=<id>` and the active one gets `aria-current="page"`.
- `ShellContext.tsx` exports `FantasyContextBar` (session select · league name · "Week N" · "synced <time>" · demo chip, one row, 34px controls) and `ResearchContextBar` ("NBA season" labelled picker, season type, `PlayerSearch`, `CompareTray`). The fantasy page headers stop rendering League/Week/Synced chips (SeasonScreen, PerformersScreen keep only Team/Scoring chips).
- `CompareTray` renders the control `Compare · {n}/6` (button, opens the tray popover listing players with remove buttons; disabled look at 0 with title "Add players from the explorer or a profile"). `Compare.tsx` empty state reuses it.

- [ ] **Step 1: Write failing unit tests**

`hashQuery.test.ts` adds:
```ts
it('setHashQuery dispatches locationchange and pushes when asked', () => {
  const seen: string[] = []
  window.addEventListener('locationchange', () => seen.push(window.location.hash))
  window.location.hash = '#/season?tab=matchups'
  const before = window.history.length
  setHashQuery({ tab: 'power' }, { push: true })
  expect(window.location.hash).toBe('#/season?tab=power')
  expect(seen).toEqual(['#/season?tab=power'])
  expect(window.history.length).toBe(before + 1)
  setHashQuery({ week: '3' })
  expect(window.history.length).toBe(before + 1)
})
it('useHashQuery re-renders on locationchange', () => { /* renderHook, act(setHashQuery), expect(result.current.tab) */ })
```
`nav.test.ts` replaces the `league-matchups` expectation with `expect(activeNavId('/fantasy', '#/season?tab=matchups')).toBe('season')` and adds `expect(fantasyCrumbs('#/season?tab=free-agents')).toEqual(['My league', 'Free agents'])`, `expect(fantasyCrumbs('#/performers?team=m05')).toEqual(['Performers'])`.

- [ ] **Step 2: Run them to verify they fail** — `npx vitest run src/fantasy/lib/hashQuery.test.ts src/components/layout/nav.test.ts`; expected: `setHashQuery is not a function`, crumbs undefined.

- [ ] **Step 3: Implement hashQuery, nav, crumb store, ShellContext, AppShell** per Interfaces. In `AppShell`, replace the local `hash` state + three listeners with one `useLocationHash()` hook (same events) and add `useDocumentTitle`. SeasonScreen: `const tab = tabFrom(useHashQuery().tab)`; `pick(t)` → `setHashQuery({ tab: t }, { push: true })`. PerformersScreen and FreeAgentsTab: `setHashQuery(patch)` (replace) for filters. `FantasyApp` drops its `document.title` effect.

- [ ] **Step 4: Write the Playwright regression** `e2e/fantasy/navigation.spec.ts` (runs with `playwright.fantasy.config.ts`, uses the same demo setup helpers as `season.spec.ts` to get a drafted, linked session):
```ts
test('tab changes keep URL, breadcrumb, title and sidebar in step; back restores the previous tab everywhere', async ({ page }) => {
  await page.goto(`/fantasy?session=${sid}#/season?tab=matchups`)
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('My league')
  await page.getByTestId('season-tab-power').click()
  await expect(page).toHaveURL(/#\/season\?tab=power/)
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Power rankings')
  await expect(page).toHaveTitle(/Power rankings/)
  await expect(page.getByRole('link', { name: 'Power rankings' })).toHaveAttribute('aria-current', 'page')
  await page.goBack()
  await expect(page).toHaveURL(/tab=matchups/)
  await expect(page.getByTestId('season-tab-matchups')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Matchups')
  await page.reload()
  await expect(page.getByTestId('season-tab-matchups')).toHaveAttribute('aria-selected', 'true')
})
test('sidebar keeps the session when moving between fantasy screens and research pages', async ({ page }) => {
  // from #/season go to Performers via the sidebar → URL has ?session=sid; go to /explorer → come back via sidebar "My league" → same session, tab=matchups
})
test('player profile breadcrumb names the player', async ({ page }) => {
  // /players/<id> → breadcrumb "NBA research / Players / <name>", sidebar Explorer current
})
```

- [ ] **Step 5: Run unit + e2e** — `npx vitest run`, `npm run typecheck`, `npm run lint`, then `make e2e-fantasy` (dev stack up). Expected: all PASS; the old `league-matchups` deep link `#/season?tab=matchups` still opens the matchups tab.

- [ ] **Step 6: Commit** — `fix(shell): one navigation hierarchy; URL, breadcrumb, title and sidebar stay in sync`

### Task 3: Shared presentation primitives

**Files:**
- Modify: `frontend/src/components/layout/PageHeader.tsx` (add `context?: ReactNode` slot, `tabs?: ReactNode`, tighter copy limits), `frontend/src/components/ui/index.tsx` (`Panel` gains `compact`; `EmptyState` gains `icon`; add `Notice`, `LinkButton`), `Toolbar.tsx` (sticky option), `Tabs.tsx` (36px), `components/table/DataTable.tsx` (`pinFirstColumn`, `stickyHeader`, `rowHeight` 36, `maxHeight`, keyboard row focus)
- Create: `frontend/src/components/ui/Disclosure.tsx` (`<details>`-based, `summary`, `defaultOpen`, used for methods/assumptions), `frontend/src/components/ui/Freshness.tsx` (`label`, `at: string | null`, `rows?`, tone by age), `frontend/src/components/ui/Drawer.tsx` (side panel: focus trap, Esc, focus return, `aria-labelledby`, `width`), `frontend/src/components/charts/ChartFrame.tsx` (title, question, legend chips, actions, `height`, unavailable state; wraps Plotly or SVG), `frontend/src/components/charts/hover.ts` (`hoverTemplate(rows: Array<[label, value]>)` for Plotly)
- Fantasy mirrors (plain CSS, same names and props where they already exist): `fantasy/components/ui/Drawer.tsx` (extract from `PlayerDrawer`/`PerformerDrawer` the trap/Esc/return logic), `Freshness.tsx`, extend `Disclosure` with `aside`. Styles in `ui.css`.
- Tests: `components/ui/Disclosure.test.tsx`, `Drawer.test.tsx` (focus moves in, Esc closes, focus returns), `Freshness.test.tsx`, `table/DataTable.test.tsx` (pinned column has `position: sticky`, Arrow keys move the focused row), fantasy `ui/Drawer.test.tsx`.

**Interfaces (produced):**
- `PageHeader({ title, lede?, context?, actions?, tabs?, chips? })` — `lede` ≤ 160 characters (enforce with a dev-time `console.warn`? No: enforce by review); `context` renders right-aligned on the title row.
- `Disclosure({ summary: string, children, defaultOpen?, testId? })`.
- `Freshness({ label: string, at: string | null, detail?: string })` renders `label · <relative time>` with a dot tone: ≤ 24h accent, ≤ 7d ink-2, older warning, null "never".
- `Drawer({ open, onClose, title, children, width?: 'md' | 'lg', testId? })`.
- `ChartFrame({ title, question?, legend?: Array<{ label, color?, swatch?: 'pos'|'neg'|'accent'|'neutral'|'hatched' }>, actions?, height?: number, unavailable?: ReactNode, children })`.
- `DataTable` new props: `pinFirstColumn?: boolean`, `stickyHeader?: boolean` (default true), `maxHeight?: number`, `focusable?: boolean` (rows get `tabIndex=0`, Enter triggers `onRowClick`).

- [ ] **Step 1: Write failing tests** for Disclosure, Drawer (both sides), Freshness, DataTable pin/keyboard, with the assertions named above.
- [ ] **Step 2: Run them; expected FAIL (modules missing / props ignored).**
- [ ] **Step 3: Implement** per Interfaces. `Drawer` focus management: on open, focus the first focusable or the panel; trap Tab; Esc → `onClose`; on close, restore focus to the element that had it. Fantasy `PlayerDrawer` and `PerformerDrawer` are rewritten to use the fantasy `Drawer` (keep `data-testid="player-drawer"`, `performer-detail`).
- [ ] **Step 4: Run tests, typecheck, lint; PASS.**
- [ ] **Step 5: Commit** — `feat(ui): disclosure, drawer, freshness, chart frame and pinned data-table primitives`

---

## Phase 2: Overview and draft (parallel after Phase 1)

### Task 4: Overview around the week's decision

**Files:**
- Modify: `frontend/src/pages/Overview.tsx`, `pages/overview/MatchupSummary.tsx`, `FeatureCard.tsx`, `TrackRecord.tsx`; create `pages/overview/CategoryOutlook.tsx`, `pages/overview/NextActions.tsx`
- Test: `pages/overview/Overview.test.tsx` (render with mocked `useOverviewData`)

**Interfaces:**
- Consumes: `SeasonOverview.user_matchup.odds` (`p_win_a`, `p_tie`, `p_win_b`, `expected_a/b`, `cat_p_a`, `games_a/b`, `notes`), `league_categories`, `power` rows (`rank`, `expected_cats`, `cat_win_prob`), performers (`contributor`, `overperformer`), predictions (`decided`, `hit_rate`, `brier`).
- Layout (12-col grid at ≥ 1024px): row 1 = matchup feature (col 1–8) + rank/outlook (col 9–12); row 2 = leading contributor | biggest overperformer | next actions (three equal columns, plain `Panel tone="plain"`, no card borders); row 3 = recently viewed (identity chips in one row).
- Matchup feature: headline `Aaron (you) vs Manager 02`; a three-part outcome line in words and numbers: "Win 94% · Tie 3% · Lose 2%" (from `p_win_a`, `p_tie`, `p_win_b`, labelled "simulated"), "Expected categories 6.4 – 1.6 of 8", "Games 40 · 28 (scheduled this week)". Category list: one row per `league_categories` entry with a single bar of `cat_p_a` on a fixed 0–100% scale, value printed, and a "close" marker (≤ 60% and ≥ 40%) rendered as an amber dot plus the word "close" so colour is not the only cue; rows sorted by the league's category order, not by value.
- Outlook block: rank (`#2 of 13`), expected categories, then the three weakest categories from `cat_win_prob` as "Vulnerable: Threes made 40% · FG% 61% · …" in plain text.
- Track record: when `decided === 0` render one sentence: "Results are scored after each scoring period ends; the first arrives after week 1." No KPI tiles. When decided > 0 keep the existing hit rate + Brier tiles.
- Next actions: links built from existing data only — "Review free agents" (`#/season?tab=free-agents`), "See this week's performers" (`#/performers?team=<user>&week=<period>`), "Open my matchup" (`#/season?tab=matchups`); omit when not linked.
- Method copy moves into one `Disclosure` "How the odds are made" at the bottom (existing text).

- [ ] **Step 1: Write failing render tests** `Overview.test.tsx`: `shows win, tie and lose chances separately`, `lists exactly the league's categories in league order`, `marks close categories with the word close`, `explains the empty track record in one sentence`.
- [ ] **Step 2: Run; FAIL.**
- [ ] **Step 3: Implement** per Interfaces (reuse `PlayerIdentity size="md"`, `StatTile`, `Panel tone="plain"`, `Disclosure`, `ChartFrame` not needed).
- [ ] **Step 4: Run tests, typecheck, lint; PASS.** Capture `/` at 1440 and 390 with `scripts/capture-screens.mjs --pages overview` and inspect.
- [ ] **Step 5: Commit** — `feat(overview): matchup-first overview with separated chances, category outlook and next actions`

### Task 5: Draft screen for time pressure

**Files:**
- Modify: `frontend/src/fantasy/screens/DraftScreen.tsx`, `components/draft/Scoreboard.tsx`, `RecommendationCard.tsx`, `PlayerPicker.tsx`, `ShortlistTable.tsx`, `RosterPanel.tsx`, `StrategyPanel.tsx`; `styles/draft.css`
- Create: `components/draft/RecReasons.tsx` (top-3 reasons + Disclosure "All reasons"), `components/draft/ImpactBars.tsx` (category impact with zero baseline), `components/draft/TechStatus.tsx` (timing, tier, revision, save status in one 28px line)
- Tests: `components/draft/RecommendationCard.test.tsx` (new), `ImpactBars.test.tsx`

**Interfaces:**
- Consumes draftStore selectors unchanged: `selectRecCurrent`, `selectRefineCurrent`, `selectTier`, `previewCandidate`, `commitPick`, `undoLastPick`, keyboard shortcuts in `lib/keyboard.ts`.
- Scoreboard (status strip) keeps ids `top-on-clock`, `top-picks-until`, `top-round`, `top-overall`, `top-format`, `top-save-status`, `top-my-team`, `top-my-next` and shows only: On the clock (large), Round·pick, My next pick (+ picks away), Undo. Format badge and data date move to `TechStatus`.
- Layout: two columns at ≥ 1180px: left `minmax(280px, 340px)` = picker; right = recommendation card then workspace tabs; the "My team" panel becomes a third column only at ≥ 1480px, otherwise a Drawer opened from a "My team · 3/13" button in the recommendation header (keeps `tab-roster`, `tab-categories`, `tab-strategy`, `tab-teams` inside the drawer). At < 760px keep the existing mobile pane tabs.
- RecommendationCard: `min-height` fixed at 300px desktop so refinement never changes height; header kicker reads "Best pick now" or "Previewing <name>" (when `previewCandidate`), with a visible "Back to recommendation" link in preview mode; keep `rec-name`, `rec-draft`, `rec-updating`. Three labelled blocks in a row: "Projected" (GP, MIN, three key per-game stats), "Fantasy value" (value above replacement ± sd, availability sentence), "Category impact" (`ImpactBars`). Primary action `Draft to my team` is the first focusable element after the name and stays within the first 720px of page height at 1280×800 (assert with a Playwright `boundingBox` check in Task 15).
- `ImpactBars`: one row per league category, centred zero line, bars on a shared symmetric scale = `symmetricMax` of the shown values, value with sign and unit "z", lower-is-better categories keep the "lower is better" label.
- `RecReasons`: first three `reasons` strings, then `Disclosure summary="All reasons and model notes"` with the rest plus the refine notes.
- `TechStatus`: "fast ranking 13 ms · tier A · refining 4.0 s · saved" as one meta line, `title` with revision ids.

- [ ] **Step 1: Write failing tests**: `RecommendationCard.test.tsx` `shows the preview kicker and a way back when previewing`, `keeps the card height while refining` (render with `recStatus:'refining'` and `rec-updating`, assert the wrapper has `style.minHeight === '300px'` and the name node is present), `ImpactBars.test.tsx` `draws a zero baseline and symmetric scale`.
- [ ] **Step 2: Run; FAIL.**
- [ ] **Step 3: Implement.** Do not touch `commitPick`, the confirm dialog (`confirm-pick-dialog`, `confirm-pick-player`, `confirm-pick-manager`), `/` focus, Enter-to-record, or undo (`board-undo`).
- [ ] **Step 4: Run vitest + `make e2e-fantasy` (draft.spec and strategy_import.spec must stay green).**
- [ ] **Step 5: Commit** — `feat(draft): recommendation-first draft layout with impact bars and a quiet status line`

---

## Phase 3: league screens (parallel after Phase 1)

### Task 6: League matchups

**Files:**
- Modify: `fantasy/components/season/MatchupsTab.tsx`, `MatchupCard.tsx`, `fantasy/components/charts/ProbabilityPair.tsx`, `styles/season.css`, `charts.css`; tests `MatchupCard.test.tsx`, `MatchupsTab.test.tsx`

**Interfaces:**
- Consumes `MatchupOddsView` (`p_win_a`, `p_tie`, `p_win_b`, `expected_a`, `expected_b`, `cat_p_a`, `games_a`, `games_b`, `notes`, `modal_score`) and ESPN actuals already on the card.
- Card surface: `var(--surface)` with a 3px accent rail when featured (`.mine` keeps amber rail only for the user's card); no tinted background.
- Two labelled sections inside the featured card: "Projected outcome (simulated)" — headline "Win 94% · Tie 3% · Lose 2%", expected categories `6.4 – 1.6`, games `40 · 28`, then the category rows; "Actual totals (ESPN, running)" — the per-category totals table with FG%/FT% from makes ÷ attempts, shown only when actuals exist.
- Category rows (`ProbabilityPair`): one centred bar per category: left share = `cat_p_a`, right = `1 - cat_p_a - tie` when the API gives a per-category tie (it does not: label the right side "opponent or tie" and compute `1 - cat_p_a`), values printed on both ends, "close" chip when 40–60%, sorted in league order; `cat-<KEY>` test ids unchanged.
- Injury/schedule context: a compact line "Games 40 · 28 · 4 players out" with a `Disclosure summary="Assumptions and notes"` holding `notes`.
- Week select stays in the toolbar above the cards; the other pairings become a compact list (team, team, win% for the favourite) under the featured card.

- [ ] **Step 1: Failing tests**: `renders only the league's categories` (pass a league with 8 categories, assert 8 `cat-*` ids and no `cat-TOV`), `separates projected and actual sections`, `prints win, tie and lose`.
- [ ] **Step 2: Run; FAIL. Step 3: Implement. Step 4: vitest PASS. Step 5: Commit** — `feat(season): matchup cards separate projected outcome from actual totals`

### Task 7: Power rankings

**Files:**
- Modify: `fantasy/components/season/PowerTab.tsx`, `fantasy/components/charts/Heatmap.tsx`, `Diverging.tsx`, `styles/charts.css`, `season.css`; test `PowerTab.test.tsx` (new)

**Interfaces:**
- Heatmap: first column (`#`, team) `position: sticky; left: 0`, header row sticky; row height 36px, 14px text; probability scale fixed 0–100% with the legend "0–100% chance to win the category against the league-average opponent; 40–60% is a toss-up"; sortable by any column (click header → `aria-sort`), default by `expected_cats`; selected row `aria-selected` with an accent rail; `power-table` and `tbody tr.mine` unchanged.
- "Cats / week" header carries an `Info` explaining "expected categories won per week against the league-average opponent over 600 simulated weeks". "Move" header: "rank change since the last sync that changed a roster".
- Selecting another team shows a comparison block under the table: `Diverging`-style paired bars per category — my z vs their z on one shared symmetric scale, with both values printed; title "Aaron vs Manager 03"; "Clear" returns to my profile.

- [ ] **Step 1: Failing tests**: `sorts by a column and marks aria-sort`, `selecting another team shows a two-team comparison with values`.
- [ ] **Steps 2–5** as in Task 6. Commit — `feat(season): sortable, sticky power rankings with a two-team comparison`

### Task 8: Free agents around the swap

**Files:**
- Modify: `fantasy/components/season/FreeAgentsTab.tsx`, `FreeAgentsTable.tsx`, `SwapActuals.tsx`, `MinutesOverride.tsx`, `styles/season.css`; tests `FreeAgentsTab.test.tsx`, `FreeAgentsTable.test.tsx`

**Interfaces:**
- Layout: filters row (search · position · hide OUT · rank-by segmented · `Freshness label="Game logs" at={gameLogs.fetched_at}` · Refresh) → compact table → detail panel below the table (not above): `swap-panel` keeps its id.
- Compact table columns (projection mode): Player (identity, 36px row), Status, Own%, MIN (`minutes-cell`), Value, Best drop, Net Δ, and an expand control (`aria-expanded`) that reveals the category z row inline (`data-testid="fa-detail-row"`). "Advanced table" toggle (`data-testid="fa-advanced"`) shows the full category columns as today.
- Units: Value header `Info` "weighted z: season-total z-scores summed over your league's categories, vs the ~200-player pool"; Net Δ "add minus drop, same units".
- Swap panel: title "Add <A>, drop <B>"; one `Diverging`-style chart with two series per category (add in accent, drop hatched) on a shared scale, values printed; actual vs projected lines keep labels "Actual (this week/season)" and "Projected"; the minutes line and `MinutesOverride` stay (`swap-minutes`, Apply, Clear override); `MinutesOverride` shows the default in the placeholder ("projected 26.5"), validates 0–48 with an inline message, and shows "Saved · ranking refreshed" for 3 s after a successful save.
- Selection survives reloads of the list (key by `player_id`; scroll position preserved by not remounting the table on `freeAgents` change).
- States: loading skeleton rows (5), empty "No free agents match", stale (logs older than 24h: Freshness warning tone), error (`ErrorState` with retry).

- [ ] **Step 1: Failing tests**: `expands a row to show category detail`, `advanced toggle shows the full table`, `minutes override validates range and confirms a save`, `freshness shows the logs age next to the refresh button`.
- [ ] **Steps 2–5.** Keep every id in Appendix B. Commit — `feat(season): free agents ranked around the swap, with detail rows and a clearer swap panel`

### Task 9: Performers

**Files:**
- Modify: `fantasy/screens/PerformersScreen.tsx`, `components/performers/{FeatureCard,LeaderboardCard,PerformerTable,PerformerDrawer,Explainer}.tsx`, `fantasy/components/charts/Heatmap.tsx` (sorting from Task 7), `styles/performers.css`; tests `PerformerTable.test.tsx`, new `PerformersScreen.test.tsx`

**Interfaces:**
- Order: header (team · week/season · totals/per-game, one toolbar) → team summary (`StatRow`: contribution, expected, vs expected, games) → key players (two `FeatureCard`s only: leading contributor, biggest overperformer, each with "NBA profile" link) → category heatmap (sortable, 36px rows) → actual-vs-expected scatter → detailed table. The two leaderboard cards are removed (the table covers them); the always-unavailable trend chart is removed.
- Unit copy: the StatRow caption reads "Units: category standard deviations × games (one unit ≈ one average starter-game in one category)"; the mode chip "Totals" / "Per game" is repeated on the heatmap and table captions.
- Each small-sample result keeps its "n GP · small sample" tag beside the number.
- Opening a profile uses `fantasyHref` back-link state so Back returns to `#/performers?team=&week=` (existing behaviour; add the test).

- [ ] **Step 1: Failing tests**: `does not repeat a player across sections except the table`, `captions carry the active unit mode`, `heatmap sorts by a category`.
- [ ] **Steps 2–5.** Commit — `feat(performers): one order, fewer repeats, sortable category heatmap`

---

## Phase 4: research pages (parallel after Phase 1 and 3)

### Task 10: Explorer and compare interaction

**Files:**
- Modify: `pages/LeagueExplorer.tsx`, `pages/explorer/{ExplorerChart,ExplorerTable,FilterRow,state}.tsx|ts`, `components/CompareTray.tsx`; tests `pages/explorer/*.test.tsx`

**Interfaces:**
- Toolbar (Task 3 `Toolbar`) directly above the chart: presets, X, Y, size, colour, median toggle, Reset; population filters collapse into a `Disclosure summary="Population: 490 shown · 92 hidden"` above the toolbar.
- Chart: `baseConfig` plus `modeBarButtons: [['select2d','lasso2d','resetScale2d']]` with a visible caption "Drag to box-select · lasso · reset"; markers 7px, 55% opacity, 1px line; selected ids drawn as an overlay ring in accent; a legend under the chart states "Size: Points / game · Colour: none".
- Interaction: single click selects (URL `selected`), highlights the table row and shows a small `PlayerIdentity` + "Open profile →" + "Add to compare" strip under the chart (`data-testid="explorer-selection"`); no second-click navigation anywhere. Lasso → `compare.set` as today.
- `ExplorerTable`: `DataTable pinFirstColumn focusable`; row click = select; profile link is the name.

- [ ] **Step 1: Failing tests**: `single click selects and shows the selection strip`, `table row click selects without navigating`, `legend states size and colour encodings`.
- [ ] **Steps 2–5.** Commit — `feat(explorer): select-then-act interaction, visible encodings, simpler chart controls`

### Task 11: Player profile

**Files:**
- Modify: `pages/PlayerProfile.tsx`, `pages/player/{ProfileHero,FocusSummary,CareerTimeline,TrendGrid,FantasyPanel}.tsx`, `components/ui/identity.tsx`; tests `components/ui/identity.test.tsx`, `pages/player/CareerTimeline.test.tsx`

**Interfaces:**
- Hero: portrait `xl` with the Task 1 fallback; one status badge at most (Active/Injured from fantasy status when a session is open, else none); the fantasy line reads "Fantasy: C · ACTIVE · 43% owned · rank 176 · projection blend" as text, not badges.
- Season controls: the hero's "Season in focus" select is labelled "Profile season" with helper text "NBA research season (toolbar) sets the league context; this picks the season the profile reads"; the global picker stays in the toolbar.
- Key stats: `StatRow` of 8 tiles; tiles show the sample "78 GP" under the first tile.
- CareerTimeline: horizontal scroll container with fade edges and "← →" buttons (`aria-label="Earlier seasons"/"Later seasons"`), cells 160px, focus-visible scroll into view.
- TrendGrid: shared y-scale per metric across the grid noted in the caption; the focus season marker and the "under 200 minutes" hollow marker get a legend row.
- `Portrait`/`TeamMark` fallbacks: identical box size, `data-testid="portrait-fallback"` kept; `TeamMark` fallback renders the tricode in a 20×20 box.

- [ ] **Step 1: Failing tests**: identity `falls back without changing size`, timeline `scroll buttons move the strip and are labelled`.
- [ ] **Steps 2–5.** Commit — `feat(profile): scannable hero, distinct season scopes, discoverable timeline`

### Task 12: Shooting lab and matchups research

**Files:**
- Modify: `pages/ShootingLab.tsx`, `pages/shooting/{ViewControls,BinDetail,ZoneTable}.tsx`, `components/court/{CourtChart,CourtLegend}.tsx`; `pages/MatchupExplorer.tsx`, `pages/matchups/{SubjectBar,CalloutStrip,MatchupChart,MatchupChartControls}.tsx`

**Interfaces:**
- Shooting: at ≥ 1024px a two-column layout `minmax(0, 1fr) 360px`: court (width-driven, capped at 640px tall) left; right column = legend, zone summary (`ZoneTable` compact), selected bin detail (`BinDetail`), comparison subject when set. Court ↔ zone row selection linked via the existing `sel` URL param (hover a zone row → outline the zone; click → select). Encodings stay: frequency = size/opacity, accuracy = colour, relative = diverging; the legend names all three.
- Matchups: order = subject bar → result strip (lowest/highest efficiency with `n poss`, "low sample" tags) → chart → table → pair detail → heatmap → defense dash. `CalloutStrip` labels: "Lowest observed efficiency" / "Highest observed efficiency", each with an `Info` "points per partial possession among matchups with ≥ N possessions; observations, not verdicts". The wording note becomes a `Disclosure summary="What matchup data can and cannot show"`.

- [ ] **Step 1: Failing tests**: `ShootingLab.test.tsx` `renders zone summary beside the court at desktop width` (mock `useContainerWidth`), `MatchupExplorer.test.tsx` `keeps sample size beside each result`.
- [ ] **Steps 2–5.** Commit — `feat(research): court with adjacent zone detail; matchup results lead with sample size`

### Task 13: Remaining research pages consistency

**Files:**
- Modify: `pages/{Rankings,Scouting,Teams,TeamDetail,Compare,Games,GameDetail,EvidenceLibrary,EvidenceAsset,Methodology,ShortlistDetail,ReportView}.tsx` and their subfolders only as needed to adopt `PageHeader` (with `lede` ≤ 160 chars), `Toolbar`, `DataTable pinFirstColumn`, `Disclosure`, `EmptyState`/`ErrorState`/`Refetching`; `pages/teams/shared.tsx` (`ChartBox` → `ChartFrame`)
- Replace raw ids with labels where a mapping exists: team ids → `TeamMark` + name (teams list), metric keys → `MetricLabel`, role template keys → the registry's display name (scouting chips), `shot` ids stay.

- [ ] **Step 1: Failing tests**: `Rankings.test.tsx` `pins the player column in the ranking table`, `Scouting.test.tsx` `shows role trait chips with display names`.
- [ ] **Steps 2–5.** Commit — `refactor(research): shared header, toolbar, pinned tables and disclosures on the remaining pages`

---

## Phase 5: accessibility, verification, docs

### Task 14: Motion and accessibility pass

**Files:**
- Modify: `frontend/src/index.css`, `fantasy/styles/base.css` (reduced-motion blocks cover all keyframes), `components/CommandPalette.tsx`, `fantasy/components/common/Modal.tsx` (focus trap + return), chart components (keyboard-accessible summaries: each `ChartFrame` gets a visually hidden `<table>` or text summary when `summary` is provided), sticky header `scroll-margin-top` on focusable controls and anchors (`[id] { scroll-margin-top: 56px }`).
- Tests: `Modal.test.tsx` (focus return), `CommandPalette.test.tsx` (Esc closes and returns focus), Playwright `e2e/a11y.spec.ts` (Tab order through the shell at 1280: skip link → sidebar → header → main; `prefers-reduced-motion` run shows no `animation` on `.skeleton`).

- [ ] **Steps 1–5** as above. Commit — `fix(a11y): focus management, reduced motion coverage, keyboard chart summaries`

### Task 15: Visual verification at four viewports

**Files:**
- Modify: `frontend/scripts/capture-screens.mjs` (add `--draft-session` for an in-progress draft, `--states` to capture empty/loading/error via route mocking), `frontend/scripts/demo-tour.mjs` (re-record)
- Create: `docs/media/redesign/{before,after}/` curated PNGs (1440 and 390 for every page; 1280 and 768 for overview, draft, season-matchups, free agents, explorer, player) and `docs/media/redesign/README.md` listing them.

- [ ] **Step 1:** Create an in-progress draft session on real data through the Setup screen (as `demo-tour.mjs` does) and record its id.
- [ ] **Step 2:** Run captures: dark at all four viewports, light at 1440 and 390, reduced-motion at 1280; also long-name (`name` with 34 characters via the demo player fixture), missing images (block `cdn.nba.com` and `a.espncdn.com` with `page.route`), empty states (a fresh session, no logs), loading (throttled route), error (route returning 500).
- [ ] **Step 3:** Inspect every capture; fix layout defects in the owning files; re-capture. The script's overflow report must print `no horizontal overflow`.
- [ ] **Step 4:** Playwright checks: `boundingBox` of `rec-draft` at 1280×800 is within the first 720px; keyboard pass from Task 14; `make e2e` and `make e2e-fantasy` green; `npx vitest run`, `npm run typecheck`, `npm run lint`; `make -C services/fantasy test` unchanged.
- [ ] **Step 5:** Re-record the demo (`demo-tour.mjs` full and short), re-encode with the commands in README, replace `docs/media/shots/*` and the GIF/MP4.
- [ ] **Step 6: Commit** — `chore(media): after-redesign captures and demo`

### Task 16: Documentation

**Files:**
- Modify: `README.md` (The interface section: fantasy renders inside the shell with shared tokens; remove "mounted unchanged" and "deferred" wording; type scale, contrast test, capture scripts), `docs/superpowers/specs/2026-10-24-courtside-redesign.md` (append "Superseded in part by v2" note and the token/size changes), `docs/fantasy/DECISIONS.md` (DEC-35: route state is event-driven, one fantasy hierarchy, type scale and contrast floor), `docs/fantasy/PROGRESS.md`.

- [ ] **Steps:** write, run `grep -n "unchanged\|deferred" README.md` to confirm the stale claims are gone, commit — `docs: describe the redesigned shell, tokens and verification`

---

## Appendix A: contrast audit (measured 2026-10-25, before Task 1)

Dark theme passes for ink, ink-2, accent, pos, neg, amber on all surfaces. Fails: ink-3 on raised 4.39 and overlay 4.07; ink-4 everywhere 2.4–2.8; fantasy `.ctx.demo` white on amber 2.17; all hairlines and control borders (1.2–1.6). Light theme additionally fails: ink-3 on page 4.21; every accent use 3.0–3.8 (links, primary button label 3.78, pressed tabs 3.02); pos 3.8–4.2; neg on page 4.22; amber text 3.4–3.7; fantasy literal `#fff` on raised 1.09 (`shell.css:202-211`), `#fff` on overlay 1.21 (`shell.css:69`), pastel badges 1.44 / 1.85 (`draft.css:115,121`).

Sub-13px text locations to change in Task 1 (analytics): `CommandPalette.tsx:65,78`; `ui/index.tsx:77,93`; `ui/Tabs.tsx:27`; `ui/identity.tsx:48,79`; `ui/stats.tsx:24`; `AppShell.tsx:59,155,159`; `table/DataTable.tsx:63`; `Overview.tsx:16,44,96,103`; `player/CareerTimeline.tsx:34`; `evidence/{EvidenceList:27,UploadDialog:77,SegmentList:43,Timeline:43,AnnotationList:23,AnchorEditor:44}`; `EvidenceAsset.tsx:107`; `Scouting.tsx:64`; `methodology/{DataStatus:41,CoverageMatrix:84}`; `explorer/ExplorerChart.tsx:275`; `matchups/{DefenseDashPanel:75,PairDetail:17}`; `scouting/ClaimList.tsx:20,24`; `compare/ComparisonTable.tsx:58`; `overview/{MatchupSummary:18,43,FeatureCard:13}`; `player/{ScoutingPanel:28,FantasyPanel:22}`. Fantasy literals: `base.css:473`; `charts.css:167,171,201`; `draft.css:678`; `shell.css:363`; `ui.css:351,416`; inline `fontSize: 11` in `Scoreboard.tsx:49,96`, `StrategyPanel.tsx:114`.

## Appendix B: ids, roles and names the suites rely on (keep)

Draft: `top-on-clock`, `top-picks-until`, `top-format`, `top-save-status`, `top-round`, `top-overall`, `rec-updating`, `rec-name` (+`data-player-id`), `rec-draft`, `picker-search`, `picker-availability`, `picker-results` (`aria-busy`), `picker-row` (`data-drafted`, `data-player-id`, text "drafted by Team 1 at #1"), `shortlist-row`, `recent-pick` (`data-overall`), `tab-board`, `board-cell-N` (`data-filled`), `board-undo`, `confirm-pick-dialog`, `confirm-pick-player`, `confirm-pick-manager`, `format-warning`, `setup-league-name`, `setup-manager-count`, `setup-demo-badge`, `setup-create`, `setup-confirm-format`, `tab-categories`, `tab-strategy`, `tab-profiles`, `category-profile` (`data-cat`), `#cats-h`, `shortlist-expand`, `shortlist-breakdown`, `league-profiles`, `profile-row` (`data-manager-id`), `picker-name`, `import-panel`, `import-kind`, `import-text`, `import-preview`, `import-preview-table`, `import-apply`, `player-drawer`; `/` focuses the picker search.
Season: `sync-now`, `user-matchup`, `power-table` (`tbody tr.mine`), `season-tab-<id>`, `roster-moves`, `link-dialog`, `link-preview`, `link-apply`, `league-id`, tables named "Team mapping" and "Free agents" (rows `th .player-link`), region "ESPN sync", text "Actual (ESPN)", "Bye week", "locks lineups per game", "0 adds, 0 drops"; `featured-matchup`, `other-matchups`, `cat-<KEY>`, `-winner`, `-loser`, `projected-winner`, classes `fav-a`/`fav-b`; `actuals-callout`, `minutes-basis`, `rank-actual-season`, `rank-actual-week`, `refresh-logs`, `swap-actuals`, `swap-minutes`, `swap-panel`, buttons /apply/ and /clear override/, `minutes-cell`, column headers "Actual value" and "MIN", classes `drafted`, `muted`, `selected`, button "Details for …"; `performer-row`, `over-expected`, `performer-detail`, table /contribution by category/, buttons /sort by vs expected/ and /details for …/; `prediction-row`, `predictions-summary`; `scatter-point`, `equality-line`, `diverging-bar-<id>`; `portrait-fallback`; `explainer-toggle`; `role=tooltip`.
Shell/research: navigation "Primary", status role for demo banner, comboboxes "Season" and "Season type", `shortlist-drawer`, `claim-list`, tab "Advanced", `capability-banner`, `snapshots`, `upload-dialog`, `asset-state`, `video`, `segment-list`, `anchor-editor`, `alignment-report`, `palette-list`.
