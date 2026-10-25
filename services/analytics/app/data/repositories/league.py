"""League-wide player population for a season (explorer, rankings, percentiles)."""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from app.data.db import Database
from app.data.repositories.common import (
    add_derived_rates,
    normalize_counting,
    on_off_net_by_stint,
    one_row_player_season,
    player_context,
)

CONTEXT_COLS = [
    "full_name",
    "position",
    "height_in",
    "weight_lb",
    "wingspan_in",
    "standing_reach_in",
    "height_wo_shoes_in",
    "wingspan_height_ratio",
    "is_active",
    "draft_year",
]


@dataclass(frozen=True)
class PopulationFilters:
    team_id: int | None = None
    position: str | None = None
    min_gp: int = 0
    min_minutes: float = 0.0
    age_min: float | None = None
    age_max: float | None = None
    query: str | None = None
    player_ids: tuple[int, ...] | None = None


def league_population(
    db: Database,
    season: str,
    season_type: str,
    normalization: str = "per_game",
    filters: PopulationFilters | None = None,
) -> pd.DataFrame:
    f = filters or PopulationFilters()
    if f.team_id is not None:
        ps = db.query(
            "SELECT * FROM player_season WHERE season = ? AND season_type = ? AND team_id = ? AND NOT is_aggregate",
            [season, season_type, f.team_id],
        )
    else:
        ps = one_row_player_season(db, season, season_type)
    if ps.empty:
        return ps
    ctx = player_context(db)
    out = ps.merge(ctx[["player_id", *CONTEXT_COLS]], on="player_id", how="left")
    oo = on_off_net_by_stint(db, season, season_type)
    out = out.merge(oo, on=["player_id", "team_id"], how="left")
    out = add_derived_rates(out)
    out = normalize_counting(out, normalization)
    mask = pd.Series(True, index=out.index)
    if f.position:
        mask &= out["position"].astype(str).str.split("-").apply(lambda parts: f.position in parts)
    if f.min_gp:
        mask &= out["gp"].fillna(0) >= f.min_gp
    if f.min_minutes:
        total_min = ps.set_index(["player_id", "team_id"])["min"]
        keyed = out.set_index(["player_id", "team_id"]).index
        mask &= (
            pd.Series(total_min.reindex(keyed).to_numpy(), index=out.index).fillna(0)
            >= f.min_minutes
        )
    if f.age_min is not None:
        mask &= out["age"] >= f.age_min
    if f.age_max is not None:
        mask &= out["age"] <= f.age_max
    if f.query:
        mask &= out["full_name"].astype(str).str.contains(f.query, case=False, regex=False)
    if f.player_ids:
        mask &= out["player_id"].isin(list(f.player_ids))
    out = out[mask].reset_index(drop=True)
    out["normalization"] = normalization
    return out
