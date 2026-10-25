from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path

from app.api.deps import get_db, get_state_db
from app.api.envelope import clean, ok
from app.events import repository as repo
from app.evidence.models import EventKey
from app.evidence.read import evidence_for_event

router = APIRouter(prefix="/api/events", tags=["events"])

EventSystem = Literal["pbp_v3", "pbp_v2", "demo_shots"]
GameId = Annotated[str, Path(pattern=r"^[0-9A-Z]\d{9}$")]


@router.get("/{system}/{game_id}/{event_id}")
def event_detail(
    system: EventSystem,
    game_id: GameId,
    event_id: int,
    db=Depends(get_db),
    state_db=Depends(get_state_db),
):
    detail = repo.event(db, system, game_id, event_id)
    if detail is None:
        raise HTTPException(404, f"event {system}/{game_id}/{event_id} not found")
    key = EventKey(system, game_id, event_id)
    return ok(
        clean(
            {
                **detail,
                "shot": repo.shot_for_event(db, system, game_id, event_id),
                "evidence": evidence_for_event(state_db, key),
            }
        )
    )
