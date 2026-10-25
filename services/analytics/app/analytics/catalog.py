"""Metric catalog: definitions, formulas, units and directions surfaced in the UI.

``kind`` controls normalisation: ``counting`` stats can be shown as totals, per game, per 36 or per
100 possessions; ``pct``/``rate``/``rating``/``physical`` metrics are never re-scaled.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

Kind = Literal["counting", "pct", "rate", "rating", "physical", "context"]


@dataclass(frozen=True)
class Metric:
    key: str
    label: str
    kind: Kind
    definition: str
    formula: str | None = None
    higher_is_better: bool | None = True
    unit: str | None = None
    source: str = "provider box score"
    decimals: int = 1


_M = Metric
METRICS: tuple[Metric, ...] = (
    _M("gp", "Games", "context", "Games played", decimals=0),
    _M("min", "Minutes", "counting", "Minutes played", decimals=0),
    _M("pts", "Points", "counting", "Points scored"),
    _M("fgm", "FGM", "counting", "Field goals made", decimals=0),
    _M("fga", "FGA", "counting", "Field goals attempted", decimals=0),
    _M("fg3m", "3PM", "counting", "Three-pointers made", decimals=0),
    _M("fg3a", "3PA", "counting", "Three-pointers attempted", decimals=0),
    _M("ftm", "FTM", "counting", "Free throws made", decimals=0),
    _M("fta", "FTA", "counting", "Free throws attempted", decimals=0),
    _M("oreb", "OREB", "counting", "Offensive rebounds"),
    _M("dreb", "DREB", "counting", "Defensive rebounds"),
    _M("reb", "REB", "counting", "Total rebounds"),
    _M("ast", "AST", "counting", "Assists"),
    _M("tov", "TOV", "counting", "Turnovers", higher_is_better=False),
    _M("stl", "STL", "counting", "Steals"),
    _M("blk", "BLK", "counting", "Blocks"),
    _M("pf", "PF", "counting", "Personal fouls", higher_is_better=False),
    _M("plus_minus", "+/-", "counting", "Team point differential while the player was on court"),
    _M("fg_pct", "FG%", "pct", "Field goal percentage", "FGM / FGA", decimals=3),
    _M("fg3_pct", "3P%", "pct", "Three-point percentage", "3PM / 3PA", decimals=3),
    _M("ft_pct", "FT%", "pct", "Free-throw percentage", "FTM / FTA", decimals=3),
    _M(
        "efg_pct",
        "eFG%",
        "pct",
        "Effective field goal percentage; weights threes by 1.5",
        "(FGM + 0.5 × 3PM) / FGA",
        decimals=3,
        source="computed from totals",
    ),
    _M(
        "ts_pct",
        "TS%",
        "pct",
        "True shooting percentage; 0.44 × FTA approximates free-throw possessions",
        "PTS / (2 × (FGA + 0.44 × FTA))",
        decimals=3,
        source="computed from totals",
    ),
    _M(
        "ast_to",
        "AST/TO",
        "rate",
        "Assist-to-turnover ratio (undefined with zero turnovers)",
        "AST / TOV",
        decimals=2,
        source="computed from totals",
    ),
    _M(
        "usg_pct",
        "USG%",
        "pct",
        "Share of team possessions used while on court (provider formula; stored as a fraction)",
        "((FGA + 0.44 × FTA + TOV) × (Tm MIN / 5)) / (MIN × (Tm FGA + 0.44 × Tm FTA + Tm TOV))",
        source="provider advanced",
        decimals=3,
    ),
    _M(
        "ast_pct",
        "AST%",
        "pct",
        "Share of teammate field goals assisted while on court",
        source="provider advanced",
        decimals=3,
    ),
    _M(
        "ast_ratio",
        "AST ratio",
        "rate",
        "Assists per 100 possessions used",
        source="provider advanced",
    ),
    _M(
        "oreb_pct",
        "OREB%",
        "pct",
        "Share of available offensive rebounds grabbed",
        source="provider advanced",
        decimals=3,
    ),
    _M(
        "dreb_pct",
        "DREB%",
        "pct",
        "Share of available defensive rebounds grabbed",
        source="provider advanced",
        decimals=3,
    ),
    _M(
        "reb_pct",
        "REB%",
        "pct",
        "Share of available rebounds grabbed",
        source="provider advanced",
        decimals=3,
    ),
    _M(
        "tm_tov_pct",
        "TOV%",
        "pct",
        "Turnovers as a share of possessions used",
        higher_is_better=False,
        source="provider advanced",
        decimals=3,
    ),
    _M(
        "off_rating",
        "ORtg",
        "rating",
        "Team points scored per 100 possessions while on court",
        source="provider advanced",
    ),
    _M(
        "def_rating",
        "DRtg",
        "rating",
        "Team points allowed per 100 possessions while on court",
        higher_is_better=False,
        source="provider advanced",
    ),
    _M(
        "net_rating",
        "NetRtg",
        "rating",
        "ORtg minus DRtg while on court",
        source="provider advanced",
    ),
    _M(
        "pace",
        "Pace",
        "context",
        "Possessions per 48 minutes",
        higher_is_better=None,
        source="provider advanced",
    ),
    _M(
        "pie",
        "PIE",
        "rating",
        "Player Impact Estimate: share of game events the player produced (provider formula)",
        decimals=3,
        source="provider advanced",
    ),
    _M(
        "poss",
        "Possessions",
        "counting",
        "Possessions played (provider estimate)",
        decimals=0,
        source="provider advanced",
    ),
    _M("age", "Age", "context", "Age on 1 February of the season", higher_is_better=None),
    _M(
        "height_in",
        "Height (listed)",
        "physical",
        "Roster-listed height, inches (typically measured with shoes)",
        unit="in",
        higher_is_better=None,
        source="roster",
    ),
    _M(
        "weight_lb",
        "Weight",
        "physical",
        "Listed weight, pounds",
        unit="lb",
        higher_is_better=None,
        source="roster",
        decimals=0,
    ),
    _M(
        "wingspan_in",
        "Wingspan",
        "physical",
        "Draft combine wingspan, inches (only for measured players)",
        unit="in",
        higher_is_better=None,
        source="draft combine",
        decimals=2,
    ),
    _M(
        "standing_reach_in",
        "Standing reach",
        "physical",
        "Draft combine standing reach, inches",
        unit="in",
        higher_is_better=None,
        source="draft combine",
        decimals=2,
    ),
    _M(
        "height_wo_shoes_in",
        "Height (combine, no shoes)",
        "physical",
        "Draft combine height without shoes, inches",
        unit="in",
        higher_is_better=None,
        source="draft combine",
        decimals=2,
    ),
    _M(
        "wingspan_height_ratio",
        "Wingspan / height",
        "physical",
        "Combine wingspan divided by combine height without shoes",
        "wingspan_in / height_wo_shoes_in",
        higher_is_better=None,
        source="computed from combine",
        decimals=3,
    ),
    _M(
        "on_off_net",
        "On/Off net",
        "rating",
        "Team net rating with the player on court minus off court (raw, not adjusted for teammates or opponents)",
        "net_on − net_off",
        source="provider on/off",
    ),
)

METRIC_INDEX: dict[str, Metric] = {m.key: m for m in METRICS}
COUNTING_KEYS: tuple[str, ...] = tuple(m.key for m in METRICS if m.kind == "counting")
NORMALIZATIONS: tuple[str, ...] = ("totals", "per_game", "per_36", "per_100")
NORMALIZATION_LABELS: dict[str, str] = {
    "totals": "Totals",
    "per_game": "Per game",
    "per_36": "Per 36 minutes",
    "per_100": "Per 100 possessions",
}


def catalog() -> list[dict]:
    return [asdict(m) for m in METRICS]
