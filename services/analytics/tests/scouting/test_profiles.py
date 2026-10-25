"""Profiles: reproducible derived views that keep the four evidence classes apart, with snapshots."""

from datetime import UTC, datetime

import pytest

from app.data.manifest import Manifest
from app.scouting.compute import Cohort
from app.scouting.profiles import build_profile, latest_snapshot, list_snapshots
from app.state.connection import open_state_db

from .conftest import DETAIL, RS


@pytest.fixture
def state(demo_layout):
    db = open_state_db(demo_layout)
    yield db
    db.close()


@pytest.fixture(scope="module")
def pid(demo_db) -> int:
    return int(
        demo_db.query(
            "SELECT player_id FROM player_season WHERE season = ? ORDER BY min DESC LIMIT 1",
            [DETAIL],
        )["player_id"].iloc[0]
    )


def test_profile_shape_and_class_separation(demo_db, demo_layout, state, pid):
    p = build_profile(demo_db, state, demo_layout, pid, DETAIL, RS)
    assert p["player"]["player_id"] == pid and p["time_window"] == {
        "season": DETAIL,
        "season_type": RS,
    }
    assert set(p["traits"]) == {
        "statistical",
        "reviewed_observation",
        "model_estimate",
        "interpretation",
    }
    assert p["traits"]["statistical"] and all(
        t["evidence_class"] == "statistical" for t in p["traits"]["statistical"]
    )
    assert p["traits"]["reviewed_observation"] and all(
        t["evidence_class"] == "reviewed_observation" for t in p["traits"]["reviewed_observation"]
    )
    assert all(
        t["unsupported_reason"] for t in p["traits"]["reviewed_observation"]
    )  # no annotations in demo
    assert p["traits"]["model_estimate"] == [] and p["traits"]["interpretation"] == []
    assert (
        "roster" in p["measurements"]
        and "combine" in p["measurements"]
        and p["measurements"]["roster"]["source"]
    )
    assert isinstance(p["stints"], list) and p["stints"]
    assert isinstance(p["evidence_ids"], list)
    assert p["snapshot"]["data_fingerprint"] and p["snapshot"]["trait_registry_version"] == 1


def test_profile_is_reproducible(demo_db, demo_layout, state, pid):
    a = build_profile(demo_db, state, demo_layout, pid, DETAIL, RS)
    b = build_profile(demo_db, state, demo_layout, pid, DETAIL, RS)
    assert a["traits"] == b["traits"] and a["measurements"] == b["measurements"]
    assert (
        a["snapshot"]["snapshot_id"] == b["snapshot"]["snapshot_id"]
    )  # same inputs -> same stored snapshot
    assert len(list_snapshots(state, pid, DETAIL, RS)) == 1


def test_cohort_is_part_of_the_snapshot_identity(demo_db, demo_layout, state, pid):
    a = build_profile(
        demo_db, state, demo_layout, pid, DETAIL, RS, cohort=Cohort(min_gp=5, min_minutes=50)
    )
    b = build_profile(
        demo_db, state, demo_layout, pid, DETAIL, RS, cohort=Cohort(min_gp=5, min_minutes=60)
    )
    assert a["snapshot"]["snapshot_id"] != b["snapshot"]["snapshot_id"]


def test_data_change_marks_the_old_snapshot_stale(demo_db, demo_layout, state, pid):
    first = build_profile(demo_db, state, demo_layout, pid, DETAIL, RS)
    manifest = Manifest.load(demo_layout)
    entry = manifest.find("player_season", DETAIL, RS)
    manifest.upsert(
        entry.model_copy(update={"fetched_at": datetime.now(UTC), "rows": entry.rows + 1})
    ).save(demo_layout)
    try:
        second = build_profile(demo_db, state, demo_layout, pid, DETAIL, RS)
        assert second["snapshot"]["snapshot_id"] != first["snapshot"]["snapshot_id"]
        assert second["snapshot"]["superseded"] == [first["snapshot"]["snapshot_id"]]
        latest = latest_snapshot(state, pid, DETAIL, RS)
        assert (
            latest["snapshot_id"] == second["snapshot"]["snapshot_id"] and latest["stale"] is False
        )
        old = [
            s
            for s in list_snapshots(state, pid, DETAIL, RS)
            if s["snapshot_id"] == first["snapshot"]["snapshot_id"]
        ][0]
        assert old["stale"] is True
    finally:
        manifest.save(demo_layout)  # restore for other tests


def test_unknown_player_returns_none(demo_db, demo_layout, state):
    assert build_profile(demo_db, state, demo_layout, 1, DETAIL, RS) is None
