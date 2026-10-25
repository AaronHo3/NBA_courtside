"""Evidence items: stable ids, one per referent, lifecycle, listing, namespace rules."""

import pytest

from app.evidence.evidence_items import (
    EvidenceNamespaceError,
    ensure_evidence_item,
    get_evidence,
    list_evidence,
    mark_evidence_status,
)

GAME = "0022400061"


def _item(db, ref_id="L1", player_ids=(1628369,), **kw):
    return ensure_evidence_item(
        db,
        kind="external_reference",
        ref_table="event_video_links",
        ref_id=ref_id,
        evidence_class="reference",
        summary="Tatum 27' 3PT Pullup Jump Shot; external clip reference",
        player_ids=list(player_ids),
        game_id=GAME,
        season="2024-25",
        season_type="Regular Season",
        **kw,
    )


def test_one_item_per_referent_with_stable_ulid(state_db):
    a = _item(state_db)
    b = _item(state_db)
    assert a["evidence_id"] == b["evidence_id"] and len(a["evidence_id"]) == 26
    assert a["status"] == "active" and a["review_status"] == "unreviewed"
    assert a["evidence_class"] == "reference" and a["player_ids"] == [1628369]


def test_listing_filters_and_pagination(state_db):
    for i in range(5):
        _item(state_db, ref_id=f"L{i}", player_ids=(1628369 if i < 3 else 1628384,))
    rows, total = list_evidence(state_db, player_id=1628369, limit=2, offset=0)
    assert total == 3 and len(rows) == 2
    rows2, _ = list_evidence(state_db, player_id=1628369, limit=2, offset=2)
    assert len(rows2) == 1
    assert list_evidence(state_db, game_id="0000000000")[1] == 0
    assert list_evidence(state_db, kind="annotation")[1] == 0


def test_status_transitions_and_supersession(state_db):
    a = _item(state_db, ref_id="A")
    b = _item(state_db, ref_id="B")
    mark_evidence_status(state_db, a["evidence_id"], "superseded", superseded_by=b["evidence_id"])
    got = get_evidence(state_db, a["evidence_id"])
    assert got["status"] == "superseded" and got["superseded_by"] == b["evidence_id"]
    with pytest.raises(ValueError):
        mark_evidence_status(state_db, a["evidence_id"], "bogus")


def test_demo_player_ids_are_refused_in_the_real_namespace(state_db):
    with pytest.raises(EvidenceNamespaceError, match="demo"):
        _item(state_db, ref_id="D", player_ids=(9_000_001,))
