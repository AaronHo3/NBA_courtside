"""Shared query-parameter validation."""

from __future__ import annotations

import re
from typing import Annotated, Literal

from fastapi import HTTPException, Query

from app.data.schemas import SEASON_TYPES

SEASON_RE = re.compile(r"^\d{4}-\d{2}$")
Normalization = Literal["totals", "per_game", "per_36", "per_100"]
SeasonType = Literal["Regular Season", "Playoffs", "Pre Season"]


def validate_season(season: str) -> str:
    if not SEASON_RE.match(season):
        raise HTTPException(422, f"season must look like 2024-25, got {season!r}")
    return season


def validate_season_type(season_type: str) -> str:
    if season_type not in SEASON_TYPES:
        raise HTTPException(422, f"season_type must be one of {SEASON_TYPES}")
    return season_type


SeasonParam = Annotated[
    str, Query(description="Season label, e.g. 2024-25", pattern=r"^\d{4}-\d{2}$")
]
SeasonTypeParam = Annotated[SeasonType, Query(description="Regular Season | Playoffs | Pre Season")]
