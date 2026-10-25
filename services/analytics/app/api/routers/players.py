from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_db
from app.api.envelope import clean, ok, records
from app.api.params import Normalization, SeasonParam, SeasonTypeParam
from app.data.repositories import players as repo

router = APIRouter(prefix="/api/players", tags=["players"])


@router.get("/search")
def search(
    q: Annotated[str, Query(min_length=1, max_length=60)],
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    db=Depends(get_db),
):
    return ok(records(repo.search(db, q, limit)))


@router.get("/{player_id}")
def profile(player_id: int, db=Depends(get_db)):
    bio = repo.bio(db, player_id)
    if bio is None:
        raise HTTPException(404, f"player {player_id} not found")
    comb = repo.combine(db, player_id)
    seasons = repo.seasons(db, player_id)
    roster_m = {
        "height_in": bio.get("height_in"),
        "weight_lb": bio.get("weight_lb"),
        "source": bio.get("height_source") or "roster-listed",
        "note": "Roster heights are usually listed with shoes; combine heights are measured without shoes. Do not mix the two.",
    }
    combine_m = None
    if comb:
        ratio = (
            (comb["wingspan_in"] / comb["height_wo_shoes_in"])
            if comb.get("wingspan_in") and comb.get("height_wo_shoes_in")
            else None
        )
        combine_m = {
            **comb,
            "wingspan_height_ratio": ratio,
            "source": f"draft combine {comb.get('combine_season')}",
            "measured_at": comb.get("combine_season"),
        }
    timeline = []
    if not seasons.empty:
        for r in seasons[~seasons.is_aggregate].itertuples():
            timeline.append(
                {
                    "season": r.season,
                    "season_type": r.season_type,
                    "team_id": int(r.team_id),
                    "team_abbreviation": r.team_abbreviation,
                    "team_name": r.team_name,
                    "gp": r.gp,
                    "min": r.min,
                }
            )
    return ok(
        clean(
            {
                "bio": bio,
                "measurements": {"roster": roster_m, "combine": combine_m},
                "seasons": records(seasons),
                "career": repo.career_totals(seasons) if not seasons.empty else {},
                "timeline": timeline,
            }
        )
    )


@router.get("/{player_id}/percentiles")
def percentiles(
    player_id: int,
    season: SeasonParam,
    season_type: SeasonTypeParam = "Regular Season",
    population: Annotated[str, Query(pattern="^(all|position|team|custom)$")] = "all",
    ids: Annotated[
        str | None, Query(description="comma-separated player ids for population=custom")
    ] = None,
    min_minutes: float = 0.0,
    min_gp: int = 0,
    normalization: Normalization = "per_game",
    db=Depends(get_db),
):
    custom = tuple(int(x) for x in ids.split(",") if x.strip()) if ids else None
    data = repo.percentiles(
        db, player_id, season, season_type, population, custom, min_minutes, min_gp, normalization
    )
    if data is None:
        raise HTTPException(404, f"no {season} {season_type} data for player {player_id}")
    return ok(clean(data))
