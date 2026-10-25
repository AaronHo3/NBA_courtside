"""Trait registry (PROFILES_AND_RANKING §2): what a trait means, where it comes from, when it counts.

Traits wrap existing catalog metrics or documented derivations; no formula lives here twice. The
registry is versioned as a whole so a stored profile can say which definitions it used.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

from app.analytics.catalog import METRIC_INDEX

TRAIT_REGISTRY_VERSION = 1

EvidenceClass = Literal["statistical", "reviewed_observation", "model_estimate"]
StintHandling = Literal["pooled_aggregate_row", "per_stint", "n/a"]
Normalization = Literal["totals", "per_36", "per_100"]


@dataclass(frozen=True)
class TraitSpec:
    key: str
    label: str
    evidence_class: EvidenceClass
    definition: str
    formula: str | None
    units: str
    higher_is_better: bool | None
    source_families: tuple[str, ...]
    qualification: tuple[tuple[str, float], ...]  # (column, minimum) pairs, all must hold
    stint_handling: StintHandling = "pooled_aggregate_row"
    numerator: str | None = None
    denominator: str | None = None
    catalog_metric: str | None = None  # reuse the catalog's definition/formula when set
    column: str | None = None  # population column holding the value (defaults to key)
    normalization: Normalization = "totals"
    interval: Literal["wilson"] | None = None
    limitations: tuple[str, ...] = ()
    version: int = 1
    # reviewed-observation traits: the vocabulary action counted as an opportunity and the outcomes
    # that count as the event (VIDEO_PIPELINE §8); null for statistical traits
    action: str | None = None
    success_outcomes: tuple[str, ...] = ()
    failure_outcomes: tuple[str, ...] = ()

    @property
    def value_column(self) -> str:
        return self.column or self.catalog_metric or self.key


def _catalog(key: str, **overrides) -> TraitSpec:
    m = METRIC_INDEX[key]
    base = dict(
        key=key,
        label=m.label,
        evidence_class="statistical",
        definition=m.definition,
        formula=m.formula,
        units="fraction"
        if m.kind == "pct"
        else ("ratio" if m.kind == "rate" else m.unit or m.kind),
        higher_is_better=m.higher_is_better,
        source_families=("player_season",),
        qualification=(("gp", 10), ("min", 300)),
        catalog_metric=key,
    )
    base.update(overrides)
    return TraitSpec(**base)


def _per(key: str, stat: str, per: Literal["per_36", "per_100"]) -> TraitSpec:
    m = METRIC_INDEX[stat]
    label = f"{m.label} per {'36' if per == 'per_36' else '100'}"
    den = "min" if per == "per_36" else "poss"
    return TraitSpec(
        key=key,
        label=label,
        evidence_class="statistical",
        definition=f"{m.definition}, per {'36 minutes' if per == 'per_36' else '100 possessions'}",
        formula=f"{stat} / {den} × {'36' if per == 'per_36' else '100'}",
        units="per 36 min" if per == "per_36" else "per 100 poss",
        higher_is_better=m.higher_is_better,
        source_families=("player_season",),
        qualification=(("gp", 10), ("min", 300)),
        catalog_metric=stat,
        column=stat,
        normalization=per,
        limitations=(
            "Possessions come from the provider's advanced table; per-100 is null without them.",
        )
        if per == "per_100"
        else (),
    )


SEASON_AGG = "Season aggregate; the shot type (catch-and-shoot vs pull-up) and defender context are not in the data."
TEAM_CONTEXT = "Team-dependent indicator; not an estimate of individual impact."

TRAITS: tuple[TraitSpec, ...] = (
    _catalog(
        "fg3_pct",
        numerator="fg3m",
        denominator="fg3a",
        qualification=(("gp", 10), ("fg3a", 100)),
        interval="wilson",
        limitations=(SEASON_AGG,),
    ),
    TraitSpec(
        "fg3a_rate",
        "3PA rate",
        "statistical",
        "Share of field-goal attempts taken from three",
        "3PA / FGA",
        "fraction",
        None,
        ("player_season",),
        (("gp", 10), ("fga", 200)),
        numerator="fg3a",
        denominator="fga",
        limitations=(SEASON_AGG,),
    ),
    _catalog(
        "efg_pct", numerator="fgm", denominator="fga", qualification=(("gp", 10), ("fga", 200))
    ),
    _catalog("ts_pct", qualification=(("gp", 10), ("fga", 200)), denominator="fga"),
    _catalog(
        "ft_pct",
        numerator="ftm",
        denominator="fta",
        qualification=(("gp", 10), ("fta", 50)),
        interval="wilson",
    ),
    _catalog("usg_pct", higher_is_better=None),
    _catalog("ast_pct", limitations=("Assist share depends on teammates' shooting.",)),
    _catalog("ast_to"),
    _catalog("ast_ratio"),
    _catalog("tm_tov_pct", higher_is_better=False),
    _catalog("oreb_pct", limitations=("Rebound shares are team-context dependent.",)),
    _catalog("dreb_pct", limitations=("Rebound shares are team-context dependent.",)),
    _catalog("reb_pct", limitations=("Rebound shares are team-context dependent.",)),
    *[_per(f"{s}_per36", s, "per_36") for s in ("pts", "reb", "ast", "stl", "blk", "tov")],
    *[_per(f"{s}_per100", s, "per_100") for s in ("pts", "reb", "ast", "stl", "blk", "tov")],
    _catalog("def_rating", qualification=(("gp", 20),), limitations=(TEAM_CONTEXT,)),
    _catalog("net_rating", qualification=(("gp", 20),), limitations=(TEAM_CONTEXT,)),
    _catalog(
        "pie",
        qualification=(("gp", 20),),
        limitations=("Provider's PIE; a box-score share, not adjusted impact.",),
    ),
    _catalog(
        "on_off_net",
        qualification=(("gp", 20),),
        source_families=("player_season", "on_off"),
        stint_handling="per_stint",
        limitations=(
            "Raw on/off differential: not adjusted for teammates, opponents or minutes distribution.",
        ),
    ),
    _catalog("plus_minus", qualification=(("gp", 20),), limitations=(TEAM_CONTEXT,)),
    TraitSpec(
        "d_fg3_pct_diff",
        "3P% allowed vs normal",
        "statistical",
        "Opponents' three-point FG% when this player is the closest defender, minus those shooters' normal 3P% (provider defense dashboard)",
        "D_FGM / D_FGA − NORMAL_FG_PCT, category 3 Pointers",
        "fraction (difference)",
        False,
        ("defense_dash",),
        (("d_fga", 75),),
        numerator="d_fgm",
        denominator="d_fga",
        limitations=(
            "Closest-defender attribution by the provider; not an adjusted defensive rating. Published from 2013-14.",
        ),
    ),
    TraitSpec(
        "d_fg_pct_diff_lt6",
        "FG% allowed inside 6 ft vs normal",
        "statistical",
        "Opponents' FG% within 6 feet when this player is the closest defender, minus their normal FG% (provider defense dashboard)",
        "D_FGM / D_FGA − NORMAL_FG_PCT, category Less Than 6Ft",
        "fraction (difference)",
        False,
        ("defense_dash",),
        (("d_fga", 75),),
        numerator="d_fgm",
        denominator="d_fga",
        limitations=(
            "Closest-defender attribution by the provider; rim protection context (help, fouls) not included.",
        ),
    ),
    TraitSpec(
        "matchup_pts_per_poss_allowed",
        "Points allowed per matchup possession (shrunk)",
        "statistical",
        "Points scored by offensive players while this player was their primary defender, per partial possession, shrunk toward the league rate",
        "(Σ player_pts + prior_mean × k) / (Σ partial_poss + k), k = prior strength in possessions",
        "points per possession",
        False,
        ("matchups",),
        (("partial_poss", 300),),
        numerator="player_pts",
        denominator="partial_poss",
        limitations=(
            "Partial possessions are fractional and scheme-dependent; published from 2017-18.",
        ),
    ),
    _catalog(
        "wingspan_in",
        source_families=("combine_anthro",),
        qualification=(),
        stint_handling="n/a",
        units="inches",
        limitations=(
            "Measured once at the draft combine; absent for players who skipped measurement.",
        ),
    ),
    _catalog(
        "standing_reach_in",
        source_families=("combine_anthro",),
        qualification=(),
        stint_handling="n/a",
        units="inches",
    ),
    _catalog(
        "wingspan_height_ratio",
        source_families=("combine_anthro",),
        qualification=(),
        stint_handling="n/a",
        units="ratio",
        limitations=(
            "Wingspan over height without shoes, both from the combine; roster heights are never mixed in.",
        ),
    ),
)
REVIEWED_LIMITS = (
    "Counts only human labels on segments where the subject's identity was verified and the label was reviewed.",
    "Rates use systematically sampled or complete event sets; curated clips are examples only.",
    "Covers reviewed games only; coverage is part of the claim.",
)


def _reviewed(
    key: str,
    label: str,
    definition: str,
    action: str,
    success: tuple[str, ...],
    failure: tuple[str, ...],
    denominator: str,
) -> TraitSpec:
    return TraitSpec(
        key=key,
        label=label,
        evidence_class="reviewed_observation",
        definition=definition,
        formula=f"{'|'.join(success)} / {action} observed",
        units="fraction",
        higher_is_better=True,
        source_families=("annotation_snapshots",),
        qualification=(("opportunities", 1),),
        stint_handling="n/a",
        numerator="events",
        denominator=denominator,
        interval="wilson",
        limitations=REVIEWED_LIMITS,
        action=action,
        success_outcomes=success,
        failure_outcomes=failure,
    )


REVIEWED_TRAITS: tuple[TraitSpec, ...] = (
    _reviewed(
        "closeout_contest_rate",
        "Closeout contest rate",
        "Share of observed closeouts that ended with a hand up on the shot",
        "closeout",
        ("contest_hand_up",),
        ("late", "blown_by"),
        "closeouts observed",
    ),
    _reviewed(
        "screen_contact_rate",
        "Screen contact rate",
        "Share of observed screens that made contact with the defender",
        "screen_set",
        ("defender_contact",),
        ("slipped",),
        "screens observed",
    ),
    _reviewed(
        "cut_received_rate",
        "Cut received rate",
        "Share of observed cuts on which the player received the ball",
        "cut",
        ("received",),
        ("not_received",),
        "cuts observed",
    ),
    _reviewed(
        "box_out_rate",
        "Box-out success rate",
        "Share of observed box-outs after which the team secured the rebound",
        "box_out",
        ("secured_team",),
        ("lost",),
        "box-outs observed",
    ),
)
STATISTICAL_TRAITS: tuple[TraitSpec, ...] = TRAITS
TRAITS = (*TRAITS, *REVIEWED_TRAITS)
TRAIT_INDEX: dict[str, TraitSpec] = {t.key: t for t in TRAITS}


def registry() -> list[dict]:
    rows = []
    for t in TRAITS:
        d = asdict(t)
        d["qualification"] = dict(t.qualification)
        d["limitations"] = list(t.limitations)
        d["source_families"] = list(t.source_families)
        rows.append(d)
    return rows
