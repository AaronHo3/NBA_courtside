"""Evidence items: the single citation target for reports and the copilot (DATA_MODEL §8)."""

from __future__ import annotations

import json
from typing import Any

from app.evidence.models import DEMO_ID_FLOOR, REAL_NAMESPACE
from app.evidence.registry import EvidenceNamespaceError, decode_row, now_iso
from app.state.connection import StateDB
from app.state.ids import new_ulid

STATUSES = ("active", "stale", "superseded", "deleted")

__all__ = [
    "EvidenceNamespaceError",
    "check_player_ids",
    "ensure_evidence_item",
    "get_evidence",
    "list_evidence",
    "mark_evidence_status",
    "update_evidence_item",
]


def check_player_ids(db: StateDB, player_ids: list[int]) -> None:
    """Refuse demo ids in the real namespace and provider ids elsewhere (DATA_MODEL §13)."""
    real = db.namespace == REAL_NAMESPACE
    for pid in player_ids:
        if real and pid >= DEMO_ID_FLOOR:
            raise EvidenceNamespaceError(
                f"player id {pid} is a demo id; refusing in the real namespace"
            )
        if not real and pid < DEMO_ID_FLOOR:
            raise EvidenceNamespaceError(
                f"player id {pid} is a provider id; refusing in namespace {db.namespace}"
            )


def get_evidence(db: StateDB, evidence_id: str) -> dict[str, Any] | None:
    rows = db.query(
        "SELECT * FROM evidence_items WHERE evidence_id = ? AND namespace = ?",
        [evidence_id, db.namespace],
    )
    return decode_row(rows[0]) if rows else None


def ensure_evidence_item(
    db: StateDB,
    *,
    kind: str,
    ref_table: str,
    ref_id: str,
    evidence_class: str,
    summary: str,
    player_ids: list[int],
    game_id: str | None = None,
    season: str | None = None,
    season_type: str | None = None,
    review_status: str = "unreviewed",
    created_by: str | None = None,
) -> dict[str, Any]:
    check_player_ids(db, player_ids)
    rows = db.query(
        "SELECT * FROM evidence_items WHERE namespace = ? AND ref_table = ? AND ref_id = ?",
        [db.namespace, ref_table, ref_id],
    )
    if rows:
        return {**decode_row(rows[0]), "created": False}
    evidence_id = new_ulid()
    stamp = now_iso()
    with db.transaction():
        db.execute(
            """INSERT INTO evidence_items (evidence_id, namespace, kind, ref_table, ref_id, player_ids_json, game_id,
                   season, season_type, summary, evidence_class, review_status, status, created_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)""",
            [
                evidence_id,
                db.namespace,
                kind,
                ref_table,
                ref_id,
                json.dumps([int(p) for p in player_ids]),
                game_id,
                season,
                season_type,
                summary,
                evidence_class,
                review_status,
                created_by or "system",
                stamp,
                stamp,
            ],
        )
    return {**get_evidence(db, evidence_id), "created": True}


def mark_evidence_status(
    db: StateDB, evidence_id: str, status: str, superseded_by: str | None = None
) -> None:
    if status not in STATUSES:
        raise ValueError(f"status must be one of {STATUSES}, got {status!r}")
    with db.transaction():
        db.execute(
            "UPDATE evidence_items SET status = ?, superseded_by = ?, updated_at = ? WHERE evidence_id = ? AND namespace = ?",
            [status, superseded_by, now_iso(), evidence_id, db.namespace],
        )


def list_evidence(
    db: StateDB,
    *,
    player_id: int | None = None,
    game_id: str | None = None,
    kind: str | None = None,
    status: str | None = None,
    review_status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    where, params = ["namespace = ?"], [db.namespace]
    if player_id is not None:
        where.append(
            "EXISTS (SELECT 1 FROM json_each(evidence_items.player_ids_json) WHERE value = ?)"
        )
        params.append(int(player_id))
    for col, val in (
        ("game_id", game_id),
        ("kind", kind),
        ("status", status),
        ("review_status", review_status),
    ):
        if val is not None:
            where.append(f"{col} = ?")
            params.append(val)
    clause = " AND ".join(where)
    total = int(db.scalar(f"SELECT COUNT(*) FROM evidence_items WHERE {clause}", params) or 0)
    rows = db.query(
        f"SELECT * FROM evidence_items WHERE {clause} ORDER BY created_at, evidence_id LIMIT ? OFFSET ?",
        [*params, int(limit), int(offset)],
    )
    return [decode_row(r) for r in rows], total


UPDATABLE = (
    "summary",
    "review_status",
    "status",
    "superseded_by",
    "player_ids",
    "game_id",
    "season",
    "season_type",
)


def update_evidence_item(db: StateDB, evidence_id: str, **fields: Any) -> dict[str, Any]:
    """Refresh an item from its referent; only the listed fields change."""
    unknown = set(fields) - set(UPDATABLE)
    if unknown:
        raise ValueError(f"evidence item fields not updatable: {sorted(unknown)}")
    if "status" in fields and fields["status"] not in STATUSES:
        raise ValueError(f"status must be one of {STATUSES}, got {fields['status']!r}")
    sets, params = ["updated_at = ?"], [now_iso()]
    for key, value in fields.items():
        if key == "player_ids":
            check_player_ids(db, list(value))
            sets.append("player_ids_json = ?")
            params.append(json.dumps([int(p) for p in value]))
        else:
            sets.append(f"{key} = ?")
            params.append(value)
    with db.transaction():
        cur = db.execute(
            f"UPDATE evidence_items SET {', '.join(sets)} WHERE evidence_id = ? AND namespace = ?",
            [*params, evidence_id, db.namespace],
        )
        if cur.rowcount == 0:
            raise KeyError(evidence_id)
    return get_evidence(db, evidence_id)
