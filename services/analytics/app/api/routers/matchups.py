from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_db, get_layout
from app.api.envelope import clean, ok, records
from app.api.params import SeasonParam, SeasonTypeParam
from app.data.repositories import matchups as repo

router = APIRouter(tags=["matchups"])

PriorParam = Annotated[
    float, Query(ge=0, le=500, description="Beta prior strength in pseudo-attempts")
]
MinPossParam = Annotated[float, Query(ge=0)]


def _meta(prior: dict, min_poss: float, available: bool = True, reason: str | None = None) -> dict:
    return {
        "available": available,
        "reason": reason,
        "prior": prior,
        "min_poss": min_poss,
        "wording": repo.WORDING,
        "shrinkage": "fg_pct_shrunk = (FGM + prior_mean × k) / (FGA + k); k = prior strength in attempts, prior_mean = league matchup FG% for the season",
    }


@router.get("/api/matchups/availability")
def availability(
    season: SeasonParam, season_type: SeasonTypeParam = "Regular Season", layout=Depends(get_layout)
):
    available, reason = repo.availability(layout, season, season_type)
    return ok(
        {"available": available, "reason": reason, "season": season, "season_type": season_type}
    )


@router.get("/api/matchups/offense/{player_id}")
def offense(
    player_id: int,
    season: SeasonParam,
    season_type: SeasonTypeParam = "Regular Season",
    min_poss: MinPossParam = 10,
    prior_strength: PriorParam = repo.DEFAULT_PRIOR_STRENGTH,
    db=Depends(get_db),
    layout=Depends(get_layout),
):
    available, reason = repo.availability(layout, season, season_type)
    if not available:
        return ok([], _meta({}, min_poss, False, reason))
    df, prior = repo.offense(db, player_id, season, season_type, min_poss, prior_strength)
    return ok(records(df), _meta(prior, min_poss))


@router.get("/api/matchups/defense/{player_id}")
def defense(
    player_id: int,
    season: SeasonParam,
    season_type: SeasonTypeParam = "Regular Season",
    min_poss: MinPossParam = 10,
    prior_strength: PriorParam = repo.DEFAULT_PRIOR_STRENGTH,
    db=Depends(get_db),
    layout=Depends(get_layout),
):
    available, reason = repo.availability(layout, season, season_type)
    if not available:
        return ok([], _meta({}, min_poss, False, reason))
    df, prior = repo.defense(db, player_id, season, season_type, min_poss, prior_strength)
    return ok(records(df), _meta(prior, min_poss))


@router.get("/api/matchups/pair")
def pair(
    off_player_id: int,
    def_player_id: int,
    prior_strength: PriorParam = repo.DEFAULT_PRIOR_STRENGTH,
    db=Depends(get_db),
):
    data = repo.pair(db, off_player_id, def_player_id, prior_strength)
    return ok(
        {
            "seasons": records(data["seasons"])
            if hasattr(data["seasons"], "empty")
            else data["seasons"],
            "total": clean(data["total"]),
            "prior": data.get("prior"),
        },
        {"wording": repo.WORDING},
    )


@router.get("/api/matchups/heatmap")
def heatmap(
    season: SeasonParam,
    team_id: int,
    opponent_team_id: int,
    season_type: SeasonTypeParam = "Regular Season",
    min_poss: MinPossParam = 10,
    db=Depends(get_db),
    layout=Depends(get_layout),
):
    available, reason = repo.availability(layout, season, season_type)
    if not available:
        return ok({"offense": [], "defense": [], "cells": []}, _meta({}, min_poss, False, reason))
    data = repo.heatmap(db, team_id, opponent_team_id, season, season_type, min_poss)
    return ok(
        {
            "offense": records(data["offense"]) if hasattr(data["offense"], "empty") else [],
            "defense": records(data["defense"]) if hasattr(data["defense"], "empty") else [],
            "cells": records(data["cells"]) if hasattr(data["cells"], "empty") else [],
        },
        _meta({}, min_poss),
    )


@router.get("/api/defense/{player_id}")
def defense_dashboard(
    player_id: int,
    season: SeasonParam,
    season_type: SeasonTypeParam = "Regular Season",
    db=Depends(get_db),
):
    df = repo.defense_dashboard(db, player_id, season, season_type)
    return ok(
        records(df),
        {
            "definition": "d_fg_pct is opponents' FG% on shots this player was the closest defender; normal_fg_pct is those shooters' usual FG% in the same category; pct_plusminus = d_fg_pct − normal_fg_pct (negative is better)."
        },
    )
