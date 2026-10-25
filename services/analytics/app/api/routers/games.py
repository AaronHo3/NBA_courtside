from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from app.api.deps import get_db, get_state_db
from app.api.envelope import clean, ok, records
from app.api.params import SeasonParam, SeasonTypeParam
from app.events import repository as repo
from app.evidence.read import count_for_game

router = APIRouter(prefix="/api/games", tags=["games"])

GameId = Annotated[
    str, Path(pattern=r"^[0-9A-Z]\d{9}$", description="provider game id with leading zeros")
]


@router.get("")
def list_games(
    season: SeasonParam,
    season_type: SeasonTypeParam = "Regular Season",
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    db=Depends(get_db),
):
    df, total = repo.games(db, season, season_type, limit=limit, offset=offset)
    return ok(records(df), {"total": total, "returned": len(df), "limit": limit, "offset": offset})


@router.get("/{game_id}")
def game_detail(game_id: GameId, db=Depends(get_db), state_db=Depends(get_state_db)):
    game = repo.game(db, game_id)
    if game is None:
        raise HTTPException(404, f"game {game_id} not found")
    coverage = {
        **repo.game_coverage(db, game_id),
        "evidence_items": count_for_game(state_db, game_id),
    }
    return ok(clean({"game": game, "coverage": coverage}))


@router.get("/{game_id}/events")
def game_events(
    game_id: GameId,
    period: Annotated[int | None, Query(ge=1, le=10)] = None,
    action_type: str | None = None,
    person_id: int | None = None,
    is_field_goal: bool | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    db=Depends(get_db),
):
    df, total = repo.game_events_page(
        db,
        game_id,
        period=period,
        action_type=action_type,
        person_id=person_id,
        is_field_goal=is_field_goal,
        limit=limit,
        offset=offset,
    )
    meta = {"total": total, "returned": len(df), "limit": limit, "offset": offset}
    if total == 0:
        meta["coverage"] = (
            f"no events ingested for game {game_id}; run the `events` family with --game-ids {game_id}"
        )
    return ok(records(df), meta)


@router.get("/{game_id}/roster")
def roster(game_id: GameId, db=Depends(get_db)):
    """Players who appeared for either team in the game (from player_game_logs); the annotation subject picker."""
    rows = repo.game_roster(db, game_id)
    return ok(clean(rows), {"players": len(rows), "teams": len({r["team_id"] for r in rows})})
