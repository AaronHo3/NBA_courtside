"""Shortlists: candidate lists saved with the ranking context that produced them (DATA_MODEL §9)."""

from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import asdict
from typing import Any

from app.evidence.evidence_items import EvidenceNamespaceError
from app.evidence.models import DEMO_ID_FLOOR, REAL_NAMESPACE
from app.evidence.registry import now_iso
from app.scouting.compute import Cohort
from app.state.connection import StateDB
from app.state.ids import new_ulid

__all__ = [
    "EvidenceNamespaceError",
    "add_entries",
    "create_shortlist",
    "delete_shortlist",
    "get_shortlist",
    "list_shortlists",
    "remove_entry",
    "update_entry",
    "update_shortlist",
]


def _check_ids(db: StateDB, player_ids: Sequence[int]) -> None:
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


def _json(value: Any) -> str | None:
    return None if value is None else json.dumps(value, default=str)


def _load(value: str | None) -> Any:
    return json.loads(value) if value else None


def _entry_row(r: dict) -> dict[str, Any]:
    return {
        "player_id": int(r["player_id"]),
        "rank": int(r["rank"]),
        "score": r["score"],
        "eligible": None if r["eligible"] is None else bool(r["eligible"]),
        "missing": _load(r["missing_json"]) or [],
        "contributions": _load(r["contributions_json"]) or [],
        "added_by": r["added_by"],
        "pinned": bool(r["pinned"]),
        "note": r["note"],
        "created_at": r["created_at"],
        "updated_at": r["updated_at"],
    }


def _header(r: dict) -> dict[str, Any]:
    return {
        "shortlist_id": r["shortlist_id"],
        "namespace": r["namespace"],
        "label": r["label"],
        "role_id": r["role_id"],
        "role_version": r["role_version"],
        "season": r["season"],
        "season_type": r["season_type"],
        "cohort": _load(r["cohort_json"]),
        "ranking_meta": _load(r["ranking_meta_json"]),
        "notes": r["notes"],
        "created_at": r["created_at"],
        "updated_at": r["updated_at"],
    }


def get_shortlist(db: StateDB, shortlist_id: str) -> dict[str, Any] | None:
    rows = db.query(
        "SELECT * FROM shortlists WHERE shortlist_id = ? AND namespace = ?",
        [shortlist_id, db.namespace],
    )
    if not rows:
        return None
    entries = db.query(
        "SELECT * FROM shortlist_entries WHERE shortlist_id = ? ORDER BY pinned DESC, rank, player_id",
        [shortlist_id],
    )
    return {**_header(rows[0]), "entries": [_entry_row(e) for e in entries]}


def list_shortlists(db: StateDB) -> list[dict[str, Any]]:
    rows = db.query(
        """SELECT s.*, (SELECT COUNT(*) FROM shortlist_entries e WHERE e.shortlist_id = s.shortlist_id) AS entry_count
           FROM shortlists s WHERE s.namespace = ? ORDER BY s.created_at, s.shortlist_id""",
        [db.namespace],
    )
    return [{**_header(r), "entry_count": int(r["entry_count"])} for r in rows]


def _next_rank(db: StateDB, shortlist_id: str) -> int:
    return (
        int(
            db.scalar(
                "SELECT COALESCE(MAX(rank), 0) FROM shortlist_entries WHERE shortlist_id = ?",
                [shortlist_id],
            )
            or 0
        )
        + 1
    )


def _insert_entries(
    db: StateDB,
    shortlist_id: str,
    candidates: Sequence[dict],
    player_ids: Sequence[int],
    added_by: str,
) -> None:
    stamp = now_iso()
    existing = {
        int(r["player_id"])
        for r in db.query(
            "SELECT player_id FROM shortlist_entries WHERE shortlist_id = ?", [shortlist_id]
        )
    }
    rank = _next_rank(db, shortlist_id)
    for c in candidates:
        pid = int(c["player_id"])
        if pid in existing:
            continue
        db.execute(
            """INSERT INTO shortlist_entries (shortlist_id, namespace, player_id, rank, score, eligible, missing_json, contributions_json,
                   added_by, pinned, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)""",
            [
                shortlist_id,
                db.namespace,
                pid,
                rank,
                c.get("score"),
                None if c.get("eligible") is None else int(bool(c["eligible"])),
                _json(c.get("missing")),
                _json(c.get("contributions")),
                added_by,
                stamp,
                stamp,
            ],
        )
        existing.add(pid)
        rank += 1
    for pid in player_ids:
        if int(pid) in existing:
            continue
        db.execute(
            """INSERT INTO shortlist_entries (shortlist_id, namespace, player_id, rank, score, eligible, missing_json, contributions_json,
                   added_by, pinned, note, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, 0, NULL, ?, ?)""",
            [shortlist_id, db.namespace, int(pid), rank, added_by, stamp, stamp],
        )
        existing.add(int(pid))
        rank += 1


def create_shortlist(
    db: StateDB,
    *,
    label: str,
    season: str,
    season_type: str,
    role_id: str | None = None,
    role_version: int | None = None,
    cohort: Cohort | None = None,
    ranking_meta: dict | None = None,
    candidates: Sequence[dict] = (),
    player_ids: Sequence[int] = (),
    notes: str | None = None,
    created_by: str = "user",
) -> dict[str, Any]:
    _check_ids(db, [int(c["player_id"]) for c in candidates] + [int(p) for p in player_ids])
    shortlist_id = new_ulid()
    stamp = now_iso()
    with db.transaction():
        db.execute(
            """INSERT INTO shortlists (shortlist_id, namespace, label, role_id, role_version, season, season_type, cohort_json,
                   ranking_meta_json, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                shortlist_id,
                db.namespace,
                label,
                role_id,
                role_version,
                season,
                season_type,
                _json(asdict(cohort)) if cohort else None,
                _json(ranking_meta),
                notes,
                created_by,
                stamp,
                stamp,
            ],
        )
        _insert_entries(
            db, shortlist_id, candidates, player_ids, "candidates" if candidates else "manual"
        )
        if candidates and player_ids:
            pass  # manual ids were appended by _insert_entries after the candidates with the same added_by; fine for a mixed create
    return get_shortlist(db, shortlist_id)


def _require(db: StateDB, shortlist_id: str) -> None:
    if (
        db.scalar(
            "SELECT 1 FROM shortlists WHERE shortlist_id = ? AND namespace = ?",
            [shortlist_id, db.namespace],
        )
        is None
    ):
        raise KeyError(shortlist_id)


def add_entries(
    db: StateDB,
    shortlist_id: str,
    *,
    player_ids: Sequence[int] = (),
    candidates: Sequence[dict] = (),
    added_by: str = "manual",
) -> dict[str, Any]:
    _require(db, shortlist_id)
    _check_ids(db, [int(p) for p in player_ids] + [int(c["player_id"]) for c in candidates])
    with db.transaction():
        _insert_entries(db, shortlist_id, candidates, player_ids, added_by)
        db.execute(
            "UPDATE shortlists SET updated_at = ? WHERE shortlist_id = ?", [now_iso(), shortlist_id]
        )
    return get_shortlist(db, shortlist_id)


def update_entry(
    db: StateDB,
    shortlist_id: str,
    player_id: int,
    *,
    pinned: bool | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    _require(db, shortlist_id)
    sets, params = ["updated_at = ?"], [now_iso()]
    if pinned is not None:
        sets.append("pinned = ?")
        params.append(int(pinned))
    if note is not None:
        sets.append("note = ?")
        params.append(note)
    with db.transaction():
        cur = db.execute(
            f"UPDATE shortlist_entries SET {', '.join(sets)} WHERE shortlist_id = ? AND player_id = ?",
            [*params, shortlist_id, int(player_id)],
        )
        if cur.rowcount == 0:
            raise KeyError(player_id)
    return get_shortlist(db, shortlist_id)


def remove_entry(db: StateDB, shortlist_id: str, player_id: int) -> dict[str, Any]:
    _require(db, shortlist_id)
    with db.transaction():
        db.execute(
            "DELETE FROM shortlist_entries WHERE shortlist_id = ? AND player_id = ?",
            [shortlist_id, int(player_id)],
        )
        db.execute(
            "UPDATE shortlists SET updated_at = ? WHERE shortlist_id = ?", [now_iso(), shortlist_id]
        )
    return get_shortlist(db, shortlist_id)


def update_shortlist(
    db: StateDB, shortlist_id: str, *, label: str | None = None, notes: str | None = None
) -> dict[str, Any]:
    _require(db, shortlist_id)
    sets, params = ["updated_at = ?"], [now_iso()]
    if label is not None:
        sets.append("label = ?")
        params.append(label)
    if notes is not None:
        sets.append("notes = ?")
        params.append(notes)
    with db.transaction():
        db.execute(
            f"UPDATE shortlists SET {', '.join(sets)} WHERE shortlist_id = ? AND namespace = ?",
            [*params, shortlist_id, db.namespace],
        )
    return get_shortlist(db, shortlist_id)


def delete_shortlist(db: StateDB, shortlist_id: str) -> None:
    _require(db, shortlist_id)
    with db.transaction():
        db.execute("DELETE FROM shortlist_entries WHERE shortlist_id = ?", [shortlist_id])
        db.execute(
            "DELETE FROM shortlists WHERE shortlist_id = ? AND namespace = ?",
            [shortlist_id, db.namespace],
        )
