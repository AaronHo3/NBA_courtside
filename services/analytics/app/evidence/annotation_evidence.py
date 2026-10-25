"""Keep one ``evidence_items`` row per annotation in step with the annotation head row (DATA_MODEL §8)."""

from __future__ import annotations

from typing import Any

from app.evidence.evidence_items import ensure_evidence_item, update_evidence_item
from app.evidence.read import item_by_ref
from app.state.connection import StateDB


def annotation_summary(ann: dict[str, Any]) -> str:
    parts = [ann["action"]]
    if ann.get("outcome"):
        parts.append(f"outcome: {ann['outcome']}")
    parts.append(f"subject {ann['subject_identity_status']}")
    parts.append(f"visibility {ann['visibility']}")
    parts.append(
        f"{ann['label_source']} label"
        if ann.get("label_source") == "human"
        else f"label {ann.get('label_source')}"
    )
    parts.append(f"sampling {ann['sampling_method']}")
    return "; ".join(parts)


def annotation_player_ids(ann: dict[str, Any]) -> list[int]:
    ids: list[int] = []
    if ann.get("subject_player_id") is not None:
        ids.append(int(ann["subject_player_id"]))
    for p in ann.get("participants") or []:
        if p.get("player_id") is not None and int(p["player_id"]) not in ids:
            ids.append(int(p["player_id"]))
    return ids


def annotation_status(ann: dict[str, Any]) -> str:
    if ann.get("deleted_at"):
        return "deleted"
    if ann.get("superseded_by"):
        return "superseded"
    return "active"


def sync_annotation_evidence(
    db: StateDB, ann: dict[str, Any], *, created_by: str | None = None
) -> dict[str, Any]:
    """Create the item on first save; afterwards refresh summary, players, review and status."""
    existing = item_by_ref(db, "annotations", ann["annotation_id"])
    fields = dict(
        summary=annotation_summary(ann),
        player_ids=annotation_player_ids(ann),
        review_status=ann["review_status"],
        status=annotation_status(ann),
        game_id=ann.get("game_id"),
    )
    if existing is None:
        item = ensure_evidence_item(
            db,
            kind="annotation",
            ref_table="annotations",
            ref_id=ann["annotation_id"],
            evidence_class="reviewed_observation",
            summary=fields["summary"],
            player_ids=fields["player_ids"],
            game_id=fields["game_id"],
            review_status=fields["review_status"],
            created_by=created_by or ann.get("created_by"),
        )
        if fields["status"] != "active":
            item = update_evidence_item(db, item["evidence_id"], status=fields["status"])
        return item
    return update_evidence_item(db, existing["evidence_id"], **fields)
