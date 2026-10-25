# Courtside redesign v2: brief (2026-10-25)

Verbatim product brief for the second redesign pass. The implementation plan is
`docs/superpowers/plans/2026-10-25-courtside-redesign-v2.md`; the first-pass spec
(`2026-10-24-courtside-redesign.md`) still binds wherever this brief is silent.

---

Redesign the existing NBA Courtside application into a polished, readable, interactive basketball analytics and fantasy workspace.

Work directly in this repository. Inspect the current implementation and demo assets, then implement the redesign. I want substantive improvements to layout, information hierarchy, navigation, charts, and interactions, beyond changing colors and border radii.

## Understand the project first

Read: `CLAUDE.md`, `README.md`, `docs/superpowers/specs/2026-10-24-courtside-redesign.md`, relevant domain instructions and decision records.

Inspect: `docs/media/courtside-demo.mp4`, all screenshots in `docs/media/shots/`, `frontend/src/components/layout/AppShell.tsx`, `frontend/src/components/layout/nav.ts`, `frontend/src/index.css`, shared UI components, `frontend/src/fantasy/styles/`, relevant page components, stores, routing, and chart utilities.

The README contains outdated descriptions about the fantasy UI being mounted unchanged outside the analytics shell and design unification being deferred. Verify behavior against current code, and update outdated documentation after implementation.

Preserve the existing React/Vite application, backend contracts, local-first behavior, and statistical calculations. Use the existing chart libraries where appropriate.

Respect fantasy CSS isolation: do not add Tailwind utilities inside `src/fantasy` or remove its scoped styling protections as a shortcut.

## Product direction

Courtside should help me answer:
1. How are players and teams performing?
2. What explains their performance?
3. Who should I draft, compare, add, or drop?
4. How does that decision affect my fantasy categories?

I want visuals I can interact with to understand the data: linked selections, clear comparisons, useful tooltips, filters, and understandable before/after views.

Maintain Courtside's basketball identity: charcoal surfaces, warm white text, orange primary actions, teal/coral for favorable/unfavorable differences, restrained team-color accents, player portraits and team logos with reliable fallbacks.

Make it feel like a thoughtfully designed basketball research tool. Avoid excessive badges, decorative gradients, repetitive cards, and gratuitous motion.

## 1. Improve readability and hierarchy

Current screenshots show too much small, muted text.

- Use approximately 14–16px for normal body text and 13–14px for table content where practical.
- Reserve smaller type for secondary metadata.
- Give essential labels sufficient contrast in both themes.
- Use condensed display type selectively for headings and headline numbers.
- Use tabular numerals for aligned statistics.
- Establish consistent page margins, section spacing, control heights, and heading hierarchy.
- Give each page one obvious primary task.
- Shorten headings and supporting copy.
- Keep critical qualifications visible; put longer methods and technical explanations in accessible expandable sections.

Measure contrast rather than assuming the current tokens meet accessibility requirements.

## 2. Simplify the shell and fix navigation state

The captured Power rankings and Free agents views still display "League matchups" in the toolbar. Player profiles display "Explorer." Fix the underlying route-state relationship.

Inspect these specific areas: `activeNavId()` derives fantasy context from hash queries; `SeasonScreen` initializes its tab from the hash; `replaceHashQuery()` uses `history.replaceState` without dispatching a navigation event.

Verify behavior before choosing a fix. Ensure the actual view, URL, breadcrumb, page title, and selected navigation item stay synchronized through tab changes, sidebar navigation, reloads, and browser history.

Also: reduce duplication between "My league," "League matchups," and season tabs; use one coherent navigation hierarchy; preserve existing deep links or provide compatible handling; keep session, league, team, and week context when moving between related screens; consolidate repeated league/week/sync information into one compact context area; distinguish NBA research season from fantasy league season; provide clear player-profile breadcrumbs; make global search, local filtering, and comparison selection visibly distinct; replace the empty comparison instruction with a concise actionable control such as "Compare · 0/6," where appropriate; keep navigation usable on short laptop screens.

## 3. Redesign Overview around useful decisions

Create a clear hierarchy: current fantasy matchup as the main feature; compact team rank and category outlook; leading contributor and biggest overperformer; relevant next actions; recently viewed players. Use existing data only.

For the matchup: clearly distinguish projected win probability, tie probability, expected category score, actual totals, and scheduled games; show the configured scoring categories; make vulnerable categories easy to identify; explain the outlook using available data without inventing causal conclusions.

Replace empty track-record KPI tiles with a compact explanation of when results become available. Keep detailed scoring-method explanations accessible without dominating the page.

## 4. Make the draft screen usable under time pressure

The current three-column screen contains too many competing elements.

Prioritize: who is on the clock; when I pick next; recommended player; why that player fits; record-pick action; alternatives.

Requirements: make the recommendation and primary action visible at common laptop sizes; keep search and player availability filters easy to use; clearly distinguish a searched/previewed player from the model's recommendation; show the most important reasons first, with detailed reasoning expandable; separate projected production, fantasy valuation, and category impact; give category-impact bars a clear zero baseline, units, and consistent scale; keep roster needs and category strategy available without overwhelming the recommendation; move technical timing, model-tier, and revision details into a compact status area or disclosure; preserve stale-recommendation safeguards, keyboard workflows, pick confirmation, and undo; avoid layout jumps when recommendations update; adapt the layout sensibly for narrower screens.

Do not weaken pick-commit correctness or introduce network/LLM calls into that path.

## 5. Clarify league matchups

The current large brown highlighted panel overpowers the data, and actual totals sit close to projected probabilities.

- Use a restrained surface with a subtle selected-state accent.
- Separate "Projected outcome" and "Actual totals."
- Present category probabilities with a clearly labeled, consistent visual encoding.
- Preserve ties where applicable; do not assume two sides always sum to 100%.
- Make close categories easy to scan.
- Show schedule volume and injury context concisely.
- Keep week and matchup selection near the visualization.
- Put detailed assumptions in a disclosure.
- Respect the league's configured categories, including eight-category leagues without turnovers.

Do not relabel model outputs as probabilities unless that is what the API provides.

## 6. Improve power rankings

Preserve the category heatmap, but improve: table typography and row spacing; sticky team identity and headers where useful; consistent probability color scale; selected-team styling; clear sorting; explanation of "Expected categories won per week"; meaning of rank movement and its comparison period.

Make selecting another team reveal a clear comparison with my team using existing data. Use aligned category bars or another easily compared chart. Include a readable legend and values so interpretation does not depend on color.

## 7. Redesign free-agent evaluation around the proposed swap

Make the main task: "Which available player improves my roster, and whom would I drop?"

- Prioritize player identity, availability, value, recommended drop, and net change.
- Put secondary category details in an expandable row or detail panel.
- Preserve access to the full analytical table through an advanced or expanded view.
- Clearly label projection-based versus actual-production rankings.
- Show add/drop category effects together on a shared scale.
- Label actual and projected statistics explicitly.
- Give minutes overrides clear defaults, validation, reset behavior, and feedback.
- Show game-log freshness near the relevant controls.
- Preserve table position and selected player when opening details.
- Provide clear empty, stale, loading, and error states.
- Clarify the units behind "Value" and "Net Δ."

Treat add/drop recommendations as analysis unless an existing explicitly authorized transaction workflow exists.

## 8. Simplify Performers

- Explain contribution units in plain language.
- Distinguish "produced the most" from "exceeded expectation the most."
- Make totals versus per-game mode unambiguous throughout the page.
- Reduce repeated presentation of the same players.
- Create a clear order: team summary, key players, category breakdown, detailed table.
- Use actual-versus-expected comparisons with consistent scales and legends.
- Keep small-sample context attached to the relevant result.
- Preserve team/week selection when opening a profile and returning.
- Make the category heatmap sortable and useful for inspection.

## 9. Improve research pages and charts

Explorer: keep axis selectors, population filters, and active presets near the chart; show what bubble size and color mean; reduce overplotting through restrained styling and selection emphasis; give selected/compared players distinct treatment; provide clear reset and compare actions; simplify Plotly controls into understandable actions while preserving useful capabilities; use single-click selection/highlighting with a separate explicit profile link instead of an ambiguous click-again interaction; link chart and table selections.

Player profile: improve portrait and logo fallbacks; remove redundant status badges; consolidate duplicate season controls or explicitly distinguish their scopes; make key statistics and fantasy context easy to scan; make the career timeline responsive and its horizontal scrolling discoverable; keep trend-chart scales and comparison context understandable; preserve research/fantasy distinctions and sample sizes.

Shooting: size the court intentionally for the viewport; use adjacent space for zone summaries, selected-bin details, or comparisons; keep frequency, accuracy, and relative-to-league encodings distinct; preserve fixed comparison scales, attempt counts, low-sample treatment, and Wilson intervals; link court and zone-table selection where supported.

Scorer/defender matchups: prioritize the main result and chart; keep sample size and uncertainty beside the result; simplify exposed technical labels with explanations; preserve observation-versus-causation qualifications; do not turn low-sample extremes into confident rankings.

Scouting, Rankings, Teams, Compare, Games, and Evidence: apply the same typography, controls, spacing, tables, and state patterns; replace raw identifiers with readable labels where a verified mapping exists; make wide tables intentionally scrollable with pinned identity columns where useful; use available width purposefully; preserve transparent score definitions and data limitations.

## 10. Build reusable presentation patterns

Extend existing components instead of creating page-specific copies: page header and context toolbar; player/team identity; metric and delta; tabs and segmented controls; data table; chart frame and tooltip; detail drawer; data freshness indicator; loading, empty, and error states; methodology disclosure.

Share design tokens across analytics and fantasy while respecting their current styling boundaries.

## 11. Motion and accessibility

Use subtle motion for selection, drawers, loading, and recorded picks. Avoid looping decorative animation or animated table numbers. Respect reduced motion; support keyboard operation and visible focus; manage focus correctly in dialogs and drawers; support Escape and focus return; make essential chart information available without hover; pair color with signs, labels, or patterns; use practical touch targets; prevent sticky headers from covering focused controls or anchored content.

## 12. Preserve data integrity

Do not alter: recommendation algorithms or statistical calculations; FG%/FT% aggregation from makes and attempts; turnover direction; missing-value semantics; demo/real-data separation; projection revision checks; event-log availability; ESPN indexing rules; API route prefixes or response contracts; local-first and credential-handling behavior.

Do not fabricate trends, confidence intervals, probabilities, or performance claims. Clearly distinguish raw statistics, research scores, fantasy contribution, and projections.

## Implementation and verification

Start with a concise audit and implementation plan, then proceed with implementation. Prioritize: (1) typography, contrast, shell, and route-state correctness; (2) Overview and draft workflow; (3) matchups, power rankings, free agents, and performers; (4) research pages and remaining screens.

Run the app with available demo fixtures. Do not require private ESPN credentials for verification.

Use Playwright to inspect representative screens at 1440 × 900, 1280 × 800, 768 × 1024, 390 × 844. Check both themes, reduced motion, keyboard navigation, long names, missing images, empty states, loading, and errors. Tables may scroll within their containers; the page should not accidentally overflow horizontally.

Add targeted regression tests for routing, tab synchronization, browser history, and context preservation. Run the required repository checks, including frontend tests, type checks, lint, and relevant end-to-end suites.

Use the existing demo-tour script to capture updated screenshots after implementation. Inspect them and correct layout problems before finishing.

Deliver: implemented redesign; brief explanation of major changes; before/after screenshots; validation results; remaining limitations, including unavailable data.
