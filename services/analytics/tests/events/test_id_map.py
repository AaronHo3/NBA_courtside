"""event_id_map: verified correspondences between shots.game_event_id and pbp_v3 actionNumber."""

import pandas as pd

from app.data.schemas import schema_for
from app.events.id_map import agreement_summary, build_event_id_map

GAME = "0022400061"


def _event(num, person, period, clock_ms, result, fg=True, order=None):
    return {
        "game_id": GAME,
        "source_event_system": "pbp_v3",
        "source_event_id": num,
        "source_order": num if order is None else order,
        "period": period,
        "clock_ms": clock_ms,
        "person_id": person,
        "is_field_goal": fg,
        "shot_result": result,
    }


def _shot(num, person, period, m, s, made):
    return {
        "game_id": GAME,
        "game_event_id": num,
        "player_id": person,
        "period": period,
        "minutes_remaining": m,
        "seconds_remaining": s,
        "shot_made_flag": made,
    }


def test_equal_ids_with_consistent_details_are_exact():
    events = pd.DataFrame(
        [_event(7, 1628369, 1, 708_000, "Made"), _event(12, 1628384, 1, 700_000, None, fg=False)]
    )
    shots = pd.DataFrame([_shot(7, 1628369, 1, 11, 48, 1)])
    m = build_event_id_map(events, shots)
    assert list(m.columns) == schema_for("event_id_map").names
    row = m.iloc[0]
    assert row["shots_game_event_id"] == 7 and row["pbp_v3_action_number"] == 7
    assert row["method"] == "equal_ids" and row["confidence"] == "exact"
    assert pd.isna(row["pbp_v2_eventnum"])


def test_shifted_ids_match_on_clock_player_and_result():
    events = pd.DataFrame([_event(8, 1628369, 1, 708_000, "Made")])  # provider renumbered
    shots = pd.DataFrame([_shot(7, 1628369, 1, 11, 48, 1)])
    row = build_event_id_map(events, shots).iloc[0]
    assert row["pbp_v3_action_number"] == 8 and row["shots_game_event_id"] == 7
    assert row["method"] == "matched_on_clock_player_result" and row["confidence"] == "probable"


def test_equal_id_but_different_player_is_not_exact():
    events = pd.DataFrame(
        [_event(7, 999, 1, 708_000, "Made"), _event(9, 1628369, 1, 708_000, "Made")]
    )
    shots = pd.DataFrame([_shot(7, 1628369, 1, 11, 48, 1)])
    row = build_event_id_map(events, shots).iloc[0]
    assert row["pbp_v3_action_number"] == 9 and row["method"] == "matched_on_clock_player_result"


def test_two_candidates_are_ambiguous_and_none_is_absent():
    events = pd.DataFrame(
        [_event(8, 1628369, 1, 708_000, "Made"), _event(10, 1628369, 1, 708_000, "Made", order=10)]
    )
    shots = pd.DataFrame([_shot(7, 1628369, 1, 11, 48, 1), _shot(99, 1, 4, 0, 1, 0)])
    m = build_event_id_map(events, shots)
    amb = m[m["shots_game_event_id"] == 7].iloc[0]
    assert amb["confidence"] == "ambiguous" and pd.isna(amb["pbp_v3_action_number"])
    assert m[m["shots_game_event_id"] == 99].empty


def test_only_games_present_in_both_are_mapped_and_summary_counts():
    events = pd.DataFrame([_event(7, 1628369, 1, 708_000, "Made")])
    shots = pd.DataFrame(
        [_shot(7, 1628369, 1, 11, 48, 1), {**_shot(5, 2, 1, 1, 1, 1), "game_id": "0022400099"}]
    )
    m = build_event_id_map(events, shots)
    assert m["game_id"].tolist() == [GAME]
    summary = agreement_summary(m, shots[shots["game_id"] == GAME])
    assert summary == {
        "shots": 1,
        "mapped": 1,
        "exact": 1,
        "probable": 0,
        "ambiguous": 0,
        "unmapped": 0,
    }


def test_empty_inputs():
    m = build_event_id_map(pd.DataFrame(), pd.DataFrame())
    assert m.empty and list(m.columns) == schema_for("event_id_map").names
