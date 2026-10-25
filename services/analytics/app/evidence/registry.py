"""SQLite repository for video assets, permissions and event-video links.

Every function takes the namespace's :class:`StateDB`; rows are stamped with its namespace and a
mismatch is refused. Creation functions are idempotent and return the row with ``created``.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from app.evidence.models import EventKey
from app.state.connection import StateDB
from app.state.ids import new_ulid

JSON_COLUMNS = {
    "metadata_json": "metadata",
    "allowed_operations_json": "allowed_operations",
    "player_ids_json": "player_ids",
    "supporting_anchor_ids_json": "supporting_anchor_ids",
    "params_json": "params",
    "participants_json": "participants",
    "event_key_json": "event_key",
    "supporting_timestamps_json": "supporting_timestamps",
}


class EvidenceNamespaceError(RuntimeError):
    """A row would be written for, or read from, a namespace other than the open database's."""


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def check_namespace(db: StateDB, namespace: str | None) -> str:
    ns = namespace or db.namespace
    if ns != db.namespace:
        raise EvidenceNamespaceError(
            f"state database is {db.namespace!r}; refusing namespace {ns!r}"
        )
    return ns


def decode_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    out = dict(row)
    for col, name in JSON_COLUMNS.items():
        if col in out:
            raw = out.pop(col)
            out[name] = json.loads(raw) if raw else None
    return out


def _one(db: StateDB, sql: str, params: list[Any]) -> dict[str, Any] | None:
    rows = db.query(sql, params)
    return decode_row(rows[0]) if rows else None


# --- assets -----------------------------------------------------------------------------------


def get_asset(db: StateDB, asset_id: str) -> dict[str, Any] | None:
    return _one(
        db,
        "SELECT * FROM video_assets WHERE asset_id = ? AND namespace = ?",
        [asset_id, db.namespace],
    )


def upsert_external_asset(
    db: StateDB,
    *,
    provider: str,
    ref_key: str,
    external_url: str,
    metadata: dict[str, Any] | None = None,
    created_by: str | None = None,
    namespace: str | None = None,
) -> dict[str, Any]:
    ns = check_namespace(db, namespace)
    existing = _one(
        db,
        "SELECT * FROM video_assets WHERE namespace = ? AND external_ref_key = ?",
        [ns, ref_key],
    )
    if existing is not None:
        return {**existing, "created": False}
    asset_id = new_ulid()
    stamp = now_iso()
    with db.transaction():
        db.execute(
            """INSERT INTO video_assets (asset_id, namespace, kind, external_provider, external_ref_key,
                   external_url, metadata_json, availability, source, source_ref, created_by, created_at, updated_at)
               VALUES (?, ?, 'external_reference', ?, ?, ?, ?, 'unverified', ?, ?, ?, ?, ?)""",
            [
                asset_id,
                ns,
                provider,
                ref_key,
                external_url,
                json.dumps(metadata) if metadata else None,
                f"adapter:{provider}",
                ref_key,
                created_by or f"adapter:{provider}",
                stamp,
                stamp,
            ],
        )
    return {**get_asset(db, asset_id), "created": True}


def set_asset_availability(
    db: StateDB,
    asset_id: str,
    availability: str,
    checked_at: str | None,
    metadata: dict[str, Any] | None = None,
) -> None:
    current = get_asset(db, asset_id)
    if current is None:
        raise KeyError(asset_id)
    merged = (
        {**(current.get("metadata") or {}), **(metadata or {})}
        if metadata
        else current.get("metadata")
    )
    with db.transaction():
        db.execute(
            """UPDATE video_assets SET availability = ?, availability_checked_at = ?, metadata_json = ?, updated_at = ?
               WHERE asset_id = ? AND namespace = ?""",
            [
                availability,
                checked_at,
                json.dumps(merged) if merged else None,
                now_iso(),
                asset_id,
                db.namespace,
            ],
        )


def list_assets(
    db: StateDB, *, kind: str | None = None, availability: str | None = None, limit: int = 500
) -> list[dict[str, Any]]:
    where, params = ["namespace = ?", "deleted_at IS NULL"], [db.namespace]
    if kind:
        where.append("kind = ?")
        params.append(kind)
    if availability:
        where.append("availability = ?")
        params.append(availability)
    rows = db.query(
        f"SELECT * FROM video_assets WHERE {' AND '.join(where)} ORDER BY created_at LIMIT ?",
        [*params, int(limit)],
    )
    return [decode_row(r) for r in rows]


def count_assets(db: StateDB, *, kind: str | None = None, availability: str | None = None) -> int:
    where, params = ["namespace = ?", "deleted_at IS NULL"], [db.namespace]
    if kind:
        where.append("kind = ?")
        params.append(kind)
    if availability:
        where.append("availability = ?")
        params.append(availability)
    return int(
        db.scalar(f"SELECT COUNT(*) FROM video_assets WHERE {' AND '.join(where)}", params) or 0
    )


# --- permissions --------------------------------------------------------------------------------


def add_permission(
    db: StateDB,
    *,
    asset_id: str,
    source: str,
    allowed_operations: list[str],
    permission_status: str,
    authorization_ref: str | None = None,
    expires_at: str | None = None,
    notes: str | None = None,
    created_by: str | None = None,
) -> dict[str, Any]:
    permission_id = new_ulid()
    stamp = now_iso()
    with db.transaction():
        db.execute(
            """INSERT INTO source_permissions (permission_id, namespace, asset_id, source, authorization_ref,
                   allowed_operations_json, permission_status, expires_at, notes, created_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                permission_id,
                db.namespace,
                asset_id,
                source,
                authorization_ref,
                json.dumps(list(allowed_operations)),
                permission_status,
                expires_at,
                notes,
                created_by or "user",
                stamp,
                stamp,
            ],
        )
    return _one(db, "SELECT * FROM source_permissions WHERE permission_id = ?", [permission_id])


def permissions_for_asset(db: StateDB, asset_id: str) -> list[dict[str, Any]]:
    rows = db.query(
        "SELECT * FROM source_permissions WHERE asset_id = ? AND namespace = ? ORDER BY created_at",
        [asset_id, db.namespace],
    )
    return [decode_row(r) for r in rows]


# --- links ---------------------------------------------------------------------------------------


def ensure_link(
    db: StateDB,
    *,
    event_key: EventKey,
    asset_id: str,
    segment_id: str | None = None,
    alignment_method: str = "none",
    link_status: str = "unverified",
    created_by: str | None = None,
) -> dict[str, Any]:
    existing = _one(
        db,
        """SELECT * FROM event_video_links WHERE namespace = ? AND game_id = ? AND source_event_system = ?
           AND source_event_id = ? AND asset_id = ? AND COALESCE(segment_id, '') = COALESCE(?, '')""",
        [
            db.namespace,
            event_key.game_id,
            event_key.source_event_system,
            event_key.source_event_id,
            asset_id,
            segment_id,
        ],
    )
    if existing is not None:
        return {**existing, "created": False}
    link_id = new_ulid()
    stamp = now_iso()
    with db.transaction():
        db.execute(
            """INSERT INTO event_video_links (link_id, namespace, game_id, source_event_system, source_event_id,
                   asset_id, segment_id, alignment_method, link_status, created_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                link_id,
                db.namespace,
                event_key.game_id,
                event_key.source_event_system,
                event_key.source_event_id,
                asset_id,
                segment_id,
                alignment_method,
                link_status,
                created_by or "adapter",
                stamp,
                stamp,
            ],
        )
    row = _one(db, "SELECT * FROM event_video_links WHERE link_id = ?", [link_id])
    return {**row, "created": True}


def links_for_event(db: StateDB, event_key: EventKey) -> list[dict[str, Any]]:
    rows = db.query(
        """SELECT * FROM event_video_links WHERE namespace = ? AND game_id = ? AND source_event_system = ?
           AND source_event_id = ? ORDER BY created_at""",
        [db.namespace, event_key.game_id, event_key.source_event_system, event_key.source_event_id],
    )
    return [decode_row(r) for r in rows]


def set_link_status(db: StateDB, link_id: str, link_status: str) -> None:
    with db.transaction():
        db.execute(
            "UPDATE event_video_links SET link_status = ?, updated_at = ? WHERE link_id = ? AND namespace = ?",
            [link_status, now_iso(), link_id, db.namespace],
        )


# --- managed originals (B-03) -------------------------------------------------------------------------


def find_asset_by_sha(db: StateDB, sha256: str) -> dict[str, Any] | None:
    return _one(
        db,
        "SELECT * FROM video_assets WHERE namespace = ? AND sha256 = ? AND deleted_at IS NULL",
        [db.namespace, sha256],
    )


def register_managed_asset(
    db: StateDB,
    *,
    sha256: str,
    storage_key: str,
    original_filename: str | None,
    byte_size: int,
    container: str | None,
    created_by: str = "upload",
) -> dict[str, Any]:
    existing = find_asset_by_sha(db, sha256)
    if existing is not None:
        return {**existing, "created": False}
    asset_id = new_ulid()
    stamp = now_iso()
    with db.transaction():
        db.execute(
            """INSERT INTO video_assets (asset_id, namespace, kind, sha256, storage_key, original_filename, byte_size, container,
                   status, availability, source, source_ref, created_by, created_at, updated_at)
               VALUES (?, ?, 'managed_original', ?, ?, ?, ?, ?, 'registered', 'available', 'upload', ?, ?, ?, ?)""",
            [
                asset_id,
                db.namespace,
                sha256,
                storage_key,
                original_filename,
                int(byte_size),
                container,
                sha256,
                created_by,
                stamp,
                stamp,
            ],
        )
    return {**get_asset(db, asset_id), "created": True}


ASSET_UPDATABLE = {
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
    "probe_json",
    "processing_version",
    "status",
}


def update_asset_fields(db: StateDB, asset_id: str, **fields: Any) -> dict[str, Any]:
    bad = set(fields) - ASSET_UPDATABLE
    if bad:
        raise KeyError(f"not updatable: {sorted(bad)}")
    if not fields:
        return get_asset(db, asset_id)
    sets = ", ".join(f"{k} = ?" for k in fields)
    with db.transaction():
        db.execute(
            f"UPDATE video_assets SET {sets}, updated_at = ? WHERE asset_id = ? AND namespace = ?",
            [*fields.values(), now_iso(), asset_id, db.namespace],
        )
    return get_asset(db, asset_id)


def soft_delete_asset(db: StateDB, asset_id: str) -> None:
    with db.transaction():
        cur = db.execute(
            "UPDATE video_assets SET deleted_at = ?, status = 'deleted', updated_at = ? WHERE asset_id = ? AND namespace = ? AND deleted_at IS NULL",
            [now_iso(), now_iso(), asset_id, db.namespace],
        )
        if cur.rowcount == 0:
            raise KeyError(asset_id)


# --- derivatives and permission checks (B-04) ------------------------------------------------------


def asset_allows(db: StateDB, asset_id: str, *operations: str) -> bool:
    """True when some known permission row grants every requested operation. Unknown never grants."""
    for perm in permissions_for_asset(db, asset_id):
        if perm["permission_status"] != "known":
            continue
        if perm.get("expires_at") and perm["expires_at"] < now_iso():
            continue
        if set(operations) <= set(perm.get("allowed_operations") or []):
            return True
    return False


def add_derivative(
    db: StateDB,
    *,
    asset_id: str,
    kind: str,
    storage_key: str,
    processing_version: int,
    params: dict[str, Any],
    byte_size: int | None,
    width: int | None,
    height: int | None,
    duration_ms: int | None,
    sha256: str,
    job_id: str | None,
    created_by: str = "worker",
) -> dict[str, Any]:
    import hashlib

    params_json = json.dumps(params, sort_keys=True, default=str)
    params_hash = hashlib.sha1(params_json.encode()).hexdigest()[:12]
    derivative_id = new_ulid()
    stamp = now_iso()
    db.execute(
        """INSERT INTO video_derivatives (derivative_id, namespace, asset_id, kind, storage_key, processing_version, params_json, params_hash,
               byte_size, width, height, duration_ms, sha256, job_id, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        [
            derivative_id,
            db.namespace,
            asset_id,
            kind,
            storage_key,
            int(processing_version),
            params_json,
            params_hash,
            byte_size,
            width,
            height,
            duration_ms,
            sha256,
            job_id,
            created_by,
            stamp,
            stamp,
        ],
    )
    return _one(db, "SELECT * FROM video_derivatives WHERE derivative_id = ?", [derivative_id])


def derivatives_for_asset(
    db: StateDB, asset_id: str, kind: str | None = None
) -> list[dict[str, Any]]:
    where, params = ["asset_id = ?", "namespace = ?"], [asset_id, db.namespace]
    if kind:
        where.append("kind = ?")
        params.append(kind)
    rows = db.query(
        f"SELECT * FROM video_derivatives WHERE {' AND '.join(where)} ORDER BY processing_version DESC, created_at DESC",
        params,
    )
    return [decode_row(r) for r in rows]


def latest_derivative(
    db: StateDB,
    asset_id: str,
    kind: str,
    *,
    processing_version: int | None = None,
    params_hash: str | None = None,
) -> dict[str, Any] | None:
    for d in derivatives_for_asset(db, asset_id, kind):
        if processing_version is not None and d["processing_version"] != processing_version:
            continue
        if params_hash is not None and d["params_hash"] != params_hash:
            continue
        return d
    return None


def set_link_timing(
    db: StateDB,
    link_id: str,
    *,
    media_start_ms: int | None,
    media_end_ms: int | None,
    alignment_method: str,
    timing_error_ms: int | None,
    anchor_ids: list[str] | None,
) -> dict[str, Any]:
    with db.transaction():
        cur = db.execute(
            """UPDATE event_video_links SET media_start_ms = ?, media_end_ms = ?, alignment_method = ?, timing_error_ms = ?,
                   supporting_anchor_ids_json = ?, updated_at = ? WHERE link_id = ? AND namespace = ?""",
            [
                media_start_ms,
                media_end_ms,
                alignment_method,
                timing_error_ms,
                json.dumps(anchor_ids or []),
                now_iso(),
                link_id,
                db.namespace,
            ],
        )
        if cur.rowcount == 0:
            raise KeyError(link_id)
    return _one(db, "SELECT * FROM event_video_links WHERE link_id = ?", [link_id])
