"""Custom role templates in the namespace's SQLite; built-ins come from code."""

from __future__ import annotations

import json
from dataclasses import asdict

from app.evidence.registry import now_iso
from app.scouting.roles import ROLE_INDEX, RoleTemplate, validate_role
from app.state.connection import StateDB
from app.state.ids import new_ulid


def _row_to_role(row: dict) -> RoleTemplate:
    return RoleTemplate.from_dict(
        {
            "role_id": row["role_id"],
            "version": row["version"],
            "label": row["label"],
            "description": row["description"],
            "components": json.loads(row["components_json"]),
            "filters": json.loads(row["filters_json"]),
            "optional_video_traits": json.loads(row["optional_video_traits_json"]),
            "caveats": json.loads(row["caveats_json"]),
            "cohort_defaults": json.loads(row["cohort_defaults_json"]),
            "is_builtin": False,
        }
    )


def save_custom_role(db: StateDB, role: RoleTemplate, created_by: str = "user") -> RoleTemplate:
    validate_role(role)
    role_id = new_ulid()
    d = role.to_dict()
    stamp = now_iso()
    with db.transaction():
        db.execute(
            """INSERT INTO role_templates (role_id, namespace, version, label, description, components_json, filters_json,
                   optional_video_traits_json, caveats_json, cohort_defaults_json, is_builtin, created_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)""",
            [
                role_id,
                db.namespace,
                1,
                role.label,
                role.description,
                json.dumps(d["components"]),
                json.dumps([{k: f[k] for k in ("column", "op", "value")} for f in d["filters"]]),
                json.dumps(d["optional_video_traits"]),
                json.dumps(d["caveats"]),
                json.dumps(asdict(role.cohort_defaults)),
                created_by,
                stamp,
                stamp,
            ],
        )
    return load_role(db, role_id)


def load_role(db: StateDB, role_id: str) -> RoleTemplate | None:
    if role_id in ROLE_INDEX:
        return ROLE_INDEX[role_id]
    rows = db.query(
        "SELECT * FROM role_templates WHERE role_id = ? AND namespace = ?", [role_id, db.namespace]
    )
    return _row_to_role(rows[0]) if rows else None


def list_custom_roles(db: StateDB) -> list[RoleTemplate]:
    rows = db.query(
        "SELECT * FROM role_templates WHERE namespace = ? ORDER BY created_at", [db.namespace]
    )
    return [_row_to_role(r) for r in rows]
