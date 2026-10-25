"""link_events: one external reference asset, link and evidence item per field-goal event."""

import pytest

from app.data.paths import DataLayout
from app.evidence.evidence_items import list_evidence
from app.evidence.link_events import EvidenceNamespaceError, link_game_events
from app.state.connection import open_state_db

GAME = "0022400061"


def test_links_every_field_goal_event_once(state_db, events_db):
    first = link_game_events(state_db, events_db, GAME)
    assert first.events == first.assets_created == first.links_created == first.evidence_created > 0
    second = link_game_events(state_db, events_db, GAME)
    assert second.assets_created == second.links_created == second.evidence_created == 0
    assert state_db.scalar("SELECT COUNT(*) FROM video_assets") == first.events
    rows, total = list_evidence(state_db, game_id=GAME)
    assert total == first.events and rows[0]["kind"] == "external_reference"
    assert rows[0]["evidence_class"] == "reference" and rows[0]["summary"]
    tatum = [r for r in rows if r["player_ids"] == [1628369]]
    assert tatum and all(r["season"] == "2024-25" for r in rows)


def test_unknown_game_links_nothing(state_db, events_db):
    report = link_game_events(state_db, events_db, "0000000000")
    assert report.events == 0 and report.links_created == 0


def test_demo_namespace_is_refused(tmp_path, events_db):
    demo = open_state_db(DataLayout(tmp_path / "data", "demo"))
    try:
        with pytest.raises(EvidenceNamespaceError):
            link_game_events(demo, events_db, GAME)
    finally:
        demo.close()
