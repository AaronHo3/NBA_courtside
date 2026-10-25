"""Annotations API (scouting B-07). Local-only: not mounted in public read-only mode."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.deps import get_state_db
from app.api.envelope import clean, ok
from app.evidence import annotations as an
from app.evidence.registry import EvidenceNamespaceError
from app.evidence.vocabulary import VOCAB_VERSION, catalog

router = APIRouter(prefix="/api/annotations", tags=["annotations"])

ULID = r"^[0-9A-HJKMNP-TV-Z]{26}$"
AnnotationId = Annotated[str, Path(pattern=ULID)]
Identity = Literal["verified", "asserted", "unknown"]
Visibility = Literal["full", "partial", "obstructed", "off_frame"]
Sampling = Literal[
    "complete_event_set", "systematic_sample", "random_sample", "curated", "provider_selected"
]
Review = Literal["unreviewed", "reviewed_ok", "reviewed_corrected", "rejected"]


class EventKeyIn(BaseModel):
    source_event_system: Literal["pbp_v3", "pbp_v2", "demo_shots"]
    game_id: str = Field(pattern=r"^[0-9A-Z]\d{9}$")
    source_event_id: int = Field(ge=0)


class ParticipantIn(BaseModel):
    role: str = Field(min_length=1, max_length=40)
    player_id: int | None = None
    identity_status: Identity = "unknown"


class AnnotationIn(BaseModel):
    segment_id: str = Field(pattern=ULID)
    media_start_ms: int = Field(ge=0)
    media_end_ms: int = Field(ge=0)
    action: str = Field(max_length=40)
    outcome: str | None = Field(default=None, max_length=40)
    sampling_method: Sampling
    visibility: Visibility
    subject_player_id: int | None = None
    subject_identity_status: Identity = "unknown"
    participants: list[ParticipantIn] | None = None
    label_source: str = Field(default="human", max_length=80)
    confidence_raw: float | None = None
    event_key: EventKeyIn | None = None
    notes: str | None = Field(default=None, max_length=4000)
    supporting_timestamps: list[int] | None = None
    created_by: str = Field(default="user", max_length=80)
    change_reason: str | None = Field(default=None, max_length=200)


class AnnotationPatch(BaseModel):
    changed_by: str = Field(max_length=80)
    change_reason: str | None = Field(default=None, max_length=200)
    media_start_ms: int | None = Field(default=None, ge=0)
    media_end_ms: int | None = Field(default=None, ge=0)
    action: str | None = Field(default=None, max_length=40)
    outcome: str | None = Field(default=None, max_length=40)
    sampling_method: Sampling | None = None
    visibility: Visibility | None = None
    subject_player_id: int | None = None
    subject_identity_status: Identity | None = None
    participants: list[ParticipantIn] | None = None
    label_source: str | None = Field(default=None, max_length=80)
    confidence_raw: float | None = None
    event_key: EventKeyIn | None = None
    notes: str | None = Field(default=None, max_length=4000)
    supporting_timestamps: list[int] | None = None


class ReviewIn(BaseModel):
    review_status: Review
    reviewer: str | None = Field(default=None, max_length=80)


def _domain(fn, *args, **kwargs) -> Any:
    try:
        return fn(*args, **kwargs)
    except an.AnnotationNotFoundError as exc:
        raise HTTPException(404, str(exc.args[0]) if exc.args else "not found") from exc
    except (an.AnnotationError, EvidenceNamespaceError) as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/vocabulary")
def vocabulary():
    return ok(catalog(), {"vocab_version": VOCAB_VERSION})


@router.get("")
def list_items(
    segment_id: Annotated[str | None, Query(pattern=ULID)] = None,
    asset_id: Annotated[str | None, Query(pattern=ULID)] = None,
    player_id: int | None = None,
    action: Annotated[str | None, Query(max_length=40)] = None,
    review_status: Review | None = None,
    game_id: Annotated[str | None, Query(pattern=r"^[0-9A-Z]\d{9}$")] = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
    include_deleted: bool = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    state_db=Depends(get_state_db),
):
    rows, total = an.list_annotations(
        state_db,
        segment_id=segment_id,
        asset_id=asset_id,
        player_id=player_id,
        action=action,
        review_status=review_status,
        game_id=game_id,
        q=q,
        include_deleted=include_deleted,
        limit=limit,
        offset=offset,
    )
    return ok(
        clean(rows), {"total": total, "returned": len(rows), "limit": limit, "offset": offset}
    )


@router.post("", status_code=201)
def create(body: AnnotationIn, state_db=Depends(get_state_db)):
    data = body.model_dump()
    ann = _domain(an.create_annotation, state_db, **data)
    return JSONResponse(status_code=201, content=ok(clean(ann)))


@router.get("/{annotation_id}")
def detail(annotation_id: AnnotationId, state_db=Depends(get_state_db)):
    ann = an.get_annotation(state_db, annotation_id)
    if ann is None:
        raise HTTPException(404, f"annotation {annotation_id} not found")
    return ok(clean({"annotation": ann, "revisions": an.revisions(state_db, annotation_id)}))


@router.patch("/{annotation_id}")
def patch(annotation_id: AnnotationId, body: AnnotationPatch, state_db=Depends(get_state_db)):
    fields = body.model_dump(exclude_unset=True)
    changed_by = fields.pop("changed_by")
    reason = fields.pop("change_reason", None)
    return ok(
        clean(
            _domain(
                an.update_annotation,
                state_db,
                annotation_id,
                changed_by=changed_by,
                change_reason=reason,
                **fields,
            )
        )
    )


@router.post("/{annotation_id}/review")
def review(annotation_id: AnnotationId, body: ReviewIn, state_db=Depends(get_state_db)):
    return ok(
        clean(
            _domain(
                an.review_annotation,
                state_db,
                annotation_id,
                review_status=body.review_status,
                reviewer=body.reviewer,
            )
        )
    )


@router.delete("/{annotation_id}")
def delete(
    annotation_id: AnnotationId,
    changed_by: Annotated[str, Query(max_length=80)] = "user",
    reason: Annotated[str | None, Query(max_length=200)] = None,
    state_db=Depends(get_state_db),
):
    """Soft delete: the head row keeps its history and a deletion revision; nothing is removed."""
    return ok(
        clean(
            _domain(
                an.delete_annotation, state_db, annotation_id, changed_by=changed_by, reason=reason
            )
        )
    )
