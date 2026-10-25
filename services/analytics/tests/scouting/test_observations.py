"""Reviewed-observation traits: rates need reviewed opportunities, curated clips are examples only."""

import pandas as pd
import pytest

from app.data.db import Database
from app.data.parquet_io import write_family
from app.data.paths import DataLayout
from app.scouting.observations import reviewed_observation_traits
from app.scouting.traits import TRAIT_INDEX

RS = "Regular Season"
S = "2024-25"
P = 1628369


def _ann(
    i,
    action,
    outcome,
    *,
    sampling="complete_event_set",
    review="reviewed_ok",
    identity="verified",
    game="0022400001",
    source="human",
):
    return {
        "annotation_id": f"A{i:03d}",
        "segment_id": f"S{i:03d}",
        "asset_id": "X",
        "game_id": game,
        "season": S,
        "season_type": RS,
        "media_start_ms": 1000 * i,
        "media_end_ms": 1000 * i + 500,
        "subject_player_id": P,
        "subject_identity_status": identity,
        "action": action,
        "vocab_version": 1,
        "outcome": outcome,
        "participants_json": "[]",
        "visibility": "full",
        "label_source": source,
        "confidence_raw": None,
        "sampling_method": sampling,
        "event_key_json": None,
        "notes": None,
        "review_status": review,
        "revision": 1,
        "superseded_by": None,
        "snapshot_version": 1,
    }


@pytest.fixture(scope="module")
def db(tmp_path_factory) -> Database:
    layout = DataLayout(tmp_path_factory.mktemp("obs"), "nba")
    rows = [
        _ann(1, "closeout", "contest_hand_up"),
        _ann(2, "closeout", "late"),
        _ann(3, "closeout", "contest_hand_up", game="0022400002"),
        _ann(4, "closeout", "blown_by", review="reviewed_corrected"),
        _ann(
            5, "closeout", "contest_hand_up", sampling="curated"
        ),  # example only, never in the rate
        _ann(6, "closeout", "contest_hand_up", review="unreviewed"),  # excluded
        _ann(7, "closeout", "contest_hand_up", identity="asserted"),  # excluded
        _ann(8, "closeout", "contest_hand_up", source="model:x@1"),  # excluded (model label)
        _ann(9, "cut", "received"),
        _ann(10, "cut", "not_received"),
    ]
    write_family(
        layout,
        "annotation_snapshots",
        pd.DataFrame(rows),
        source="scouting-snapshot",
        season=S,
        season_type=RS,
    )
    write_family(
        layout,
        "player_season",
        pd.DataFrame(
            [
                {
                    "player_id": P,
                    "season": S,
                    "season_type": RS,
                    "team_id": 1,
                    "team_abbreviation": "BOS",
                    "is_aggregate": False,
                    "gp": 10.0,
                    "min": 300.0,
                }
            ]
        ),
        source="test",
        season=S,
        season_type=RS,
    )
    return Database(layout)


def test_registry_declares_reviewed_traits_with_action_and_outcomes():
    t = TRAIT_INDEX["closeout_contest_rate"]
    assert t.evidence_class == "reviewed_observation" and t.action == "closeout"
    assert "contest_hand_up" in t.success_outcomes and t.denominator == "closeouts observed"
    assert TRAIT_INDEX["cut_received_rate"].action == "cut"


def test_rate_uses_only_reviewed_verified_human_systematic_rows(db):
    rec = {
        r["key"]: r
        for r in reviewed_observation_traits(db, P, S, RS, trait_keys=["closeout_contest_rate"])
    }["closeout_contest_rate"]
    assert rec["evidence_class"] == "reviewed_observation"
    assert rec["sample"] == {"n": 4, "denominator": "closeouts observed"}  # rows 1-4 only
    assert rec["value"] == pytest.approx(2 / 4)
    assert (
        rec["interval"]["method"] == "wilson_95"
        and rec["interval"]["low"] < 0.5 < rec["interval"]["high"]
    )
    assert rec["coverage"] == {"games_played": 10.0, "games_covered": 2, "fraction": 0.2}
    assert rec["sampling_methods"] == {"complete_event_set": 4}
    assert rec["disagreement_count"] == 1
    assert rec["examples"]["annotation_ids"] == [
        "A001",
        "A003",
        "A005",
    ]  # successes incl. the curated one, as examples
    assert rec["counterexamples"]["annotation_ids"] == ["A002", "A004"]
    assert rec["qualification"]["met"] is True and rec["limitations"]


def test_no_opportunities_means_null_not_zero(db):
    rec = {
        r["key"]: r for r in reviewed_observation_traits(db, P, S, RS, trait_keys=["box_out_rate"])
    }["box_out_rate"]
    assert rec["value"] is None and rec["sample"]["n"] == 0
    assert rec["qualification"]["met"] is False and "no reviewed" in rec["qualification"]["reason"]


def test_absent_family_is_unsupported(demo_db):
    rec = reviewed_observation_traits(
        demo_db, 9_000_001, "2024-25", RS, trait_keys=["closeout_contest_rate"]
    )[0]
    assert rec["value"] is None and "annotation_snapshots" in rec["unsupported_reason"]


def test_statistical_keys_are_rejected_here(db):
    with pytest.raises(KeyError):
        reviewed_observation_traits(db, P, S, RS, trait_keys=["ts_pct"])
