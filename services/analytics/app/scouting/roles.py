"""Role templates (PROFILES_AND_RANKING §5): statistical criteria a candidate is matched against.

A template is a list of trait components (weights are normalised by the composite scorer), a list
of filters applied before scoring, optional video traits that only label coverage, and caveats
that travel with every result. Rankings are "match to selected criteria", not predictions.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

from app.scouting.compute import Cohort
from app.scouting.traits import TRAIT_INDEX

FilterOp = Literal["<=", ">=", "in", "qualified"]
COHORT_DEFAULTS = Cohort(min_gp=20, min_minutes=400.0)


@dataclass(frozen=True)
class RoleComponent:
    trait_key: str
    weight: float
    higher_is_better: bool | None = None  # None: take the trait registry's direction


@dataclass(frozen=True)
class FilterRule:
    column: str  # population column (usg_pct, fg3a, position) or trait key (op "qualified")
    op: FilterOp
    value: Any = None

    def label(self) -> str:
        if self.op == "qualified":
            return f"{self.column} qualified"
        if self.op == "in":
            return f"{self.column} in {list(self.value)}"
        return f"{self.column} {self.op} {self.value}"


@dataclass(frozen=True)
class RoleTemplate:
    role_id: str
    version: int
    label: str
    description: str
    components: tuple[RoleComponent, ...]
    filters: tuple[FilterRule, ...] = ()
    optional_video_traits: tuple[str, ...] = ()
    caveats: tuple[str, ...] = ()
    is_builtin: bool = False
    cohort_defaults: Cohort = field(default=COHORT_DEFAULTS)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["components"] = [asdict(c) for c in self.components]
        d["filters"] = [
            {
                **asdict(f),
                "value": list(f.value) if isinstance(f.value, tuple) else f.value,
                "label": f.label(),
            }
            for f in self.filters
        ]
        d["optional_video_traits"] = list(self.optional_video_traits)
        d["caveats"] = list(self.caveats)
        d["cohort_defaults"] = asdict(self.cohort_defaults)
        return d

    @staticmethod
    def from_dict(d: dict[str, Any]) -> RoleTemplate:
        filters = tuple(
            FilterRule(
                f["column"],
                f["op"],
                tuple(f["value"]) if isinstance(f.get("value"), list) else f.get("value"),
            )
            for f in d.get("filters", [])
        )
        cohort = d.get("cohort_defaults") or {}
        return RoleTemplate(
            role_id=d.get("role_id", ""),
            version=int(d.get("version", 1)),
            label=d["label"],
            description=d.get("description", ""),
            components=tuple(
                RoleComponent(c["trait_key"], float(c["weight"]), c.get("higher_is_better"))
                for c in d["components"]
            ),
            filters=filters,
            optional_video_traits=tuple(d.get("optional_video_traits", ())),
            caveats=tuple(d.get("caveats", ())),
            is_builtin=bool(d.get("is_builtin", False)),
            cohort_defaults=Cohort(
                **{
                    k: cohort[k]
                    for k in ("population", "min_gp", "min_minutes", "position")
                    if k in cohort
                }
            )
            if cohort
            else COHORT_DEFAULTS,
        )


def validate_role(role: RoleTemplate) -> None:
    """KeyError for unknown traits, ValueError for malformed weights or filters."""
    if not role.components:
        raise ValueError("a role needs at least one component")
    for c in role.components:
        if c.trait_key not in TRAIT_INDEX:
            raise KeyError(c.trait_key)
        if TRAIT_INDEX[c.trait_key].evidence_class != "statistical":
            raise ValueError(
                f"component {c.trait_key} is a reviewed-observation trait; only statistical traits are scored"
            )
        if c.weight <= 0:
            raise ValueError(f"component {c.trait_key}: weight must be positive")
    for key in role.optional_video_traits:
        if key not in TRAIT_INDEX or TRAIT_INDEX[key].evidence_class != "reviewed_observation":
            raise ValueError(
                f"optional_video_traits must name reviewed-observation traits; got {key!r}"
            )
    for f in role.filters:
        if f.op not in ("<=", ">=", "in", "qualified"):
            raise ValueError(f"filter {f.column}: unknown op {f.op!r}")
        if f.op == "qualified" and f.column not in TRAIT_INDEX:
            raise KeyError(f.column)
        if f.op == "in" and not isinstance(f.value, list | tuple):
            raise ValueError(f"filter {f.column}: 'in' needs a list of values")


NOT_ADJUSTED = "Raw defensive indicators; not adjusted individual impact. Use the shortlist to prioritise clips."
NO_SHOT_TYPE = (
    "3P% is a season aggregate; shot type (catch-and-shoot vs pull-up) is not in the data."
)

BUILTIN_ROLES: tuple[RoleTemplate, ...] = (
    RoleTemplate(
        "low_usage_perimeter_shooter",
        1,
        "Low-usage perimeter shooter",
        "Floor spacer who shoots well without needing the ball.",
        (
            RoleComponent("fg3_pct", 2.0, True),
            RoleComponent("fg3a_rate", 1.0, True),
            RoleComponent("efg_pct", 1.0, True),
            RoleComponent("tov_per100", 0.5, False),
        ),
        (FilterRule("usg_pct", "<=", 0.20), FilterRule("fg3a", ">=", 100)),
        (),
        (NO_SHOT_TYPE,),
        True,
    ),
    RoleTemplate(
        "rebounding_interior_player",
        1,
        "Rebounding interior player",
        "Secures rebounds at high rates on both ends.",
        (
            RoleComponent("oreb_pct", 1.5, True),
            RoleComponent("dreb_pct", 1.5, True),
            RoleComponent("reb_per36", 1.0, True),
            RoleComponent("blk_per36", 0.5, True),
        ),
        (FilterRule("position", "in", ("C", "F")),),
        (),
        ("Rebound shares are team-context dependent.",),
        True,
    ),
    RoleTemplate(
        "secondary_playmaker",
        1,
        "Secondary playmaker",
        "Creates for others without primary usage.",
        (
            RoleComponent("ast_pct", 2.0, True),
            RoleComponent("ast_to", 1.0, True),
            RoleComponent("tm_tov_pct", 1.0, False),
            RoleComponent("ast_per36", 1.0, True),
        ),
        (FilterRule("usg_pct", ">=", 0.14), FilterRule("usg_pct", "<=", 0.24)),
        (),
        ("Assist share depends on teammates' shooting.",),
        True,
    ),
    RoleTemplate(
        "perimeter_defense_research_candidate",
        1,
        "Perimeter-defense research candidate",
        "Candidate for further video review, not a defensive rating.",
        (
            RoleComponent("d_fg3_pct_diff", 1.5, False),
            RoleComponent("stl_per36", 1.0, True),
            RoleComponent("matchup_pts_per_poss_allowed", 1.0, False),
            RoleComponent("def_rating", 0.5, False),
        ),
        (FilterRule("d_fg3_pct_diff", "qualified"),),
        ("closeout_contest_rate",),
        (
            NOT_ADJUSTED,
            "Defense dashboards exist from 2013-14 and matchups from 2017-18; earlier seasons leave everyone ineligible.",
        ),
        True,
    ),
)
ROLE_INDEX: dict[str, RoleTemplate] = {r.role_id: r for r in BUILTIN_ROLES}
