"""Shortlists: saved candidate lists with their ranking context frozen, namespace-bound."""

import pytest

from app.data.paths import DataLayout
from app.evidence.evidence_items import EvidenceNamespaceError
from app.scouting.candidates import CandidateQuery, search_candidates
from app.scouting.compute import Cohort
from app.scouting.roles import ROLE_INDEX
from app.scouting.shortlists import (
    add_entries,
    create_shortlist,
    delete_shortlist,
    get_shortlist,
    list_shortlists,
    remove_entry,
    update_entry,
    update_shortlist,
)
from app.state.connection import open_state_db

from .conftest import DETAIL, RS

LOOSE = Cohort(min_gp=5, min_minutes=100)


@pytest.fixture
def state(tmp_path):
    db = open_state_db(DataLayout(tmp_path, "demo"))
    yield db
    db.close()


@pytest.fixture(scope="module")
def result(demo_db, demo_layout):
    return search_candidates(
        demo_db,
        CandidateQuery(
            role=ROLE_INDEX["rebounding_interior_player"],
            season=DETAIL,
            season_type=RS,
            cohort=LOOSE,
            layout=demo_layout,
            limit=5,
        ),
    )


def test_create_from_candidates_freezes_ranking_context(state, result):
    sl = create_shortlist(
        state,
        label="Bigs",
        season=DETAIL,
        season_type=RS,
        role_id="rebounding_interior_player",
        role_version=1,
        cohort=LOOSE,
        ranking_meta=result.meta,
        candidates=result.rows,
    )
    assert len(sl["shortlist_id"]) == 26 and sl["label"] == "Bigs" and sl["namespace"] == "demo"
    assert sl["ranking_meta"]["data_fingerprint"] == result.meta["data_fingerprint"]
    assert sl["ranking_meta"]["template"]["version"] == 1 and sl["cohort"] == {
        "population": "all",
        "min_gp": 5,
        "min_minutes": 100.0,
        "position": None,
    }
    assert [e["rank"] for e in sl["entries"]] == [1, 2, 3, 4, 5]
    first = sl["entries"][0]
    assert (
        first["player_id"] == result.rows[0]["player_id"]
        and first["score"] == result.rows[0]["score"]
    )
    assert (
        first["eligible"] is True
        and first["contributions"]
        and first["added_by"] == "candidates"
        and first["pinned"] is False
    )


def test_entries_are_unique_per_player_and_manual_adds_have_no_score(state, result):
    sl = create_shortlist(
        state, label="x", season=DETAIL, season_type=RS, candidates=result.rows[:2]
    )
    before = len(sl["entries"])
    again = add_entries(
        state,
        sl["shortlist_id"],
        player_ids=[result.rows[0]["player_id"], 9_000_777],
        added_by="compare",
    )
    assert len(again["entries"]) == before + 1
    manual = [e for e in again["entries"] if e["player_id"] == 9_000_777][0]
    assert (
        manual["score"] is None
        and manual["eligible"] is None
        and manual["added_by"] == "compare"
        and manual["rank"] == before + 1
    )


def test_pin_note_update_remove_and_delete(state, result):
    sl = create_shortlist(
        state, label="x", season=DETAIL, season_type=RS, candidates=result.rows[:3]
    )
    sid = sl["shortlist_id"]
    pid = result.rows[1]["player_id"]
    updated = update_entry(state, sid, pid, pinned=True, note="watch closeouts")
    e = [x for x in updated["entries"] if x["player_id"] == pid][0]
    assert e["pinned"] is True and e["note"] == "watch closeouts"
    renamed = update_shortlist(state, sid, label="Bigs v2", notes="second pass")
    assert renamed["label"] == "Bigs v2" and renamed["notes"] == "second pass"
    fewer = remove_entry(state, sid, pid)
    assert pid not in [x["player_id"] for x in fewer["entries"]] and len(fewer["entries"]) == 2
    assert [x["shortlist_id"] for x in list_shortlists(state)] == [sid]
    delete_shortlist(state, sid)
    assert get_shortlist(state, sid) is None and list_shortlists(state) == []
    assert state.scalar("SELECT COUNT(*) FROM shortlist_entries WHERE shortlist_id = ?", [sid]) == 0


def test_listing_is_ordered_and_summarised(state, result):
    a = create_shortlist(
        state, label="a", season=DETAIL, season_type=RS, candidates=result.rows[:1]
    )
    b = create_shortlist(
        state, label="b", season=DETAIL, season_type=RS, candidates=result.rows[:3]
    )
    rows = list_shortlists(state)
    assert [r["shortlist_id"] for r in rows] == [a["shortlist_id"], b["shortlist_id"]]
    assert rows[1]["entry_count"] == 3 and "entries" not in rows[1]


def test_namespace_guard_on_player_ids(state):
    with pytest.raises(EvidenceNamespaceError):
        create_shortlist(
            state, label="x", season=DETAIL, season_type=RS, player_ids=[1628369]
        )  # provider id in demo


def test_unknown_shortlist(state):
    assert get_shortlist(state, "01HZZZZZZZZZZZZZZZZZZZZZZZ") is None
    with pytest.raises(KeyError):
        add_entries(state, "01HZZZZZZZZZZZZZZZZZZZZZZZ", player_ids=[9_000_001])
