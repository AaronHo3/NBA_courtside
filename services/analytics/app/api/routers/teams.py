from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_db
from app.api.envelope import clean, ok, records
from app.api.params import SeasonParam, SeasonTypeParam
from app.data.repositories import teams as repo

router = APIRouter(prefix="/api/teams", tags=["teams"])


@router.get("")
def list_teams(db=Depends(get_db)):
    return ok(records(repo.list_teams(db)))


@router.get("/league")
def league(
    season: SeasonParam, season_type: SeasonTypeParam = "Regular Season", db=Depends(get_db)
):
    return ok(
        records(repo.league(db, season, season_type)),
        {
            "caveat": "Team ratings are provider/derived estimates; player ratings do not add up to them."
        },
    )


@router.get("/roster-metrics")
def roster_metrics(
    season: SeasonParam, season_type: SeasonTypeParam = "Regular Season", db=Depends(get_db)
):
    return ok(
        records(repo.roster_metrics(db, season, season_type)),
        {
            "caveat": "Relationships between roster descriptors and team outcomes are associations across a small number of teams, not causal effects.",
            "definitions": {
                "usage_gini": "Gini coefficient of players' share of team points (0 = perfectly even, 1 = one player)",
                "top3_min_share": "share of team minutes played by the three most-used players",
                "continuity_min_share": "share of minutes played by players who were on the team the previous season",
                "avg_height_in": "minutes-weighted roster-listed height",
            },
        },
    )


@router.get("/{team_id}/seasons")
def seasons(team_id: int, db=Depends(get_db)):
    if repo.team(db, team_id) is None:
        raise HTTPException(404, f"team {team_id} not found")
    return ok(records(repo.seasons(db, team_id)))


@router.get("/{team_id}/season")
def season_detail(
    team_id: int,
    season: SeasonParam,
    season_type: SeasonTypeParam = "Regular Season",
    min_lineup_poss: Annotated[float, Query(ge=0)] = 50,
    db=Depends(get_db),
):
    t = repo.team(db, team_id)
    if t is None:
        raise HTTPException(404, f"team {team_id} not found")
    ts = repo.seasons(db, team_id)
    row = ts[(ts.season == season) & (ts.season_type == season_type)]
    return ok(
        clean(
            {
                "team": {**t, **(row.iloc[0].to_dict() if not row.empty else {})},
                "roster": records(repo.roster(db, team_id, season, season_type)),
                "lineups": records(repo.lineups(db, team_id, season, season_type, min_lineup_poss)),
                "on_off": records(repo.on_off(db, team_id, season, season_type)),
                "stints": records(repo.stints(db, team_id, season, season_type)),
            }
        ),
        {"min_lineup_poss": min_lineup_poss},
    )
