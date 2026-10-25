from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from app.api.deps import get_state_db
from app.api.envelope import clean, ok
from app.evidence.evidence_items import list_evidence
from app.evidence.read import evidence_detail

router = APIRouter(prefix="/api/evidence", tags=["evidence"])

EvidenceId = Annotated[str, Path(pattern=r"^[0-9A-HJKMNP-TV-Z]{26}$", description="evidence ULID")]
Kind = Literal["video_segment", "annotation", "external_reference", "statistic", "model_estimate"]
Status = Literal["active", "stale", "superseded", "deleted"]


@router.get("")
def list_items(
    player_id: int | None = None,
    game_id: Annotated[str | None, Query(pattern=r"^[0-9A-Z]\d{9}$")] = None,
    kind: Kind | None = None,
    status: Status | None = None,
    review_status: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    state_db=Depends(get_state_db),
):
    rows, total = list_evidence(
        state_db,
        player_id=player_id,
        game_id=game_id,
        kind=kind,
        status=status,
        review_status=review_status,
        limit=limit,
        offset=offset,
    )
    return ok(
        clean(rows), {"total": total, "returned": len(rows), "limit": limit, "offset": offset}
    )


@router.get("/{evidence_id}")
def item_detail(evidence_id: EvidenceId, state_db=Depends(get_state_db)):
    detail = evidence_detail(state_db, evidence_id)
    if detail is None:
        raise HTTPException(
            404, f"evidence {evidence_id} not found in namespace {state_db.namespace}"
        )
    return ok(clean(detail))
