# Methodology

This document mirrors the in-app **Data & methods** page (`/methodology`). Endpoint-level
provenance, call budgets, caching and the ingestion commands live in [DATA_SOURCES.md](./DATA_SOURCES.md);
the things the app deliberately cannot tell you are in [LIMITATIONS.md](./LIMITATIONS.md).

Formulas below are the ones implemented in `backend/app/analytics/` (`metrics.py`, `uncertainty.py`,
`composite.py`, `shooting.py`, `court.py`, `aggregation.py`, `percentiles.py`).

## 1. Data status

`GET /api/meta/status` reports the active namespace (`demo` or `nba`), the reason it was chosen,
`generated_at`, available seasons and season types, the per-season coverage map and the demo banner.
`GET /api/ingestion/status` reports whether an ingestion run is in progress, the last run, whether
`stats.nba.com` answered the last probe, and a summary of the real (`nba`) manifest.

Loading real data (from the repository root):

```bash
make ingest SEASONS="2024-25"                 # all families for one season
make ingest SEASONS="2024-25 2023-24" FAMILIES=player_season,team_season,shots
make ingest-status                             # coverage table for the real namespace
```

The API switches to the `nba` namespace automatically once that manifest has usable data
(`NBA_NAMESPACE=auto`); force one with `NBA_NAMESPACE=nba` or `NBA_NAMESPACE=demo` in `.env`.
Demo and real rows are never mixed; every row carries its `source`.

## 2. Coverage matrix

Coverage is `status.coverage[season][season_type][family]` with one of `ok`, `partial`, `stale`,
`failed`, `missing` (definitions in [DATA_SOURCES.md](./DATA_SOURCES.md#caching-resume-and-freshness)).
The page draws seasons × families per season type and shows the manifest `note`/`error` on hover.

## 3. Sources and retrieval

Every family's endpoint, parameters, first available season and limitations are in
[DATA_SOURCES.md](./DATA_SOURCES.md#families). The page groups the manifest by family: source,
latest `fetched_at`, summed rows, entries ok / total, distinct notes.

## 4. Metric definitions

The catalog is served by `GET /api/meta/metrics` (key, label, kind, definition, formula,
direction, unit, source, decimals) and defined in `backend/app/analytics/catalog.py`. Kinds:
`counting`, `pct`, `rate`, `rating`, `physical`, `context`. Percentages are stored as fractions.
Computed formulas:

```
eFG%     = (FGM + 0.5 × 3PM) / FGA
TS%      = PTS / (2 × (FGA + 0.44 × FTA))        0.44 is the conventional approximation
AST/TO   = AST / TOV                              null when TOV = 0
USG%     = 100 × ((FGA + 0.44 FTA + TOV) × (Tm MIN / 5)) / (MIN × (Tm FGA + 0.44 Tm FTA + Tm TOV))
wingspan / height = wingspan_in / height_wo_shoes_in
on_off_net = net rating on court − net rating off court
```

## 5. Qualification thresholds and normalisations

| Scale | Formula | Applies to |
| --- | --- | --- |
| Totals | season sums | counting stats |
| Per game | total / GP | counting stats |
| Per 36 minutes | 36 × total / MIN | counting stats |
| Per 100 possessions | 100 × total / POSS | counting stats, only where a possessions column exists |

Percentages, rates and ratings are never rescaled. Column labels carry the suffix (`/ game`,
`/ 36`, `/ 100`) so a column is never ambiguous. In the demo, team possessions are estimated as
`FGA − OREB + TOV + 0.44 × FTA` and the manifest says so.

Defaults: League explorer — per game, ≥ 10 games, ≥ 100 minutes. Rankings — rate mode (per game),
percentile normalisation, ≥ 10 games, ≥ 100 minutes. Player percentiles are computed against the
qualified population of the same season and season type (all / position / team / custom), and the
population size is shown beside every percentile.

## 6. Missing-data policy

* Null stays null and renders as a dash. Zero denominators return null, never 0 or infinity.
* Multi-game and multi-stint percentages are recomputed from pooled totals (`Σ FGM / Σ FGA`), never
  averaged from per-game percentages.
* Traded players: one row per team stint plus one `TOT` aggregate (`is_aggregate = true`).
  Counting stats are summed; percentages are recomputed from the pooled totals; ratings (ORtg,
  DRtg, NetRtg, pace, PIE, usage and the other rate columns) are possession-weighted means, with
  minutes as the fallback weight. League populations use the `TOT` row so nobody is counted twice.
* Composite rankings exclude a player missing any component and list them separately with the gap
  named. Weights are never re-normalised to the components a player happens to have.
* Coverage gaps are shown as coverage, not as zeros.

## 7. Uncertainty

**Wilson score interval** (95%, z = 1.96), with `p̂ = makes / attempts`, `n = attempts`:

```
centre   = (p̂ + z²/(2n)) / (1 + z²/n)
half     = z · √( p̂(1 − p̂)/n + z²/(4n²) ) / (1 + z²/n)
interval = [centre − half, centre + half]
```

**Beta shrinkage** of a matchup FG% toward the league matchup FG% `μ` for the season, with prior
strength `k` in pseudo-attempts (default 25):

```
prior     = Beta(μ·k, (1 − μ)·k)
posterior = (makes + μ·k) / (attempts + k)
weight on observed data = n / (n + k)
```

Both treat attempts as independent Bernoulli trials; shots by one player in the same games are
not independent, so intervals are somewhat too narrow. Zero attempts yield null.

## 8. Shooting

* **Coordinates.** Provider `LOC_X`/`LOC_Y` are tenths of a foot from the centre of the basket;
  `y` increases toward half court and `x` increases to the right as seen from behind the basket
  (left corner has negative x). The app divides by 10 and draws the court in feet relative to the
  hoop centre (baseline at y = −5.25 ft, three-point radius 23.75 ft, corner x = ±22 ft).
* **Zones.** Real shots keep the provider's `SHOT_ZONE_BASIC` / `SHOT_ZONE_AREA` /
  `SHOT_ZONE_RANGE`; the geometric classifier only labels synthetic demo shots.
* **Hex bins.** Pointy-top hexagons in axial (q, r) coordinates with a user-set circumradius in
  feet (default 1.5, range 0.75–6). Each bin carries attempts, makes, FG%, points per FGA,
  frequency share, Wilson 95% interval and a `low_sample` flag below the attempt threshold
  (default 5). Bins are flagged, never dropped.
* **League baseline.** League FG% per provider zone per season and season type;
  `rel_fg_pct = bin FG% − league FG% in the same zone`. Zone summaries default to 10 attempts.
* **Points per FGA** = `(2 × 2PM + 3 × 3PM) / FGA`. Not points per possession: it ignores free
  throws, turnovers and offensive rebounds.
* **No shot-quality model.** Defender distance, closest defender and shot clock are not public in
  the shot detail feed. Frequency and accuracy are encoded separately.

## 9. Matchups

* **Partial possessions** are the provider's `PARTIAL_POSS`: possessions, counted fractionally,
  during which the defender was the tracked primary matchup. Sums across defenders approximate,
  not equal, team possessions.
* **Qualification.** Rows with at least the minimum partial possessions (default 10) qualify;
  others are shown but flagged low-sample.
* **Per possession.** `player_pts / partial_poss` and `team_pts / partial_poss`, null at zero.
* **Wording rule.** "Values describe the lowest observed efficiency (or the highest) among
  qualifying matchups, not a player's 'worst matchup'. Matchup attribution, switching, help
  defense, opponent selection and team scheme limit what individual matchup data can show."
* **Attribution limits.** `help_blk`, `help_fgm`, `help_fga` are null in the demo and sparse in
  provider data. Matchup data exists from 2017-18.

## 10. Rankings

A ranking is a user-defined index, not an established statistic:

```
share_i = w_i / Σ w
norm_i  = mid-rank percentile (0–100) or z-score of component i within the eligible population,
          sign-flipped for lower-is-better components
score   = Σ_i share_i · norm_i
```

* Each lens publishes its components, weights, directions and caveat; every response returns the
  raw value, normalised value, weight, contribution and population size per component.
* The normalisation population is the players who met the thresholds and have every component.
* Rate mode uses per-game counting components; cumulative mode uses season totals. Percentages,
  rates and ratings are unchanged by the mode.
* Missing a component makes a player ineligible; weights are never re-normalised per player.
* Comparisons are within one season and season type. Percentiles do not remove era effects.
* "Impact indicators" are the provider's PIE, net rating, on/off and plus-minus, unadjusted. No
  RAPM / EPM / RAPTOR-style estimate exists here.
* Custom composites are encoded in the URL as `comps=metric:weight:dir,…` (`h` = higher is
  better, `l` = lower) so they can be shared. The builder warns when two chosen metrics largely
  overlap (pts & fgm, ts_pct & efg_pct, reb & reb_pct, ast & ast_pct, off_rating & net_rating,
  def_rating & net_rating).

## 11. Measurement provenance

| Source | Columns | Convention |
| --- | --- | --- |
| Roster-listed | `height_in`, `weight_lb` (`height_source = roster-listed`) | listed with shoes, team-reported, can change between seasons |
| Draft combine | `height_wo_shoes_in`, `height_w_shoes_in`, `wingspan_in`, `standing_reach_in`, hand size, body fat | measured once at the combine, tagged with the combine season |

Wingspan is shown only when measured: `wingspan_in` and `wingspan_height_ratio`
(`wingspan_in / height_wo_shoes_in`) are null for players without a combine record, and team
averages cover only the measured part of a roster.

## 12. Demo dataset

A deterministic synthetic league (`backend/app/demo`, seed in `config.py`) so the app works when
the provider is unreachable. Every row carries `source = demo-synthetic`.

| Category | Content |
| --- | --- |
| Identity | 30 fictional teams, fictional player names; player ids from 9,000,001 and team ids from 9,100,001 so they never collide with provider ids |
| Simulated | three most recent seasons: per-game box scores from player archetypes with Poisson noise, individual shots with sampled locations, a defender assignment per shot; older seasons get season totals only (expected rate × minutes, Poisson noise) |
| Derived by public formulas | eFG%, TS%, usage %, assist %, assist ratio, OREB/DREB/REB %, turnover %, PIE, pace, per-36 and per-100 rates — the same code path as real data (`derive.py::_advanced_from_sums`) |
| Synthesised (no play-by-play) | on-court ORtg/DRtg/NetRtg, lineup minutes and ratings, on/off splits, matchup partial possessions and matchup box scores (`help_*` not modelled), defense-dashboard categories, combine measurements for about 80% of recent draftees |

## 12a. Scouting traits (statistical layer)

A trait is a named, versioned measurement with a definition, units, direction, qualification
threshold, sample size, cohort and limitations (`GET /api/scouting/traits`, registry version 1).
Statistical traits reuse the existing calculations exactly: values come from the same pooled
player-season frame the explorer uses (traded players through the aggregate row), per-36 and
per-100 rates from the same normalisation (per-100 is null without possessions), percentiles from
the same mid-rank percentile within the qualified cohort, and 3P% / FT% carry the same Wilson
interval. Two defensive traits pool the provider's defense dashboard (`D_FGM/D_FGA − NORMAL_FG_PCT`
for 3 Pointers and Less Than 6Ft, ≥ 75 attempts) and one pools matchup points allowed per partial
possession, shrunk toward the league rate with a stated prior strength (300 possessions, ≥ 300
possessions to qualify). A trait whose qualification is not met reports its sample and the unmet
rule with a null value; a trait whose family is not ingested says so. No trait claims catch-and-shoot
splits, shot quality or adjusted individual impact.

### Role templates and candidate search

A role template is a small set of trait components with weights, a list of filters applied before
scoring, and caveats. Scoring reuses the rankings' composite (`compute_composite`): every component
is percentile-ranked (or z-scored) within the filtered cohort, weights are normalised once for the
template, and a player missing any component is ineligible rather than re-weighted. The response
carries the cohort size, a funnel (players remaining after each filter), the template version, the
trait registry version and a data fingerprint of the manifest entries used, so a saved shortlist can
be reproduced or marked stale. Four built-in templates ship (low-usage perimeter shooter,
rebounding interior player, secondary playmaker, perimeter-defense research candidate); custom
templates are saved per namespace. Optional video traits on a template only label a candidate's
video coverage (`unknown`, `none`, `references_only`, `limited`, `adequate`); they never enter the
score. Scores order players by match to the selected criteria within one season; they are not
forecasts of team improvement.

### Scouting profiles and reviewed observations

A profile (`GET /api/scouting/profiles/{player_id}`) keeps four evidence classes apart and never
merges them into one number: **statistical** traits (above), **reviewed observations**, **model
estimates** (empty until a vision feature is validated) and **interpretations** (written by people,
never derived). Reviewed-observation traits (closeout contest rate, screen contact rate, cut
received rate, box-out success rate) are computed from the `annotation_snapshots` export: only
human labels on segments whose subject identity was verified and whose review passed count; rates
use complete or systematically/randomly sampled event sets, while curated or provider-selected
clips are listed as examples and never enter a rate; counterexamples and review disagreements are
reported alongside; every rate carries its opportunity count, a Wilson interval and coverage
(games covered / games played). With no reviewed annotations (the state today) those traits report
an explicit unsupported reason, never zero. Each profile is stored as a snapshot keyed by player,
season, cohort, trait-registry version and a fingerprint of the manifest entries it used; when the
data changes, the old snapshot is marked stale instead of silently changing.

### Report drafts and claim validation

A report draft (`POST /api/scouting/reports`) is built deterministically from a shortlist or a list
of players: one section per evidence class in a fixed order (statistical measurements, reviewed
observations, model estimates, interpretation, limitations), each statistical row carrying the
trait's definition, value, percentile and sample. The same data renders byte-identical Markdown;
timestamps live only in the record. Claims added to a report (by a person now, by the copilot in
Phase D) are validated before they are stored or rendered: every cited evidence id must exist in the
active namespace and be active (stale is kept with a note; deleted or superseded citations are
dropped); every number must match the report's own computed value within the trait's display
rounding; a claim typed as a reviewed observation must cite reviewed-observation evidence that
passed review, otherwise it is kept as interpretation; model estimates are kept as interpretation
until a validated vision feature exists; a claim with no verified support is dropped. Rendering
groups claims under their validated type, so a label is never upgraded, and reports a count of
dropped claims. Requests about contracts, availability, trades, affordability or projected wins are
recognised as unsupported and answered with a limitation, never with a number.

## 12b. Play-by-play events (on demand)

`events` are the provider's `playbyplayv3` actions for games you choose to ingest (one call per
game). Every action is kept in source order with its raw row; repeated action numbers are kept and
flagged (`duplicate_of`) rather than merged. Participants come only from structured ids: the one
`personId` per action, classified as `actor`, `substituted_out` (the incoming player exists only in
the description text and is not inferred) or `jumper`. Team events (team rebounds, timeouts) carry
no person. `event_id_map` links each shot row to its action: `exact` when the ids are equal and the
player, period, clock (to the second) and result agree; `probable` when a unique action matches on
those four but the ids differ; `ambiguous` when several match. On 12 games of 2024-25 every one of
2,128 shots mapped `exact`. Season-level matchups and lineups do not identify the defender or the
five on court for an individual event; those remain unknown until possession and lineup
reconstruction exist.

## 12c. Video coverage (external references only)

Video exists only as **external references**: a link to the provider's own event page plus the
descriptive metadata the provider lists for that clip (description, period, duration). Nothing is
downloaded, embedded or processed, and the direct media URLs the provider returns are never stored
outside the raw cache. A reference is a pointer a reviewer can follow, not an observation; it never
feeds a statistic. States: `unverified` (constructed from the event, not yet checked), `available`
(the provider listed a clip when checked), `stale` (not re-checked within the configured window),
`unavailable` (the provider listed nothing). The in-app **Video coverage** section reports counts
and the machine's media capabilities. Managed media, annotations and alignment are later phases.

## 13. Known limitations

See [LIMITATIONS.md](./LIMITATIONS.md).
