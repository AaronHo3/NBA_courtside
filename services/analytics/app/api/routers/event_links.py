"""Write side of event-video links for managed media (scouting B-06). Local-only: not mounted in
public read-only mode, because every route here mutates state."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, model_validator

from app.api.deps import get_db, get_layout, get_settings_dep, get_state_db
from app.api.envelope import clean, ok
from app.evidence.links import LinkError, LinkNotFoundError, create_managed_link, review_link
from app.evidence.models import EventKey
from app.evidence.registry import now_iso
from app.evidence.snapshots import describe_snapshots, latest_snapshot_version
from app.jobs.inline import enqueue_and_maybe_run

router = APIRouter(tags=["evidence"])

ULID = r"^[0-9A-HJKMNP-TV-Z]{26}$"
EventSystem = Literal["pbp_v3", "pbp_v2", "demo_shots"]
GameId = Annotated[str, Path(pattern=r"^[0-9A-Z]\d{9}$")]
LinkId = Annotated[str, Path(pattern=ULID, description="link ULID")]


class LinkIn(BaseModel):
    asset_id: str = Field(pattern=ULID)
    segment_id: str = Field(pattern=ULID)
    mode: Literal["manual", "interpolated"]
    media_start_ms: int | None = Field(default=None, ge=0)
    media_end_ms: int | None = Field(default=None, ge=0)
    timing_error_ms: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _manual_needs_both_bounds(self):
        if self.mode == "manual" and (self.media_start_ms is None or self.media_end_ms is None):
            raise ValueError("media_start_ms and media_end_ms are required for a manual link")
        return self


class LinkReview(BaseModel):
    review_status: Literal["unreviewed", "reviewed_ok", "reviewed_corrected", "rejected"]
    reviewer: str | None = Field(default=None, max_length=80)


def _domain(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except LinkNotFoundError as exc:
        raise HTTPException(404, str(exc.args[0]) if exc.args else "not found") from exc
    except LinkError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/api/events/{system}/{game_id}/{event_id}/links", status_code=201)
def create_link(
    system: EventSystem,
    game_id: GameId,
    event_id: int,
    body: LinkIn,
    db=Depends(get_db),
    state_db=Depends(get_state_db),
):
    """Link a provider event to a segment of an authorised managed asset, by hand or by interpolation."""
    link = _domain(
        create_managed_link,
        state_db,
        db,
        event_key=EventKey(system, game_id, event_id),
        asset_id=body.asset_id,
        segment_id=body.segment_id,
        mode=body.mode,
        media_start_ms=body.media_start_ms,
        media_end_ms=body.media_end_ms,
        timing_error_ms=body.timing_error_ms,
    )
    return JSONResponse(status_code=201 if link["created"] else 200, content=ok(clean(link)))


@router.patch("/api/evidence/links/{link_id}")
def patch_link(link_id: LinkId, body: LinkReview, state_db=Depends(get_state_db)):
    return ok(
        clean(
            _domain(
                review_link,
                state_db,
                link_id,
                review_status=body.review_status,
                reviewer=body.reviewer,
            )
        )
    )


@router.get("/api/snapshots")
def list_snapshots(request: Request, layout=Depends(get_layout)):
    """Exported snapshot versions on disk (the read model the trait layer uses)."""
    versions = describe_snapshots(layout)
    latest = latest_snapshot_version(layout)
    if latest > getattr(request.app.state, "snapshot_version_seen", 0):
        request.app.state.db.refresh()  # a worker may have exported since the views were built
        request.app.state.snapshot_version_seen = latest
    return ok(versions, {"latest_version": latest, "versions": len(versions)})


@router.post("/api/snapshots/export", status_code=202)
def export_snapshots_route(
    request: Request,
    state_db=Depends(get_state_db),
    layout=Depends(get_layout),
    settings=Depends(get_settings_dep),
):
    """Write the next snapshot version of evidence_snapshots and annotation_snapshots."""
    job = enqueue_and_maybe_run(
        settings,
        layout,
        state_db,
        "export_snapshot",
        {},
        idempotency_key=f"snapshot:{now_iso()}",
        wait=True,
    )
    if job.status == "succeeded":
        request.app.state.db.refresh()  # the API's DuckDB views must see the new files
        request.app.state.snapshot_version_seen = latest_snapshot_version(layout)
    return JSONResponse(status_code=202, content=ok(clean(job.as_dict())))
