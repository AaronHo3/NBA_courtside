from __future__ import annotations

import io
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.api.deps import get_db, get_settings_dep
from app.api.envelope import ok, records
from app.api.params import Normalization, SeasonParam, SeasonTypeParam
from app.data.repositories.league import PopulationFilters, league_population

router = APIRouter(prefix="/api/league", tags=["league"])

EXPORT_DROP = {"contributions", "missing", "source", "fetched_at"}


def _filters(team_id, position, min_gp, min_minutes, age_min, age_max, q):
    return PopulationFilters(
        team_id=team_id,
        position=position,
        min_gp=min_gp,
        min_minutes=min_minutes,
        age_min=age_min,
        age_max=age_max,
        query=q,
    )


@router.get("/explorer")
def explorer(
    season: SeasonParam,
    season_type: SeasonTypeParam = "Regular Season",
    normalization: Normalization = "per_game",
    team_id: int | None = None,
    position: Annotated[str | None, Query(pattern="^(G|F|C)$")] = None,
    min_gp: Annotated[int, Query(ge=0)] = 10,
    min_minutes: Annotated[float, Query(ge=0)] = 100,
    age_min: float | None = None,
    age_max: float | None = None,
    q: str | None = None,
    db=Depends(get_db),
    settings=Depends(get_settings_dep),
):
    df = league_population(
        db,
        season,
        season_type,
        normalization,
        _filters(team_id, position, min_gp, min_minutes, age_min, age_max, q),
    )
    total = len(df)
    df = df.head(settings.max_rows)
    return ok(
        records(df),
        {
            "normalization": normalization,
            "population": total,
            "returned": len(df),
            "season": season,
            "season_type": season_type,
            "thresholds": {"min_gp": min_gp, "min_minutes": min_minutes},
        },
    )


@router.get("/explorer.csv")
def explorer_csv(
    season: SeasonParam,
    season_type: SeasonTypeParam = "Regular Season",
    normalization: Normalization = "per_game",
    team_id: int | None = None,
    position: Annotated[str | None, Query(pattern="^(G|F|C)$")] = None,
    min_gp: Annotated[int, Query(ge=0)] = 10,
    min_minutes: Annotated[float, Query(ge=0)] = 100,
    age_min: float | None = None,
    age_max: float | None = None,
    q: str | None = None,
    ids: Annotated[
        str | None, Query(description="comma-separated player ids to restrict the export")
    ] = None,
    db=Depends(get_db),
):
    f = _filters(team_id, position, min_gp, min_minutes, age_min, age_max, q)
    if ids:
        f = PopulationFilters(
            **{**f.__dict__, "player_ids": tuple(int(x) for x in ids.split(",") if x.strip())}
        )
    df = league_population(db, season, season_type, normalization, f)
    df = df.drop(columns=[c for c in df.columns if c in EXPORT_DROP], errors="ignore")
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    filename = f"league_explorer_{season}_{season_type.replace(' ', '_')}_{normalization}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
