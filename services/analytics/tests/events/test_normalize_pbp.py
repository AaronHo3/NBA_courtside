"""playbyplayv3 -> events + event_participants, preserving source ids, order and raw rows."""

import json

import pandas as pd
import pytest

from app.data.schemas import schema_for
from app.events.normalize_pbp import NORMALIZER_VERSION, normalize_pbp_v3, parse_clock
from tests.ingestion.fake_provider import load_fixture

GAME = "0022400061"
RS = "Regular Season"


@pytest.fixture(scope="module")
def frames():
    payload = load_fixture(f"playbyplayv3__game_{GAME}")
    return normalize_pbp_v3(payload, game_id=GAME, season="2024-25", season_type=RS)


@pytest.mark.parametrize(
    "text,ms",
    [("PT11M48.00S", 708_000), ("PT00M00.00S", 0), ("PT0M07.30S", 7_300), ("PT12M00.00S", 720_000)],
)
def test_parse_clock(text, ms):
    assert parse_clock(text) == ms


@pytest.mark.parametrize("text", [None, "", "11:48", "PTxx"])
def test_parse_clock_unparseable_is_none(text):
    assert parse_clock(text) is None


def test_events_keep_every_source_row_in_order(frames):
    events, _ = frames
    assert list(events.columns) == schema_for("events").names
    assert len(events) == 50  # fixture is truncated to 50 actions
    assert events["source_order"].tolist() == list(range(50))
    assert (events["source_event_system"] == "pbp_v3").all()
    assert (events["game_id"] == GAME).all() and events["game_id"].map(type).eq(str).all()
    assert (events["normalizer_version"] == NORMALIZER_VERSION).all()


def test_duplicate_action_numbers_are_kept_and_flagged(frames):
    events, _ = frames
    dup = events[events["source_event_id"] == 33]
    assert len(dup) == 2
    first, second = dup.sort_values("source_order").itertuples()
    assert pd.isna(first.duplicate_of)
    assert second.duplicate_of == first.source_order


def test_fields_are_typed_and_verbatim(frames):
    events, _ = frames
    e7 = events[(events["source_event_id"] == 7)].iloc[0]
    assert e7["clock_ms"] == 708_000 and e7["period"] == 1
    assert e7["action_type"] == "Made Shot" and e7["sub_type"] == "Pullup Jump shot"
    assert e7["shot_result"] == "Made" and bool(e7["is_field_goal"])
    assert e7["person_id"] == 1628369 and e7["team_id"] == 1610612738
    assert e7["x_legacy"] == 141 and e7["y_legacy"] == 228 and e7["shot_value"] == 3
    assert e7["video_available"] == True  # noqa: E712
    raw = json.loads(e7["raw_json"])
    assert raw["actionNumber"] == 7 and raw["description"].startswith("Tatum")


def test_team_rebound_has_no_person(frames):
    events, participants = frames
    e38 = events[events["source_event_id"] == 38].iloc[0]
    assert pd.isna(e38["person_id"])
    assert e38["team_id"] == 1610612738
    assert participants[participants["source_event_id"] == 38].empty


def test_participants_only_from_structured_ids(frames):
    _, participants = frames
    assert list(participants.columns) == schema_for("event_participants").names
    roles = dict(zip(participants["source_event_id"], participants["role"], strict=True))
    assert roles[7] == "actor" and roles[4] == "jumper"
    sub = participants[participants["source_event_id"] == 59]
    assert (
        len(sub) == 1
        and sub.iloc[0]["role"] == "substituted_out"
        and sub.iloc[0]["person_id"] == 201950
    )
    # the incoming player is only named in the description text; never inferred
    assert (participants["source_slot"] == "personId").all()
    assert participants[participants["source_event_id"] == 2].empty  # period start, personId 0


def test_duplicate_participants_carry_duplicate_of(frames):
    _, participants = frames
    dup = participants[participants["source_event_id"] == 66].sort_values(
        "duplicate_of", na_position="first"
    )
    assert len(dup) == 2 and dup["duplicate_of"].notna().sum() == 1


def test_empty_payload_gives_empty_frames():
    events, participants = normalize_pbp_v3({}, game_id=GAME, season="2024-25", season_type=RS)
    assert events.empty and participants.empty
    assert list(events.columns) == schema_for("events").names
