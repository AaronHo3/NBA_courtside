# Scouting profiles and candidate ranking

Canonical home for: trait definitions and the trait record shape, evidence classes, role templates,
candidate ranking semantics, coverage and sample rules, eligibility for optional video traits, and
interpretation limits. Storage of profiles/shortlists is in [DATA_MODEL.md](DATA_MODEL.md) §9; the
copilot consumes these services through tools ([COPILOT.md](COPILOT.md)).

## 1. Principles (binding)

- Profiles are **reproducible derived views**: a trait value is a pure function of
  (data fingerprint, trait definition version, cohort, time window). Snapshots store inputs.
- Four evidence classes are never merged into one number: `statistical`, `reviewed_observation`,
  `model_estimate`, `interpretation` (DEC-11).
- Existing calculations are reused, not re-implemented: `league_population`, `compute_composite`,
  `percentile_rank(s)`, `wilson_interval`, `beta_shrink`, pooled stint handling, `METRIC_INDEX`.
- Rankings are "match to selected criteria" within one season and cohort; they are not predictions
  of team improvement and the UI copy says so (reuse `rankings.DISCLAIMER` wording).
- Missing component -> ineligible (existing `require_all=True`), never re-weighted.

## 2. Trait registry

`backend/app/scouting/traits.py` defines a registry of `TraitSpec` records, versioned as a whole
(`TRAIT_REGISTRY_VERSION`). A trait is either a thin wrapper over an existing catalog metric or a
documented derivation.

```python
@dataclass(frozen=True)
class TraitSpec:
    key: str                      # "fg3_pct", "fg3a_rate", "d_fg3_pct_diff", "closeout_contest_rate"
    label: str
    evidence_class: Literal["statistical", "reviewed_observation", "model_estimate"]
    definition: str               # plain-language definition
    formula: str | None           # exact formula or pointer to catalog metric
    units: str                    # "fraction", "per 36 min", "per 100 poss", "count", "ratio"
    higher_is_better: bool | None
    source_families: tuple[str, ...]      # e.g. ("player_season",), ("defense_dash",), ("annotation_snapshots",)
    numerator: str | None         # for rate traits: column name of successes/events
    denominator: str | None       # opportunities column; required for any rate
    qualification: dict           # {"min_gp": 10, "min_minutes": 100, "min_fg3a": 100}
    stint_handling: Literal["pooled_aggregate_row", "per_stint", "n/a"]
    limitations: tuple[str, ...]
    version: int
```

### 2.1 Statistical traits available today (inputs verified in `catalog.py` and `league_population`)

| Trait key | Source | Formula / notes | Qualification default |
| --- | --- | --- | --- |
| `fg3_pct` | player_season | 3PM / 3PA (pooled numerators); Wilson 95 % interval attached | 3PA ≥ 100 |
| `fg3a_rate` | derived in `add_derived_rates` | 3PA / FGA | FGA ≥ 200 |
| `efg_pct`, `ts_pct` | computed from totals | existing formulas | FGA ≥ 200 |
| `ft_pct` | player_season | FTM / FTA with Wilson interval | FTA ≥ 50 |
| `usg_pct` | provider advanced | fraction | min ≥ 300 |
| `ast_pct`, `ast_to`, `ast_ratio`, `tm_tov_pct` | provider advanced / computed | fractions, ratio | min ≥ 300 |
| `oreb_pct`, `dreb_pct`, `reb_pct` | provider advanced | fractions | min ≥ 300 |
| `pts_per36`, `reb_per36`, `ast_per36`, `stl_per36`, `blk_per36`, `tov_per36` | `normalize_counting(per_36)` | totals × 36 / min | min ≥ 300 |
| `*_per100` | `normalize_counting(per_100)` | only when `poss` present | min ≥ 300 |
| `def_rating`, `net_rating`, `pie`, `on_off_net`, `plus_minus` | provider / on_off | team-dependent indicators, not individual impact | gp ≥ 20 |
| `d_fg3_pct_diff` | defense_dash category `3 Pointers` | `d_fgm/d_fga − normal_fg_pct` (lower is better) | `d_fga` ≥ 75 (provisional) |
| `d_fg_pct_diff_lt6` | defense_dash `Less Than 6Ft` | same construction | `d_fga` ≥ 75 |
| `matchup_pts_per_poss_allowed` | matchups (defender side) | Σ player_pts / Σ partial_poss over qualifying pairs, shrunk toward league mean with stated prior strength | Σ partial_poss ≥ 300; 2017-18+ |
| `wingspan_in`, `standing_reach_in`, `wingspan_height_ratio` | combine_anthro (latest row) | measured, not roster | present |

Explicitly **not** defined: any "catch-and-shoot" trait (no supporting data), adjusted impact
(RAPM-like), shot quality, defender distance from provider data, biomechanics.

### 2.2 Reviewed-observation traits (Phase B/C, computed from `annotation_snapshots`)

Shape: `rate = events / opportunities` restricted to annotations with `review_status in
(reviewed_ok, reviewed_corrected)` and `sampling_method in (complete_event_set, systematic_sample,
random_sample)`; `coverage = covered_opportunities / provider_opportunities` where the provider
denominator comes from `events` (e.g. opponent catch-and-shoot 3PA faced is **not** available from
provider data; the opportunity denominator is then the count of annotated opportunities and the
trait is labelled "within reviewed sample only").

Initial keys: `closeout_contest_rate` (contested closeouts / closeouts observed),
`screen_contact_rate`, `cut_received_rate`, `box_out_rate`. Each carries `n_opportunities`,
`n_events`, Wilson interval, `coverage`, `games_covered`, `sampling_method`, `labelers`,
`disagreement_count`, and `example_evidence_ids` (max 5) plus `counterexample_evidence_ids`.

### 2.3 Model-estimate traits (Phase E, from `video_features` with `status`)

Only `validated` features become traits; `experimental` features appear in the evidence review UI
with their status and never in profiles or rankings.

## 3. Trait record (API shape, stored in `scouting_profile_snapshots.traits_json`)

```json
{
  "key": "fg3_pct", "label": "3P%", "evidence_class": "statistical",
  "definition": "...", "formula": "3PM / 3PA", "units": "fraction", "higher_is_better": true,
  "time_window": {"season": "2024-25", "season_type": "Regular Season"},
  "stint_handling": "pooled_aggregate_row",
  "cohort": {"population": "all", "min_gp": 10, "min_minutes": 100, "size": 312},
  "qualification": {"min_fg3a": 100, "met": true},
  "sample": {"n": 412, "denominator": "fg3a"},
  "coverage": {"games_covered": 71, "games_played": 71, "fraction": 1.0},
  "value": 0.391, "interval": {"low": 0.344, "high": 0.439, "method": "wilson_95"},
  "percentile": 78.4,
  "evidence_ids": ["01J..."],
  "version": 3,
  "limitations": ["Season aggregate; shot-type and defender context not available"]
}
```

A trait whose qualification is not met is returned with `value: null`, `qualification.met: false`
and a reason; it is never shown as zero.

## 4. Coverage and sample rules

1. A rate requires numerator, denominator and coverage; otherwise the trait is `unsupported` with a
   reason ("no opportunity denominator").
2. `curated` / `provider_selected` annotations contribute to `examples` only and are excluded from
   every rate.
3. Reviewed-observation traits show `coverage` prominently; when `coverage < 0.5` the UI label is
   "limited sample" and the copilot must include the limitation in any claim.
4. Statistical traits use the pooled aggregate row for traded players (one row per player-season),
   with stints available in the profile detail (existing behaviour).
5. Cohort percentiles are computed within the role template's filtered population and the
   population size is always shown (existing `population_size`).

## 5. Role templates v1 (statistical inputs only; verified against available metrics)

Common filters: `season_type = Regular Season`, `min_gp = 20`, `min_minutes = 400` (provisional;
exposed as controls). Weights are normalised by `compute_composite`.

| Role id | Intent | Filters | Components (weight, direction) | Caveats shown |
| --- | --- | --- | --- | --- |
| `low_usage_perimeter_shooter` | Floor spacer who shoots well at low usage | `usg_pct ≤ 0.20`, `fg3a ≥ 100` | `fg3_pct` (2, ↑), `fg3a_rate` (1, ↑), `efg_pct` (1, ↑), `tov_per100` (0.5, ↓) | "3P% is a season aggregate; shot type (catch-and-shoot vs pull-up) is not in the data" |
| `rebounding_interior_player` | Secures rebounds at high rates | position contains `C` or `F`, `min ≥ 400` | `oreb_pct` (1.5, ↑), `dreb_pct` (1.5, ↑), `reb_per36` (1, ↑), `blk_per36` (0.5, ↑) | "Rebound shares are team-context dependent" |
| `secondary_playmaker` | Creates for others without primary usage | `0.14 ≤ usg_pct ≤ 0.24` | `ast_pct` (2, ↑), `ast_to` (1, ↑), `tm_tov_pct` (1, ↓), `ast_per36` (1, ↑) | "Assist share depends on teammates' shooting" |
| `perimeter_defense_research_candidate` | Candidate for further **video review**, not a defensive rating | `d_fga ≥ 75` in `3 Pointers` category, season ≥ 2013-14 | `d_fg3_pct_diff` (1.5, ↓), `stl_per36` (1, ↑), `matchup_pts_per_poss_allowed` (1, ↓, 2017-18+; component missing -> ineligible for seasons before), `def_rating` (0.5, ↓) | "Raw defensive indicators; not adjusted individual impact. Use the shortlist to prioritise clips." |

Each template declares `optional_video_traits` (e.g. `closeout_contest_rate` for the defensive
template). They are displayed beside the ranking with coverage; they never enter the score. A
template row has `eligibility = eligible | ineligible(missing: [...])` for the score and a separate
`video_coverage = none | limited | adequate` label.

Custom templates: the existing `/api/rankings/custom` request shape (components, thresholds) is
extended with `filters` (usage bounds, position, denominators) and saved as `role_templates` rows.

## 6. Candidate search semantics

`search_candidates(role_id | custom spec, season, season_type, cohort filters, limit, offset)`:

1. Build the population with `league_population(... normalization="totals")` and derive per-36 and
   per-100 columns with `normalize_counting` where needed (the component list decides).
2. Join trait-specific sources (`defense_dash`, `matchups` aggregates) by `player_id, season`.
3. Apply template filters; record how many players each filter removed (`meta.filter_funnel`).
4. `compute_composite` with the template's components; attach `contributions`, `missing`,
   `eligible`.
5. Attach per-trait records (§3) for the top `limit` rows and `video_coverage` labels from
   `evidence_snapshots` when present.
6. Return deterministic order: `eligible desc, score desc, player_id asc` (stable across runs).

The response `meta` includes template version, trait registry version, data fingerprint, cohort
size, funnel, and the disclaimer. The same function backs the UI and the copilot tool, so numbers
match exactly.

## 7. Interpretation limits (rendered in the UI and included in report templates)

- Match scores order players by the chosen criteria; a higher score is not a forecast.
- Statistical traits describe production in a context (team, role, opponents) that the data does
  not control for.
- Reviewed observations describe covered games only; the coverage number is part of the claim.
- Model estimates are experimental until promoted and are labelled with their status.
- Nothing here addresses availability, contracts, fit with a specific roster, or health (Phase F
  scope, separate datasets).
