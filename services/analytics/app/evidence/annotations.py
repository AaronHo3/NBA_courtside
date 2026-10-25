"""Annotations (DATA_MODEL §6, VIDEO_PIPELINE §7): one observable action per row, every save a revision.

Free-text ``notes`` are untrusted: stored verbatim, returned under ``notes.content`` with an explicit
trust marker, and never handed to the copilot as instructions (COPILOT, D-05)."""

from __future__ import annotations

import json
from dataclasses import asdict, is_dataclass
from typing import Any

from app.evidence.annotation_evidence import sync_annotation_evidence
from app.evidence.evidence_items import check_player_ids
from app.evidence.models import EventKey
from app.evidence.registry import decode_row, now_iso
from app.evidence.segments import REVIEW_STATUSES, get_segment
from app.evidence.vocabulary import VOCAB_VERSION, VocabularyError, validate
from app.state.connection import StateDB
from app.state.ids import new_ulid

IDENTITY_STATUSES = ("verified", "asserted", "unknown")
VISIBILITIES = ("full", "partial", "obstructed", "off_frame")
SAMPLING_METHODS = (
    "complete_event_set",
    "systematic_sample",
    "random_sample",
    "curated",
    "provider_selected",
)
# fields that a revision diff tracks (everything a labeler or reviewer can change)
CONTENT_FIELDS = (
    "segment_id",
    "media_start_ms",
    "media_end_ms",
    "subject_player_id",
    "subject_identity_status",
    "action",
    "vocab_version",
    "outcome",
    "participants",
    "visibility",
    "label_source",
    "confidence_raw",
    "sampling_method",
    "event_key",
    "game_id",
    "notes",
    "supporting_timestamps",
    "review_status",
    "reviewed_by",
    "superseded_by",
    "deleted_at",
)
EDITABLE = (
    "media_start_ms",
    "media_end_ms",
    "subject_player_id",
    "subject_identity_status",
    "action",
    "outcome",
    "participants",
    "visibility",
    "label_source",
    "confidence_raw",
    "sampling_method",
    "event_key",
    "notes",
    "supporting_timestamps",
)


class AnnotationError(ValueError):
    pass


class AnnotationNotFoundError(AnnotationError, KeyError):
    pass


def _event_key_dict(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    if is_dataclass(value):
        value = asdict(value)
    if not isinstance(value, dict) or set(value) != {
        "source_event_system",
        "game_id",
        "source_event_id",
    }:
        raise AnnotationError(
            "event_key must have source_event_system, game_id and source_event_id"
        )
    return {
        "source_event_system": str(value["source_event_system"]),
        "game_id": str(value["game_id"]),
        "source_event_id": int(value["source_event_id"]),
    }


def _validate(db: StateDB, s: dict[str, Any]) -> None:
    seg = get_segment(db, s["segment_id"])
    if seg is None:
        raise AnnotationNotFoundError(f"segment {s['segment_id']} not found")
    if (
        s["media_start_ms"] < seg["media_start_ms"]
        or s["media_end_ms"] > seg["media_end_ms"]
        or s["media_end_ms"] <= s["media_start_ms"]
    ):
        raise AnnotationError(
            f"window {s['media_start_ms']}–{s['media_end_ms']} ms must lie inside the segment "
            f"({seg['media_start_ms']}–{seg['media_end_ms']} ms) with end after start"
        )
    try:
        validate(s["action"], s.get("outcome"))
    except VocabularyError as exc:
        raise AnnotationError(str(exc)) from exc
    if s["subject_identity_status"] not in IDENTITY_STATUSES:
        raise AnnotationError(f"subject_identity_status must be one of {IDENTITY_STATUSES}")
    if (s.get("subject_player_id") is None) != (s["subject_identity_status"] == "unknown"):
        raise AnnotationError(
            "subject identity: a subject_player_id needs identity_status verified or asserted, and vice versa"
        )
    if not s.get("sampling_method") or s["sampling_method"] not in SAMPLING_METHODS:
        raise AnnotationError(f"sampling_method is mandatory and must be one of {SAMPLING_METHODS}")
    if s["visibility"] not in VISIBILITIES:
        raise AnnotationError(f"visibility must be one of {VISIBILITIES}")
    ids = [s["subject_player_id"]] if s.get("subject_player_id") is not None else []
    for p in s.get("participants") or []:
        if (
            not isinstance(p, dict)
            or not p.get("role")
            or p.get("identity_status") not in IDENTITY_STATUSES
        ):
            raise AnnotationError(
                "participants must be objects with role, player_id and identity_status"
            )
        if (p.get("player_id") is None) != (p["identity_status"] == "unknown"):
            raise AnnotationError(
                "participants: a player_id needs identity_status verified or asserted, and vice versa"
            )
        if p.get("player_id") is not None:
            ids.append(int(p["player_id"]))
    check_player_ids(db, ids)
    if s.get("supporting_timestamps") is not None and not all(
        isinstance(t, int) and t >= 0 for t in s["supporting_timestamps"]
    ):
        raise AnnotationError("supporting_timestamps must be non-negative integers (ms)")
    if s.get("confidence_raw") is not None and not (0.0 <= float(s["confidence_raw"]) <= 1.0):
        raise AnnotationError(
            "confidence_raw must be within [0, 1]; it is a raw score, not a probability"
        )


def _row(db: StateDB, annotation_id: str) -> dict[str, Any] | None:
    rows = db.query(
        "SELECT * FROM annotations WHERE annotation_id = ? AND namespace = ?",
        [annotation_id, db.namespace],
    )
    return decode_row(rows[0]) if rows else None


def _view(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    notes = row.get("notes")
    return {
        **row,
        "notes": {"content": notes, "trust": "untrusted_free_text"} if notes is not None else None,
    }


def _snapshot(row: dict[str, Any]) -> dict[str, Any]:
    return {k: row.get(k) for k in CONTENT_FIELDS}


def _diff(before: dict[str, Any] | None, after: dict[str, Any]) -> dict[str, Any]:
    prev = before or {}
    return {
        k: {"from": prev.get(k), "to": after.get(k)}
        for k in CONTENT_FIELDS
        if prev.get(k) != after.get(k)
    }


def _write(
    db: StateDB,
    annotation_id: str,
    state: dict[str, Any],
    *,
    revision: int,
    before: dict | None,
    changed_by: str | None,
    reason: str | None,
    created: bool,
) -> dict[str, Any]:
    stamp = now_iso()
    cols = {
        **{
            k: state.get(k)
            for k in CONTENT_FIELDS
            if k not in ("participants", "event_key", "supporting_timestamps")
        },
        "participants_json": json.dumps(state["participants"])
        if state.get("participants") is not None
        else None,
        "event_key_json": json.dumps(state["event_key"])
        if state.get("event_key") is not None
        else None,
        "supporting_timestamps_json": json.dumps(state["supporting_timestamps"])
        if state.get("supporting_timestamps") is not None
        else None,
        "revision": revision,
        "updated_at": stamp,
    }
    with db.transaction():
        if created:
            cols.update(
                {
                    "annotation_id": annotation_id,
                    "namespace": db.namespace,
                    "created_by": changed_by,
                    "created_at": stamp,
                }
            )
            db.execute(
                f"INSERT INTO annotations ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
                list(cols.values()),
            )
        else:
            sets = ", ".join(f"{k} = ?" for k in cols)
            db.execute(
                f"UPDATE annotations SET {sets} WHERE annotation_id = ? AND namespace = ?",
                [*cols.values(), annotation_id, db.namespace],
            )
        db.execute(
            "INSERT INTO annotation_revisions (annotation_id, namespace, revision, snapshot_json, diff_json, changed_by, changed_at, change_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                annotation_id,
                db.namespace,
                revision,
                json.dumps(_snapshot(state)),
                json.dumps(_diff(before, state)),
                changed_by,
                stamp,
                reason,
            ],
        )
        db.execute("DELETE FROM annotations_fts WHERE annotation_id = ?", [annotation_id])
        if state.get("notes") and not state.get("deleted_at"):
            db.execute(
                "INSERT INTO annotations_fts (annotation_id, namespace, notes) VALUES (?, ?, ?)",
                [annotation_id, db.namespace, state["notes"]],
            )
        sync_annotation_evidence(db, _row(db, annotation_id), created_by=changed_by)
    return _view(_row(db, annotation_id))


def create_annotation(
    db: StateDB,
    *,
    segment_id: str,
    media_start_ms: int,
    media_end_ms: int,
    action: str,
    sampling_method: str | None,
    visibility: str,
    subject_player_id: int | None = None,
    subject_identity_status: str = "unknown",
    outcome: str | None = None,
    participants: list[dict[str, Any]] | None = None,
    label_source: str = "human",
    confidence_raw: float | None = None,
    event_key: EventKey | dict[str, Any] | None = None,
    notes: str | None = None,
    supporting_timestamps: list[int] | None = None,
    created_by: str = "user",
    change_reason: str | None = None,
) -> dict[str, Any]:
    key = _event_key_dict(event_key)
    state = {
        "segment_id": segment_id,
        "media_start_ms": int(media_start_ms),
        "media_end_ms": int(media_end_ms),
        "subject_player_id": subject_player_id,
        "subject_identity_status": subject_identity_status,
        "action": action,
        "vocab_version": VOCAB_VERSION,
        "outcome": outcome,
        "participants": participants,
        "visibility": visibility,
        "label_source": label_source,
        "confidence_raw": confidence_raw,
        "sampling_method": sampling_method,
        "event_key": key,
        "game_id": key["game_id"] if key else None,
        "notes": notes,
        "supporting_timestamps": supporting_timestamps,
        "review_status": "unreviewed",
        "reviewed_by": None,
        "superseded_by": None,
        "deleted_at": None,
    }
    _validate(db, state)
    return _write(
        db,
        new_ulid(),
        state,
        revision=1,
        before=None,
        changed_by=created_by,
        reason=change_reason,
        created=True,
    )


def _head_or_raise(db: StateDB, annotation_id: str) -> dict[str, Any]:
    row = _row(db, annotation_id)
    if row is None:
        raise AnnotationNotFoundError(f"annotation {annotation_id} not found")
    return row


def update_annotation(
    db: StateDB,
    annotation_id: str,
    *,
    changed_by: str,
    change_reason: str | None = None,
    **fields: Any,
) -> dict[str, Any]:
    unknown = set(fields) - set(EDITABLE)
    if unknown:
        raise AnnotationError(f"fields not editable: {sorted(unknown)}")
    head = _head_or_raise(db, annotation_id)
    if head.get("deleted_at"):
        raise AnnotationError("this annotation is deleted; create a new one instead")
    state = {**_snapshot(head), **fields}
    if "event_key" in fields:
        state["event_key"] = _event_key_dict(fields["event_key"])
        state["game_id"] = state["event_key"]["game_id"] if state["event_key"] else None
    state["vocab_version"] = VOCAB_VERSION
    _validate(db, state)
    return _write(
        db,
        annotation_id,
        state,
        revision=head["revision"] + 1,
        before=_snapshot(head),
        changed_by=changed_by,
        reason=change_reason,
        created=False,
    )


def review_annotation(
    db: StateDB, annotation_id: str, *, review_status: str, reviewer: str | None
) -> dict[str, Any]:
    if review_status not in REVIEW_STATUSES:
        raise AnnotationError(f"review_status must be one of {REVIEW_STATUSES}")
    head = _head_or_raise(db, annotation_id)
    state = {**_snapshot(head), "review_status": review_status, "reviewed_by": reviewer}
    out = _write(
        db,
        annotation_id,
        state,
        revision=head["revision"] + 1,
        before=_snapshot(head),
        changed_by=reviewer,
        reason="review",
        created=False,
    )
    with db.transaction():
        db.execute(
            "UPDATE annotations SET reviewed_at = ? WHERE annotation_id = ? AND namespace = ?",
            [now_iso(), annotation_id, db.namespace],
        )
    return _view(_row(db, annotation_id)) if out else out


def delete_annotation(
    db: StateDB, annotation_id: str, *, changed_by: str, reason: str | None = None
) -> dict[str, Any]:
    head = _head_or_raise(db, annotation_id)
    if head.get("deleted_at"):
        return _view(head)
    state = {**_snapshot(head), "deleted_at": now_iso()}
    return _write(
        db,
        annotation_id,
        state,
        revision=head["revision"] + 1,
        before=_snapshot(head),
        changed_by=changed_by,
        reason=reason or "deleted",
        created=False,
    )


def get_annotation(db: StateDB, annotation_id: str) -> dict[str, Any] | None:
    return _view(_row(db, annotation_id))


def revisions(db: StateDB, annotation_id: str) -> list[dict[str, Any]]:
    rows = db.query(
        "SELECT * FROM annotation_revisions WHERE annotation_id = ? AND namespace = ? ORDER BY revision",
        [annotation_id, db.namespace],
    )
    return [
        {
            **{k: v for k, v in r.items() if k not in ("snapshot_json", "diff_json")},
            "snapshot": json.loads(r["snapshot_json"]),
            "diff": json.loads(r["diff_json"]),
        }
        for r in rows
    ]


def _fts_query(text: str) -> str:
    tokens = [t for t in text.replace('"', " ").split() if t]
    return " ".join(f'"{t}"' for t in tokens) or '""'


def list_annotations(
    db: StateDB,
    *,
    segment_id: str | None = None,
    asset_id: str | None = None,
    player_id: int | None = None,
    action: str | None = None,
    review_status: str | None = None,
    game_id: str | None = None,
    q: str | None = None,
    include_deleted: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    where, params = ["a.namespace = ?"], [db.namespace]
    if not include_deleted:
        where.append("a.deleted_at IS NULL")
    for col, val in (
        ("a.segment_id", segment_id),
        ("a.action", action),
        ("a.review_status", review_status),
        ("a.game_id", game_id),
    ):
        if val is not None:
            where.append(f"{col} = ?")
            params.append(val)
    if asset_id is not None:
        where.append(
            "a.segment_id IN (SELECT segment_id FROM video_segments WHERE asset_id = ? AND namespace = ?)"
        )
        params += [asset_id, db.namespace]
    if player_id is not None:
        where.append(
            "(a.subject_player_id = ? OR EXISTS (SELECT 1 FROM json_each(COALESCE(a.participants_json, '[]')) WHERE json_extract(value, '$.player_id') = ?))"
        )
        params += [int(player_id), int(player_id)]
    if q:
        where.append(
            "a.annotation_id IN (SELECT annotation_id FROM annotations_fts WHERE annotations_fts MATCH ? AND namespace = ?)"
        )
        params += [_fts_query(q), db.namespace]
    clause = " AND ".join(where)
    total = int(db.scalar(f"SELECT COUNT(*) FROM annotations a WHERE {clause}", params) or 0)
    order = (
        "a.media_start_ms, a.created_at, a.annotation_id"
        if segment_id
        else "a.created_at, a.annotation_id"
    )
    rows = db.query(
        f"SELECT a.* FROM annotations a WHERE {clause} ORDER BY {order} LIMIT ? OFFSET ?",
        [*params, int(limit), int(offset)],
    )
    return [_view(decode_row(r)) for r in rows], total


def set_superseded_by(
    db: StateDB, annotation_id: str, new_id: str, *, changed_by: str, reason: str | None = None
) -> dict[str, Any]:
    """Mark the head row as replaced by ``new_id`` (a revision, like every other change)."""
    head = _head_or_raise(db, annotation_id)
    state = {**_snapshot(head), "superseded_by": new_id}
    return _write(
        db,
        annotation_id,
        state,
        revision=head["revision"] + 1,
        before=_snapshot(head),
        changed_by=changed_by,
        reason=reason or "superseded",
        created=False,
    )
