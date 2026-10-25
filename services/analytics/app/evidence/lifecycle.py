"""Evidence lifecycle (DATA_MODEL §8, DEC-13): referents change, items follow, citations get flagged.

Nothing here deletes a row. A superseded or deleted referent marks its evidence item, and every
report claim that cites the item receives a validation note so the report renders the badge and the
claim validator refuses new citations."""

from __future__ import annotations

import json
from typing import Any

from app.evidence import annotations as an
from app.evidence.evidence_items import get_evidence, update_evidence_item
from app.evidence.read import item_by_ref
from app.evidence.registry import now_iso
from app.state.connection import StateDB

__all__ = [
    "evidence_for_annotation",
    "flag_claims_citing",
    "mark_asset_evidence",
    "supersede_annotation",
]


def evidence_for_annotation(db: StateDB, annotation_id: str) -> dict[str, Any] | None:
    return item_by_ref(db, "annotations", annotation_id)


def flag_claims_citing(db: StateDB, evidence_id: str, status: str) -> int:
    """Append a note to every claim citing the item (as evidence or counterevidence); once per status."""
    rows = db.query(
        """SELECT claim_id, validation_notes_json FROM report_claims
           WHERE namespace = ?
             AND (EXISTS (SELECT 1 FROM json_each(evidence_ids_json) WHERE value = ?)
                  OR EXISTS (SELECT 1 FROM json_each(counterevidence_ids_json) WHERE value = ?))""",
        [db.namespace, evidence_id, evidence_id],
    )
    note = f"evidence {evidence_id} is {status} (marked {now_iso()}); the citation stays visible but no new claim may cite it"
    marker = f"evidence {evidence_id} is {status}"
    flagged = 0
    with db.transaction():
        for row in rows:
            notes = json.loads(row["validation_notes_json"] or "[]")
            if any(n.startswith(marker) for n in notes):
                continue
            db.execute(
                "UPDATE report_claims SET validation_notes_json = ? WHERE claim_id = ? AND namespace = ?",
                [json.dumps([*notes, note]), row["claim_id"], db.namespace],
            )
            flagged += 1
    return flagged


def supersede_annotation(
    db: StateDB, old_id: str, new_id: str, *, changed_by: str, reason: str | None = None
) -> dict[str, Any]:
    """Replace one annotation by another: a revision on the old row, its item superseded, claims flagged."""
    if an.get_annotation(db, new_id) is None:
        raise an.AnnotationNotFoundError(f"annotation {new_id} not found")
    if old_id == new_id:
        raise an.AnnotationError("an annotation cannot supersede itself")
    head = an.set_superseded_by(
        db, old_id, new_id, changed_by=changed_by, reason=reason or "superseded"
    )
    old_item = evidence_for_annotation(db, old_id)
    new_item = evidence_for_annotation(db, new_id)
    flagged = 0
    if old_item is not None:
        update_evidence_item(
            db,
            old_item["evidence_id"],
            status="superseded",
            superseded_by=new_item["evidence_id"] if new_item else None,
        )
        flagged = flag_claims_citing(db, old_item["evidence_id"], "superseded")
    return {
        "annotation": head,
        "evidence": get_evidence(db, old_item["evidence_id"]) if old_item else None,
        "claims_flagged": flagged,
    }


def mark_asset_evidence(db: StateDB, asset_id: str, status: str) -> int:
    """Set the status of every item that cites a link to this asset (asset soft-deleted or unavailable)."""
    rows = db.query(
        """SELECT e.evidence_id FROM evidence_items e JOIN event_video_links l ON l.link_id = e.ref_id AND l.namespace = e.namespace
           WHERE e.namespace = ? AND e.ref_table = 'event_video_links' AND l.asset_id = ? AND e.status != ?""",
        [db.namespace, asset_id, status],
    )
    for row in rows:
        update_evidence_item(db, row["evidence_id"], status=status)
        if status in ("deleted", "superseded", "stale"):
            flag_claims_citing(db, row["evidence_id"], status)
    return len(rows)
