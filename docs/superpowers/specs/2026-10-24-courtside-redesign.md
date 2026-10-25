# Courtside redesign: one basketball product (spec)

Audience: whoever implements or extends a page. Everything here is binding unless a later DEC says otherwise.

## Product shape

One shell, two services. NBA Research pages read `/api/analytics/*`; Fantasy pages read `/api/fantasy/*`.
Cross-links use the NBA person id: fantasy `PlayerView.nba_id` (added 2026-10-24) ↔ analytics `player_id`.
Nothing computed server-side changes; the redesign only changes how numbers are presented and linked.

Navigation groups (sidebar, in this order):

| Group | Items (route) |
| --- | --- |
| Overview | Overview (`/`) |
| NBA Research | Explorer (`/explorer`), Compare (`/compare`), Shooting (`/shooting`), Teams (`/teams`), Matchups (`/matchups`), Rankings (`/rankings`) |
| Scouting & film | Scouting (`/scouting`), Games (`/games`), Evidence (`/evidence`) |
| Fantasy | Draft (`/fantasy?session=S#/draft`), Recap (`#/recap`), My League (`#/season`), Matchups (`#/season?tab=matchups`), Performers (`#/performers`), Setup (`#/setup`) |
| Data & methods | Data & methods (`/methodology`), Fantasy data health (`/fantasy?session=S#/health`) |

"Matchups" appears twice on purpose; the group heading disambiguates and the fantasy item is labelled
"League matchups" in the sidebar. Fantasy URLs keep the hash router format the Playwright suite asserts.
Fantasy screens render inside the shared AppShell (the copilot's own sidebar is removed); the shell
shows fantasy context (session, league, week, last sync, demo flag) on fantasy routes.

## Visual identity (tokens in `frontend/src/index.css`, mirrored in `frontend/src/fantasy/styles/tokens.css`)

Dark is primary; light stays available from the toolbar.

- Surfaces: `--page #121314` (warm charcoal), `--surface #19191b`, `--raised #202124`, `--overlay #26272b`.
- Lines: `--line rgba(255,255,255,.08)`, `--line-strong rgba(255,255,255,.16)`.
- Ink: `--ink #f3efe8` (warm white), `--ink-2 #b8b2a8`, `--ink-3 #8a857c`, `--ink-4 #5f5b54`.
- Accent (selection, primary actions): `--accent #e8742a` (orange), `--accent-ink #15110d`, `--accent-soft rgba(232,116,42,.14)`.
- Signed differences: `--pos #2cb9a7` (teal), `--neg #ef6a5a` (coral), each with `-soft` variants. Always paired with a sign or label.
- Status: `--good` = teal, `--warning #e0a63a` (amber, also "mine" / draft status), `--critical` = coral, `--demo` = amber.
- Team colours: `--team` set per identity via inline style; used only as a 3px rail, portrait ring or header wash, never for text.
- Type: body IBM Plex Sans 13/14px; display numerals and page titles Barlow Semi Condensed 600/700; mono IBM Plex Mono for ids. `font-variant-numeric: tabular-nums` everywhere numbers align.
- Radii: controls 6px, panels 10px, pills 999px. Shadows only on floating layers (`--shadow-float`).
- Density: compact tables (30-34px rows), generous chart areas (min 360px tall on desktop).

Motion tokens: `--dur-fast 160ms` (controls), `--dur 220ms`, `--dur-panel 280ms` (panels, drawers, tab indicator),
`--ease cubic-bezier(.2,.7,.2,1)`. Rules: hover/press feedback on all controls; sidebar/tab active indicator slides;
details/drawers expand with opacity+translate; a player entering the comparison group pulses once (`.pop-in`);
recorded draft pick flashes its row once (`.flash-once`); refresh icons rotate only while `aria-busy`;
skeletons shimmer (`.skeleton`); charts cross-fade on data change. `prefers-reduced-motion: reduce` disables all.
Never animate numbers in tables, never loop decorative motion.

## Shared components (`frontend/src/components/ui`)

`PlayerIdentity` (portrait from cdn.nba.com with initials fallback, name, team mark, position, size sm/md/lg, team colour rail),
`TeamMark` (cdn.nba.com logo with abbreviation fallback), `StatTile` (label, display-numeral value, delta/sub, tone),
`Delta` (signed value in teal/coral with ▲▼ glyph and unit), `Tabs` (role=tablist with sliding indicator),
`Toolbar` (page-level controls row: left filters, right actions), `Skeleton` (block/text/table variants),
`EmptyState`/`ErrorState`/`Loading` (existing, restyled), `SectionNav` for in-page sections.
Existing `Panel` gains `tone` and no longer boxes every item: pages use dividers and spacing for secondary content.

## Pages

- **Overview `/`**: fantasy team + current period, matchup summary (user_matchup odds), top contributor and
  biggest overperformer feature cards (seasonPerformers scope=week), prediction track record trend (predictions by_period),
  recently viewed players (localStorage `courtside-recent-v1`), NBA data freshness. Empty states: no session / not linked / no results.
- **Player profile `/players/:id`**: hero header (portrait, name, team mark + colours, position, age, fantasy eligibility/ownership
  via `useFantasyPlayer(nbaId)`), key stat tiles, then tabs Performance · Shooting · Advanced · Fantasy (existing sections regrouped).
  Raw values, percentiles and fantasy valuation stay visually distinct (tile vs bar vs badge). Sample size and population shown.
- **Explorer `/explorer`**: scatter first, controls in a toolbar, presets, hover, select → compare, linked table highlight, reset.
- **Compare**: persistent strip with portraits and remove buttons; consistent per-player colour from the categorical palette.
- **Fantasy draft**: dark tokens, pick confirmation flash, stale-rec safeguards untouched.
- **Fantasy performers**: feature cards, contribution-vs-overperformance scatter, weekly trend (unavailable state until the API has
  per-player history), player × category contribution heatmap (`contribution_by_category`), sortable table with expandable details,
  team/week/season/totals-per-game controls, "NBA profile" link preserving `#/performers?team=&week=`.
- **Shooting / Teams / Matchups / Rankings**: restyle with the shared components; chart areas get room; legends, attempt counts, thresholds stay.

## Statistical integrity (unchanged, restated)
FG%/FT% from summed makes ÷ attempts; turnovers lower is better; ESPN-counted production vs NBA production labelled;
actual/projection/demo labelled; missing stays "—"; no confidence bands without an uncertainty estimate; fantasy
contribution units never mixed with research composite scores.

## Verification
vitest, `tsc -b`, oxlint, Playwright (analytics + fantasy), screenshots at 1440 and 390 px of every page in dark and light,
keyboard pass (Tab order, ⌘K, Esc), reduced-motion pass.
