"""Video segments (DATA_MODEL §5): bounded pieces of an asset's presentation timeline, classified and reviewed."""

from __future__ import annotations

from typing import Any

from app.evidence.registry import decode_row, get_asset, now_iso
from app.state.connection import StateDB
from app.state.ids import new_ulid

CLASSIFICATIONS = ("live", "replay", "unknown", "non_game")
VIEWS = ("broadcast", "baseline", "overhead", "handheld", "unknown")
ORIGINS = ("manual", "shot_boundary_model", "provider_clip", "import")
REVIEW_STATUSES = ("unreviewed", "reviewed_ok", "reviewed_corrected", "rejected")


class SegmentError(ValueError):
    pass


def get_segment(db: StateDB, segment_id: str) -> dict[str, Any] | None:
    rows = db.query(
        "SELECT * FROM video_segments WHERE segment_id = ? AND namespace = ?",
        [segment_id, db.namespace],
    )
    return decode_row(rows[0]) if rows else None


def list_segments(db: StateDB, asset_id: str) -> list[dict[str, Any]]:
    rows = db.query(
        "SELECT * FROM video_segments WHERE asset_id = ? AND namespace = ? ORDER BY media_start_ms, media_end_ms, segment_id",
        [asset_id, db.namespace],
    )
    return [decode_row(r) for r in rows]


def create_segment(
    db: StateDB,
    *,
    asset_id: str,
    media_start_ms: int,
    media_end_ms: int,
    classification: str,
    origin: str,
    view: str | None = None,
    model_version: str | None = None,
    notes: str | None = None,
    created_by: str = "user",
) -> dict[str, Any]:
    asset = get_asset(db, asset_id)
    if asset is None:
        raise KeyError(asset_id)
    if classification not in CLASSIFICATIONS:
        raise SegmentError(f"classification must be one of {CLASSIFICATIONS}")
    if origin not in ORIGINS:
        raise SegmentError(f"origin must be one of {ORIGINS}")
    if view is not None and view not in VIEWS:
        raise SegmentError(f"view must be one of {VIEWS}")
    if media_start_ms < 0 or media_end_ms <= media_start_ms:
        raise SegmentError(
            "media_end_ms must be greater than media_start_ms (and both non-negative)"
        )
    duration = asset.get("duration_ms")
    if duration is not None and media_end_ms > duration:
        raise SegmentError(
            f"segment ends at {media_end_ms} ms, beyond the asset duration of {duration} ms"
        )
    segment_id = new_ulid()
    stamp = now_iso()
    with db.transaction():
        db.execute(
            """INSERT INTO video_segments (segment_id, namespace, asset_id, media_start_ms, media_end_ms, classification, view, origin,
                   model_version, review_status, notes, created_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unreviewed', ?, ?, ?, ?)""",
            [
                segment_id,
                db.namespace,
                asset_id,
                int(media_start_ms),
                int(media_end_ms),
                classification,
                view,
                origin,
                model_version,
                notes,
                created_by,
                stamp,
                stamp,
            ],
        )
    return get_segment(db, segment_id)


def update_segment(
    db: StateDB,
    segment_id: str,
    *,
    classification: str | None = None,
    view: str | None = None,
    notes: str | None = None,
    review_status: str | None = None,
    reviewer: str | None = None,
) -> dict[str, Any]:
    if get_segment(db, segment_id) is None:
        raise KeyError(segment_id)
    sets, params = ["updated_at = ?"], [now_iso()]
    if classification is not None:
        if classification not in CLASSIFICATIONS:
            raise SegmentError(f"classification must be one of {CLASSIFICATIONS}")
        sets.append("classification = ?")
        params.append(classification)
    if view is not None:
        if view not in VIEWS:
            raise SegmentError(f"view must be one of {VIEWS}")
        sets.append("view = ?")
        params.append(view)
    if notes is not None:
        sets.append("notes = ?")
        params.append(notes)
    if review_status is not None:
        if review_status not in REVIEW_STATUSES:
            raise SegmentError(f"review_status must be one of {REVIEW_STATUSES}")
        sets += ["review_status = ?", "reviewed_by = ?", "reviewed_at = ?"]
        params += [review_status, reviewer, now_iso()]
    with db.transaction():
        db.execute(
            f"UPDATE video_segments SET {', '.join(sets)} WHERE segment_id = ? AND namespace = ?",
            [*params, segment_id, db.namespace],
        )
    return get_segment(db, segment_id)
