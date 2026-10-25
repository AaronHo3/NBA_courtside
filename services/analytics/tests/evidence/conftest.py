import pandas as pd
import pytest

from app.data.db import Database
from app.data.parquet_io import write_family
from app.data.paths import DataLayout
from app.events.id_map import build_event_id_map
from app.events.normalize_pbp import normalize_pbp_v3
from app.state.connection import open_state_db
from tests.ingestion.fake_provider import load_fixture

GAME = "0022400061"
RS = "Regular Season"


@pytest.fixture
def nba_root(tmp_path):
    return tmp_path / "data"


@pytest.fixture
def layout(nba_root) -> DataLayout:
    return DataLayout(nba_root, "nba")


@pytest.fixture
def state_db(layout):
    db = open_state_db(layout)
    yield db
    db.close()


@pytest.fixture
def events_db(layout) -> Database:
    """Parquet events/participants/map/shots for the fixture game, served through DuckDB."""
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
            },
        ]
    )
    kw = dict(source="test", season="2024-25", season_type=RS)
    write_family(layout, "events", events, **kw)
    write_family(layout, "event_participants", participants, **kw)
    write_family(layout, "event_id_map", build_event_id_map(events, shots), **kw)
    write_family(layout, "shots", shots, **kw)
    return Database(layout)
