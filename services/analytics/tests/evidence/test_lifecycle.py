"""Evidence lifecycle (scouting B-08): items for annotations, status propagation, claim flagging."""

import io
import json

import pytest

from app.evidence.annotations import create_annotation, delete_annotation, review_annotation
from app.evidence.evidence_items import get_evidence, list_evidence
from app.evidence.lifecycle import (
    evidence_for_annotation,
    flag_claims_citing,
    mark_asset_evidence,
    supersede_annotation,
)
from app.evidence.links import create_managed_link
from app.evidence.models import EventKey
from app.evidence.read import item_by_ref
from app.evidence.registry import (
    add_permission,
    register_managed_asset,
    soft_delete_asset,
    update_asset_fields,
)
from app.evidence.segments import create_segment
from app.evidence.storage import MediaStore
from app.state.ids import new_ulid
from tests.evidence.conftest import GAME

TATUM = 1628369
WHITE = 1628401


@pytest.fixture
def world(layout, state_db):
    store = MediaStore(layout)
    res = store.write_atomic("incoming/a.mp4", io.BytesIO(b"x" * 10))
    key = store.promote_original(res.path, res.sha256, "mp4")
    asset = register_managed_asset(
        state_db,
        sha256=res.sha256,
        storage_key=key,
        original_filename="a.mp4",
        byte_size=10,
        container="mp4",
    )
    aid = asset["asset_id"]
    update_asset_fields(state_db, aid, duration_ms=400_000)
    add_permission(
        state_db,
        asset_id=aid,
        source="user_upload",
        allowed_operations=["view"],
        permission_status="known",
    )
    seg = create_segment(
        state_db,
        asset_id=aid,
        media_start_ms=0,
        media_end_ms=99_000,
        classification="live",
        origin="manual",
    )
    return aid, seg


def _ann(db, seg, **over):
    body = dict(
        segment_id=seg["segment_id"],
        media_start_ms=10_000,
        media_end_ms=16_000,
        action="closeout",
        outcome="late",
        sampling_method="complete_event_set",
        visibility="full",
        subject_player_id=TATUM,
        subject_identity_status="verified",
        participants=[{"role": "shooter", "player_id": WHITE, "identity_status": "asserted"}],
        event_key=EventKey("pbp_v3", GAME, 7),
        created_by="aaron",
    )
    body.update(over)
    return create_annotation(db, **body)


def test_annotation_owns_a_reviewed_observation_item_that_follows_its_state(state_db, world):
    _, seg = world
    ann = _ann(state_db, seg)
    item = evidence_for_annotation(state_db, ann["annotation_id"])
    assert (
        item["kind"] == "annotation"
        and item["ref_table"] == "annotations"
        and item["ref_id"] == ann["annotation_id"]
    )
    assert (
        item["evidence_class"] == "reviewed_observation"
        and item["review_status"] == "unreviewed"
        and item["status"] == "active"
    )
    assert item["player_ids"] == [TATUM, WHITE] and item["game_id"] == GAME
    assert (
        "closeout" in item["summary"]
        and "late" in item["summary"]
        and "verified" in item["summary"]
    )
    review_annotation(state_db, ann["annotation_id"], review_status="reviewed_ok", reviewer="coach")
    assert evidence_for_annotation(state_db, ann["annotation_id"])["review_status"] == "reviewed_ok"
    delete_annotation(state_db, ann["annotation_id"], changed_by="aaron", reason="dup")
    assert evidence_for_annotation(state_db, ann["annotation_id"])["status"] == "deleted"
    rows, total = list_evidence(state_db, kind="annotation", status="active")
    assert total == 0


def _claim_citing(db, evidence_id: str) -> str:
    report_id, claim_id = new_ulid(), new_ulid()
    db.execute(
        """INSERT INTO reports (report_id, namespace, title, season, season_type, sections_json, numbers_json, generated_by,
               rendered_markdown, created_at, updated_at) VALUES (?, ?, 'r', '2024-25', 'Regular Season', '[]', '{}', 'test', '', 't', 't')""",
        [report_id, db.namespace],
    )
    db.execute(
        """INSERT INTO report_claims (claim_id, report_id, namespace, order_index, claim_text, claim_type, original_type, player_ids_json,
               time_scope_json, evidence_ids_json, numeric_refs_json, limitations_json, counterevidence_ids_json, validation_status,
               validation_notes_json, created_at) VALUES (?, ?, ?, 0, 'c', 'observation', 'observation', '[]', '{}', ?, '[]', '[]', '[]', 'valid', '[]', 't')""",
        [claim_id, report_id, db.namespace, json.dumps([evidence_id])],
    )
    return claim_id


def test_superseding_marks_item_and_flags_citing_claims(state_db, world):
    _, seg = world
    old = _ann(state_db, seg)
    new = _ann(state_db, seg, outcome="blown_by")
    old_item = evidence_for_annotation(state_db, old["annotation_id"])
    claim_id = _claim_citing(state_db, old_item["evidence_id"])
    result = supersede_annotation(
        state_db, old["annotation_id"], new["annotation_id"], changed_by="coach"
    )
    assert (
        result["annotation"]["superseded_by"] == new["annotation_id"]
        and result["annotation"]["revision"] == 2
    )
    refreshed = get_evidence(state_db, old_item["evidence_id"])
    assert refreshed["status"] == "superseded"
    assert (
        refreshed["superseded_by"]
        == evidence_for_annotation(state_db, new["annotation_id"])["evidence_id"]
    )
    assert result["claims_flagged"] == 1
    notes = json.loads(
        state_db.scalar(
            "SELECT validation_notes_json FROM report_claims WHERE claim_id = ?", [claim_id]
        )
    )
    assert any("superseded" in n for n in notes)
    # flagging is idempotent per (claim, evidence, status)
    assert flag_claims_citing(state_db, old_item["evidence_id"], "superseded") == 0
    with pytest.raises(KeyError):
        supersede_annotation(
            state_db, old["annotation_id"], "01HZZZZZZZZZZZZZZZZZZZZZZZ", changed_by="coach"
        )


def test_soft_deleting_an_asset_marks_its_link_evidence(events_db, state_db, world):
    aid, seg = world
    link = create_managed_link(
        state_db,
        events_db,
        event_key=EventKey("pbp_v3", GAME, 7),
        asset_id=aid,
        segment_id=seg["segment_id"],
        mode="manual",
        media_start_ms=1_000,
        media_end_ms=5_000,
    )
    item = item_by_ref(state_db, "event_video_links", link["link_id"])
    assert item["status"] == "active"
    soft_delete_asset(state_db, aid)
    assert mark_asset_evidence(state_db, aid, "deleted") == 1
    assert get_evidence(state_db, item["evidence_id"])["status"] == "deleted"
