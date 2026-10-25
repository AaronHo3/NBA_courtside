from __future__ import annotations

import json
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Path, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from app.api.deps import get_layout, get_settings_dep, get_state_db
from app.api.envelope import clean, ok
from app.evidence.lifecycle import mark_asset_evidence
from app.evidence.playback import range_response
from app.evidence.registry import (
    asset_allows,
    count_assets,
    derivatives_for_asset,
    get_asset,
    latest_derivative,
    list_assets,
    now_iso,
    permissions_for_asset,
    soft_delete_asset,
)
from app.evidence.storage import MediaStore
from app.evidence.uploads import UploadRejectedError, parse_operations, store_upload
from app.jobs import queue as q
from app.jobs.inline import enqueue_and_maybe_run

router = APIRouter(prefix="/api/media", tags=["media"])
AssetId = Annotated[str, Path(pattern=r"^[0-9A-HJKMNP-TV-Z]{26}$")]
PUBLIC_FIELDS = (
    "asset_id",
    "kind",
    "sha256",
    "storage_key",
    "original_filename",
    "byte_size",
    "container",
    "video_codec",
    "audio_codec",
    "duration_ms",
    "width",
    "height",
    "frame_rate_num",
    "frame_rate_den",
    "time_base_num",
    "time_base_den",
    "variable_frame_rate",
    "processing_version",
    "status",
    "availability",
    "created_at",
    "updated_at",
)


def _public(asset: dict) -> dict:
    return {k: asset.get(k) for k in PUBLIC_FIELDS}


def _latest_probe_job(state_db, asset_id: str):
    rows = state_db.query(
        "SELECT * FROM processing_jobs WHERE namespace = ? AND kind = 'probe_media' AND payload_json LIKE ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
        [state_db.namespace, f'%"{asset_id}"%'],
    )
    return q.get_job(state_db, rows[0]["job_id"]).as_dict() if rows else None


@router.post("/uploads")
async def upload(
    request: Request,
    file: Annotated[UploadFile, File()],
    permission_source: Annotated[str, Form(min_length=1, max_length=80)] = "unknown",
    authorization_ref: Annotated[str | None, Form(max_length=400)] = None,
    allowed_operations: Annotated[str | None, Form(max_length=200)] = None,
    notes: Annotated[str | None, Form(max_length=2000)] = None,
    settings=Depends(get_settings_dep),
    layout=Depends(get_layout),
    state_db=Depends(get_state_db),
):
    declared = request.headers.get("content-length")
    try:
        ops = parse_operations(allowed_operations)
        result = store_upload(
            settings=settings,
            layout=layout,
            state_db=state_db,
            stream=file.file,
            filename=file.filename,
            declared_size=int(declared) if declared and declared.isdigit() else None,
            permission_source=permission_source,
            authorization_ref=authorization_ref,
            allowed_operations=ops,
            notes=notes,
        )
    except UploadRejectedError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    body = ok(
        clean(
            {
                "asset": _public(result.asset),
                "permissions": permissions_for_asset(state_db, result.asset["asset_id"]),
                "job": result.job.as_dict() if result.job else None,
            }
        ),
        {"created": result.created},
    )
    return JSONResponse(status_code=201 if result.created else 200, content=body)


@router.get("")
def list_media(
    status: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    state_db=Depends(get_state_db),
):
    rows = [
        a
        for a in list_assets(state_db, kind="managed_original", limit=limit)
        if status is None or a["status"] == status
    ]
    return ok(
        clean([_public(a) for a in rows]),
        {"total": count_assets(state_db, kind="managed_original"), "limit": limit},
    )


@router.get("/{asset_id}")
def media_detail(asset_id: AssetId, state_db=Depends(get_state_db)):
    asset = get_asset(state_db, asset_id)
    if asset is None or asset.get("deleted_at"):
        raise HTTPException(404, f"asset {asset_id} not found")
    return ok(
        clean(
            {
                "asset": _public(asset),
                "permissions": permissions_for_asset(state_db, asset_id),
                "job": _latest_probe_job(state_db, asset_id),
                "derivatives": derivatives_for_asset(state_db, asset_id),
            }
        )
    )


def _live_asset(state_db, asset_id: str) -> dict:
    asset = get_asset(state_db, asset_id)
    if asset is None or asset.get("deleted_at"):
        raise HTTPException(404, f"asset {asset_id} not found")
    return asset


@router.api_route("/{asset_id}/playback", methods=["GET", "HEAD"])
def playback(
    asset_id: AssetId, request: Request, state_db=Depends(get_state_db), layout=Depends(get_layout)
):
    """Browser playback of the managed derivative; Range requests honoured; never the original or a provider stream."""
    _live_asset(state_db, asset_id)
    if not asset_allows(state_db, asset_id, "view", "playback_derivative"):
        raise HTTPException(403, "this asset's recorded permissions do not include in-app playback")
    der = latest_derivative(state_db, asset_id, "playback_mp4")
    if der is None:
        raise HTTPException(
            404, "playback derivative not ready (the make_playback job has not completed)"
        )
    path = MediaStore(layout).resolve(der["storage_key"])
    if not path.exists():
        raise HTTPException(404, "playback file is missing on disk; re-run make_playback")
    return range_response(
        path, request.headers.get("range"), "video/mp4", head=request.method == "HEAD"
    )


def _thumb_derivative(state_db, asset_id: str) -> dict:
    _live_asset(state_db, asset_id)
    if not asset_allows(state_db, asset_id, "view", "thumbnail"):
        raise HTTPException(403, "this asset's recorded permissions do not include thumbnails")
    der = latest_derivative(state_db, asset_id, "thumbnail_sheet")
    if der is None:
        raise HTTPException(404, "thumbnails not ready")
    return der


@router.get("/{asset_id}/thumbs")
def thumbnail_index(asset_id: AssetId, state_db=Depends(get_state_db), layout=Depends(get_layout)):
    der = _thumb_derivative(state_db, asset_id)
    index = json.loads(MediaStore(layout).resolve(der["storage_key"]).read_text())
    return ok(index, {"processing_version": der["processing_version"]})


@router.get("/{asset_id}/thumbs/{index}")
def thumbnail_frame(
    asset_id: AssetId,
    index: Annotated[int, Path(ge=0, le=100000)],
    state_db=Depends(get_state_db),
    layout=Depends(get_layout),
):
    der = _thumb_derivative(state_db, asset_id)
    store = MediaStore(layout)
    frame = store.resolve(
        store.derived_key(asset_id, der["processing_version"], f"thumbs/t_{index + 1:04d}.jpg")
    )
    if not frame.exists():
        raise HTTPException(404, f"no thumbnail {index}")
    return FileResponse(
        frame, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"}
    )


class PurgeIn(BaseModel):
    dry_run: bool = False
    older_than_days: float | None = Field(default=None, ge=0)


@router.post("/purge", status_code=202)
def purge(
    body: PurgeIn | None = None,
    state_db=Depends(get_state_db),
    layout=Depends(get_layout),
    settings=Depends(get_settings_dep),
):
    """Remove files of soft-deleted assets past the retention window; assets with active evidence are kept."""
    body = body or PurgeIn()
    payload = {"dry_run": body.dry_run}
    if body.older_than_days is not None:
        payload["older_than_days"] = body.older_than_days
    job = enqueue_and_maybe_run(
        settings,
        layout,
        state_db,
        "purge_media",
        payload,
        idempotency_key=f"purge:{now_iso()}:{body.dry_run}",
        wait=True,
    )
    return JSONResponse(status_code=202, content=ok(clean(job.as_dict())))


@router.delete("/{asset_id}")
def delete_media(asset_id: AssetId, state_db=Depends(get_state_db)):
    try:
        soft_delete_asset(state_db, asset_id)
    except KeyError as exc:
        raise HTTPException(404, f"asset {asset_id} not found") from exc
    mark_asset_evidence(state_db, asset_id, "deleted")
    return ok(
        {
            "deleted": asset_id,
            "note": "soft-deleted; files are purged after the retention window unless active evidence references them",
        }
    )


# --- segments, anchors, alignment (B-05) -----------------------------------------------------------


from app.evidence import alignment as al  # noqa: E402
from app.evidence import segments as sg  # noqa: E402


class SegmentIn(BaseModel):
    media_start_ms: int = Field(ge=0)
    media_end_ms: int = Field(ge=0)
    classification: Literal["live", "replay", "unknown", "non_game"] = "unknown"
    view: Literal["broadcast", "baseline", "overhead", "handheld", "unknown"] | None = None
    notes: str | None = Field(default=None, max_length=2000)


class SegmentPatch(BaseModel):
    classification: Literal["live", "replay", "unknown", "non_game"] | None = None
    view: Literal["broadcast", "baseline", "overhead", "handheld", "unknown"] | None = None
    notes: str | None = Field(default=None, max_length=2000)
    review_status: Literal["unreviewed", "reviewed_ok", "reviewed_corrected", "rejected"] | None = (
        None
    )
    reviewer: str | None = Field(default=None, max_length=80)


class AnchorIn(BaseModel):
    media_pts_ms: int = Field(ge=0)
    period: int = Field(ge=1, le=12)
    clock_ms: int = Field(ge=0, le=20 * 60 * 1000)
    method: Literal["manual", "ocr_assisted", "provider_metadata", "cv_shot_release"] = "manual"
    error_ms: int | None = Field(default=None, ge=0)
    segment_id: str | None = Field(default=None, pattern=r"^[0-9A-HJKMNP-TV-Z]{26}$")


class AnchorPatch(BaseModel):
    review_status: Literal["unreviewed", "reviewed_ok", "reviewed_corrected", "rejected"]
    reviewer: str | None = Field(default=None, max_length=80)


def _domain(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except KeyError as exc:
        raise HTTPException(404, f"not found: {exc}") from exc
    except (sg.SegmentError, al.AnchorError) as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/{asset_id}/segments")
def segments(asset_id: AssetId, state_db=Depends(get_state_db)):
    _live_asset(state_db, asset_id)
    return ok(clean(sg.list_segments(state_db, asset_id)))


@router.post("/{asset_id}/segments", status_code=201)
def create_segment(asset_id: AssetId, body: SegmentIn, state_db=Depends(get_state_db)):
    _live_asset(state_db, asset_id)
    seg = _domain(
        sg.create_segment,
        state_db,
        asset_id=asset_id,
        media_start_ms=body.media_start_ms,
        media_end_ms=body.media_end_ms,
        classification=body.classification,
        origin="manual",
        view=body.view,
        notes=body.notes,
    )
    return ok(clean(seg))


@router.patch("/{asset_id}/segments/{segment_id}")
def patch_segment(
    asset_id: AssetId, segment_id: AssetId, body: SegmentPatch, state_db=Depends(get_state_db)
):
    _live_asset(state_db, asset_id)
    seg = _domain(
        sg.update_segment,
        state_db,
        segment_id,
        classification=body.classification,
        view=body.view,
        notes=body.notes,
        review_status=body.review_status,
        reviewer=body.reviewer,
    )
    return ok(clean(seg))


@router.get("/{asset_id}/anchors")
def anchors(asset_id: AssetId, state_db=Depends(get_state_db)):
    _live_asset(state_db, asset_id)
    return ok(clean(al.anchors_for_asset(state_db, asset_id)))


@router.post("/{asset_id}/anchors", status_code=201)
def create_anchor(asset_id: AssetId, body: AnchorIn, state_db=Depends(get_state_db)):
    _live_asset(state_db, asset_id)
    anchor = _domain(
        al.add_anchor,
        state_db,
        asset_id=asset_id,
        media_pts_ms=body.media_pts_ms,
        period=body.period,
        clock_ms=body.clock_ms,
        method=body.method,
        error_ms=body.error_ms,
        segment_id=body.segment_id,
    )
    return ok(clean(anchor))


@router.patch("/{asset_id}/anchors/{anchor_id}")
def patch_anchor(
    asset_id: AssetId, anchor_id: AssetId, body: AnchorPatch, state_db=Depends(get_state_db)
):
    _live_asset(state_db, asset_id)
    return ok(
        clean(
            _domain(
                al.review_anchor,
                state_db,
                anchor_id,
                status=body.review_status,
                reviewer=body.reviewer,
            )
        )
    )


@router.get("/{asset_id}/alignment/place")
def place(
    asset_id: AssetId,
    period: Annotated[int, Query(ge=1, le=12)],
    clock_ms: Annotated[int, Query(ge=0)],
    segment_id: Annotated[str | None, Query(pattern=r"^[0-9A-HJKMNP-TV-Z]{26}$")] = None,
    state_db=Depends(get_state_db),
):
    """Where (period, clock) falls on the asset's timeline, from the live segments' anchors only."""
    _live_asset(state_db, asset_id)
    anchors_ = al.anchors_for_asset(state_db, asset_id)
    segs = [
        s
        for s in sg.list_segments(state_db, asset_id)
        if s["classification"] == "live" and (segment_id is None or s["segment_id"] == segment_id)
    ]
    for seg in segs:
        placed = al.place_event(anchors_, segment=seg, period=period, clock_ms=clock_ms)
        if placed is not None:
            return ok(clean(placed.__dict__), {"segments_tried": len(segs)})
    return ok(
        None,
        {
            "segments_tried": len(segs),
            "reason": "no live segment has anchors bracketing this period and clock; add an anchor",
        },
    )


@router.get("/{asset_id}/alignment/validate")
def validate_alignment(asset_id: AssetId, state_db=Depends(get_state_db)):
    _live_asset(state_db, asset_id)
    return ok(clean(al.validate_asset(state_db, asset_id)))


@router.post("/{asset_id}/jobs/retry", status_code=202)
def retry_processing(
    asset_id: AssetId,
    state_db=Depends(get_state_db),
    layout=Depends(get_layout),
    settings=Depends(get_settings_dep),
):
    """Enqueue a fresh probe (which chains playback and thumbnails when permitted); never reuses a failed job."""
    _live_asset(state_db, asset_id)
    job = enqueue_and_maybe_run(
        settings,
        layout,
        state_db,
        "probe_media",
        {"asset_id": asset_id},
        idempotency_key=f"asset:{asset_id}:probe:retry:{now_iso()}",
    )
    return JSONResponse(status_code=202, content=ok(clean(job.as_dict())))


@router.post("/{asset_id}/jobs/detect-boundaries", status_code=202)
def detect_boundaries(
    asset_id: AssetId,
    state_db=Depends(get_state_db),
    layout=Depends(get_layout),
    settings=Depends(get_settings_dep),
):
    _live_asset(state_db, asset_id)
    if not asset_allows(state_db, asset_id, "thumbnail"):
        raise HTTPException(
            403, "this asset's recorded permissions do not include thumbnail/shot-boundary analysis"
        )
    from app.jobs.handlers.detect_shot_boundaries import MODEL_VERSION

    job = enqueue_and_maybe_run(
        settings,
        layout,
        state_db,
        "detect_shot_boundaries",
        {"asset_id": asset_id},
        idempotency_key=f"asset:{asset_id}:boundaries:{MODEL_VERSION}:{len(sg.list_segments(state_db, asset_id))}",
    )
    return JSONResponse(status_code=202, content=ok(clean(job.as_dict())))
