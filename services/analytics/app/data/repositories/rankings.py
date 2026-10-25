"""Transparent ranking lenses and user-defined composites."""

from __future__ import annotations

from dataclasses import asdict, dataclass

import pandas as pd

from app.analytics.catalog import COUNTING_KEYS, METRIC_INDEX
from app.analytics.composite import ComponentSpec, compute_composite
from app.data.db import Database
from app.data.repositories.league import PopulationFilters, league_population

DISCLAIMER = (
    "Each lens is a user-defined index built from a small set of components, not an established "
    "basketball statistic. Components are normalised within the qualified population of the chosen "
    "season; players missing any component are ineligible rather than silently re-weighted. "
    "Rankings compare players within one season; era adjustment across seasons is limited to "
    "within-season percentiles."
)


@dataclass(frozen=True)
class Lens:
    key: str
    label: str
    description: str
    components: tuple[ComponentSpec, ...]
    caveat: str | None = None


LENSES: tuple[Lens, ...] = (
    Lens(
        "scoring_efficiency",
        "Scoring efficiency",
        "How efficiently a player converts scoring chances.",
        (ComponentSpec("ts_pct", 2.0), ComponentSpec("efg_pct", 1.0), ComponentSpec("ft_pct", 0.5)),
    ),
    Lens(
        "scoring_production",
        "Scoring production",
        "How much a player scores.",
        (ComponentSpec("pts", 2.0), ComponentSpec("fgm", 1.0), ComponentSpec("fg3m", 0.5)),
    ),
    Lens(
        "playmaking",
        "Playmaking",
        "Creation for others relative to turnovers.",
        (
            ComponentSpec("ast", 2.0),
            ComponentSpec("ast_pct", 1.0),
            ComponentSpec("tov", 1.0, higher_is_better=False),
            ComponentSpec("ast_to", 1.0),
        ),
    ),
    Lens(
        "rebounding",
        "Rebounding",
        "Rebound volume and share of available rebounds.",
        (ComponentSpec("reb", 1.0), ComponentSpec("oreb_pct", 1.0), ComponentSpec("dreb_pct", 1.0)),
    ),
    Lens(
        "defense",
        "Defensive indicators",
        "Available box-score and on-court defensive indicators.",
        (
            ComponentSpec("stl", 1.0),
            ComponentSpec("blk", 1.0),
            ComponentSpec("def_rating", 1.0, higher_is_better=False),
            ComponentSpec("dreb", 0.5),
        ),
        caveat="Box-score defense (steals, blocks) and on-court defensive rating are weak, team-dependent proxies for individual defense.",
    ),
    Lens(
        "impact",
        "Impact indicators",
        "Provider impact estimates and on/off differentials.",
        (
            ComponentSpec("pie", 1.0),
            ComponentSpec("net_rating", 1.0),
            ComponentSpec("on_off_net", 1.0),
            ComponentSpec("plus_minus", 0.5),
        ),
        caveat="Raw on/off and plus-minus are not adjusted for teammates, opponents or minutes distribution.",
    ),
    Lens(
        "balanced",
        "Balanced profile",
        "A broad, equal-ish blend across efficiency, production, playmaking, rebounding, defense and impact.",
        (
            ComponentSpec("ts_pct", 1.0),
            ComponentSpec("pts", 1.0),
            ComponentSpec("ast", 1.0),
            ComponentSpec("reb", 1.0),
            ComponentSpec("stl", 0.5),
            ComponentSpec("blk", 0.5),
            ComponentSpec("tov", 0.5, higher_is_better=False),
            ComponentSpec("net_rating", 1.0),
        ),
    ),
)
LENS_INDEX = {lens.key: lens for lens in LENSES}


def lens_catalog() -> list[dict]:
    out = []
    for lens in LENSES:
        d = asdict(lens)
        for c in d["components"]:
            m = METRIC_INDEX.get(c["metric"])
            c["label"] = m.label if m else c["metric"]
            c["kind"] = m.kind if m else None
        out.append(d)
    return out


def rank(
    db: Database,
    season: str,
    season_type: str,
    components: list[ComponentSpec],
    mode: str = "rate",
    normalization: str = "percentile",
    min_gp: int = 10,
    min_minutes: float = 100.0,
    position: str | None = None,
) -> tuple[pd.DataFrame, dict]:
    for c in components:
        if c.metric not in METRIC_INDEX:
            raise KeyError(c.metric)
    counting_norm = "per_game" if mode == "rate" else "totals"
    pop = league_population(
        db,
        season,
        season_type,
        counting_norm,
        PopulationFilters(min_gp=min_gp, min_minutes=min_minutes, position=position),
    )
    meta = {
        "population_size": int(len(pop)),
        "normalization": normalization,
        "normalization_of_counting_stats": counting_norm,
        "min_gp": min_gp,
        "min_minutes": min_minutes,
        "mode": mode,
        "disclaimer": DISCLAIMER,
        "components": [
            {
                "metric": c.metric,
                "weight": c.weight,
                "higher_is_better": c.higher_is_better,
                "label": METRIC_INDEX[c.metric].label,
                "kind": METRIC_INDEX[c.metric].kind,
                "scaled": c.metric in COUNTING_KEYS,
            }
            for c in components
        ],
    }
    if pop.empty:
        return pop, meta
    scored = compute_composite(pop, components, normalization=normalization)
    scored["rank"] = scored["score"].rank(ascending=False, method="min")
    scored = scored.sort_values(
        ["eligible", "score"], ascending=[False, False], na_position="last"
    ).reset_index(drop=True)
    keep = [
        "rank",
        "player_id",
        "full_name",
        "team_abbreviation",
        "position",
        "age",
        "gp",
        "min",
        "score",
        "eligible",
        "missing",
        "contributions",
        *[c.metric for c in components],
    ]
    keep = list(dict.fromkeys(k for k in keep if k in scored.columns))
    return scored[keep], meta
