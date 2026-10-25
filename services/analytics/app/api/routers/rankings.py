from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.analytics.composite import ComponentSpec
from app.api.deps import get_db
from app.api.envelope import ok, records
from app.api.params import SeasonParam, SeasonTypeParam
from app.data.repositories import rankings as repo

router = APIRouter(prefix="/api/rankings", tags=["rankings"])


class ComponentIn(BaseModel):
    metric: str
    weight: float = Field(gt=0, le=100)
    higher_is_better: bool = True


class CustomRequest(BaseModel):
    season: str = Field(pattern=r"^\d{4}-\d{2}$")
    season_type: Literal["Regular Season", "Playoffs", "Pre Season"] = "Regular Season"
    components: list[ComponentIn] = Field(min_length=1, max_length=12)
    mode: Literal["rate", "cumulative"] = "rate"
    normalization: Literal["percentile", "zscore"] = "percentile"
    min_gp: int = Field(default=10, ge=0)
    min_minutes: float = Field(default=100, ge=0)
    position: str | None = None


@router.get("/lenses")
def lenses():
    return ok(repo.lens_catalog(), {"disclaimer": repo.DISCLAIMER})


def _run(db, season, season_type, comps, mode, normalization, min_gp, min_minutes, position):
    try:
        df, meta = repo.rank(
            db, season, season_type, comps, mode, normalization, min_gp, min_minutes, position
        )
    except KeyError as exc:
        raise HTTPException(422, f"unknown metric {exc}") from exc
    return ok(records(df), meta)


@router.get("")
def ranking(
    season: SeasonParam,
    lens: str,
    season_type: SeasonTypeParam = "Regular Season",
    mode: Literal["rate", "cumulative"] = "rate",
    normalization: Literal["percentile", "zscore"] = "percentile",
    min_gp: Annotated[int, Query(ge=0)] = 10,
    min_minutes: Annotated[float, Query(ge=0)] = 100,
    position: str | None = None,
    db=Depends(get_db),
):
    if lens not in repo.LENS_INDEX:
        raise HTTPException(422, f"unknown lens {lens!r}; see /api/rankings/lenses")
    comps = list(repo.LENS_INDEX[lens].components)
    return _run(db, season, season_type, comps, mode, normalization, min_gp, min_minutes, position)


@router.post("/custom")
def custom(body: CustomRequest, db=Depends(get_db)):
    comps = [ComponentSpec(c.metric, c.weight, c.higher_is_better) for c in body.components]
    return _run(
        db,
        body.season,
        body.season_type,
        comps,
        body.mode,
        body.normalization,
        body.min_gp,
        body.min_minutes,
        body.position,
    )
