"""Event queries over the Parquet families via DuckDB."""

import pandas as pd
import pytest

from app.data.db import Database
from app.data.parquet_io import write_family
from app.data.paths import DataLayout
from app.events import repository
from app.events.id_map import build_event_id_map
from app.events.normalize_pbp import normalize_pbp_v3
from tests.ingestion.fake_provider import load_fixture

GAME = "0022400061"
RS = "Regular Season"


@pytest.fixture(scope="module")
def db(tmp_path_factory):
    layout = DataLayout(tmp_path_factory.mktemp("events"), "nba")
    events, participants = normalize_pbp_v3(
        load_fixture(f"playbyplayv3__game_{GAME}"), game_id=GAME, season="2024-25", season_type=RS
    )
    shots = pd.DataFrame(
        [
            {
                "game_id": GAME,
                "game_event_id": 7,
                "player_id": 1628369,
                "team_id": 1610612738,
                "period": 1,
                "minutes_remaining": 11,
                "seconds_remaining": 48,
                "shot_made_flag": 1,
                "season": "2024-25",
                "season_type": RS,
            }
        ]
    )
    kw = dict(source="test", season="2024-25", season_type=RS)
    write_family(layout, "events", events, **kw)
    write_family(layout, "event_participants", participants, **kw)
    write_family(layout, "event_id_map", build_event_id_map(events, shots), **kw)
    write_family(layout, "shots", shots, **kw)
    return Database(layout)


def test_game_events_in_source_order_with_filters(db):
    all_rows = repository.game_events(db, GAME)
    assert len(all_rows) == 50 and all_rows["source_order"].is_monotonic_increasing
    fg = repository.game_events(db, GAME, is_field_goal=True)
    assert (fg["is_field_goal"] == True).all() and len(fg) < 50  # noqa: E712
    one = repository.game_events(db, GAME, person_id=1628369, period=1)
    assert set(one["person_id"]) == {1628369}
    assert repository.game_events(db, "0000000000").empty


def test_event_detail_includes_participants(db):
    detail = repository.event(db, "pbp_v3", GAME, 7)
    assert detail is not None
    assert detail["event"]["description"].startswith("Tatum")
    assert [p["role"] for p in detail["participants"]] == ["actor"]
    assert repository.event(db, "pbp_v3", GAME, 999_999) is None


def test_duplicate_event_ids_return_every_copy(db):
    detail = repository.event(db, "pbp_v3", GAME, 33)
    assert len(detail["duplicates"]) == 2


def test_events_for_shot_goes_through_the_map(db):
    hit = repository.events_for_shot(db, GAME, 7)
    assert hit is not None and hit["method"] == "equal_ids" and hit["event"]["source_event_id"] == 7
    assert repository.events_for_shot(db, GAME, 44) is None
