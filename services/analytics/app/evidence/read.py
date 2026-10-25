"""Read-side composition of evidence items with their referents (links, assets, permissions)."""

from __future__ import annotations

from typing import Any

from app.evidence.evidence_items import get_evidence
from app.evidence.models import EventKey
from app.evidence.registry import decode_row, get_asset, links_for_event, permissions_for_asset
from app.evidence.segments import get_segment
from app.state.connection import StateDB

ASSET_PUBLIC_FIELDS = (
    "asset_id",
    "kind",
    "external_provider",
    "external_url",
    "availability",
    "availability_checked_at",
    "metadata",
    "status",
    "created_at",
    "updated_at",
)


def _asset_public(asset: dict[str, Any] | None) -> dict[str, Any] | None:
    if asset is None:
        return None
    return {k: asset.get(k) for k in ASSET_PUBLIC_FIELDS}


def item_by_ref(db: StateDB, ref_table: str, ref_id: str) -> dict[str, Any] | None:
    rows = db.query(
        "SELECT * FROM evidence_items WHERE namespace = ? AND ref_table = ? AND ref_id = ?",
        [db.namespace, ref_table, ref_id],
    )
    return decode_row(rows[0]) if rows else None


def get_link(db: StateDB, link_id: str) -> dict[str, Any] | None:
    rows = db.query(
        "SELECT * FROM event_video_links WHERE link_id = ? AND namespace = ?",
        [link_id, db.namespace],
    )
    return decode_row(rows[0]) if rows else None


def evidence_for_event(db: StateDB, key: EventKey) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for link in links_for_event(db, key):
        item = item_by_ref(db, "event_video_links", link["link_id"])
        if item is None:
            continue
        segment = get_segment(db, link["segment_id"]) if link.get("segment_id") else None
        out.append(
            {
                **item,
                "link": link,
                "segment": segment,
                "reference": _asset_public(get_asset(db, link["asset_id"])),
            }
        )
    return out


def evidence_detail(db: StateDB, evidence_id: str) -> dict[str, Any] | None:
    item = get_evidence(db, evidence_id)
    if item is None:
        return None
    referent: dict[str, Any] | None = None
    if item["ref_table"] == "event_video_links":
        link = get_link(db, item["ref_id"])
        if link is not None:
            asset = get_asset(db, link["asset_id"])
            referent = {
                "link": link,
                "asset": _asset_public(asset),
                "permissions": permissions_for_asset(db, link["asset_id"]) if asset else [],
            }
    return {"item": item, "referent": referent}


def count_for_game(db: StateDB, game_id: str) -> int:
    return int(
        db.scalar(
            "SELECT COUNT(*) FROM evidence_items WHERE namespace = ? AND game_id = ?",
            [db.namespace, game_id],
        )
        or 0
    )
