"""Real and demo namespaces never see each other's games, events, evidence or state (scouting A-08)."""

from datetime import UTC, datetime

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.data.db import Database
from app.data.manifest import Manifest, ManifestEntry
from app.data.parquet_io import read_family, write_family
from app.data.paths import DataLayout
from app.demo.config import DemoConfig
from app.demo.generate import generate_demo
from app.events.id_map import build_event_id_map
from app.events.normalize_pbp import normalize_pbp_v3
from app.evidence.evidence_items import EvidenceNamespaceError, ensure_evidence_item
from app.evidence.link_events import link_game_events
from app.main import create_app
from app.state.connection import open_state_db
from tests.ingestion.fake_provider import load_fixture

GAME = "0022400061"
RS = "Regular Season"
TATUM = 1628369
SMALL = DemoConfig(
    seed=11,
    seasons=("2024-25",),
    detail_seasons=("2024-25",),
    n_teams=4,
    roster_size=9,
    games_per_team=6,
    trade_rate=0.0,
)


@pytest.fixture(scope="module")
def shared_root(tmp_path_factory):
    """One data root holding both namespaces, like a real installation."""
    root = tmp_path_factory.mktemp("both")
    generate_demo(DataLayout(root, "demo"), SMALL)
    nba = DataLayout(root, "nba")
    kw = dict(source="test", season="2024-25", season_type=RS)
    events, participants = normalize_pbp_v3(
        load_fixture(f"playbyplayv3__game_{GAME}"), game_id=GAME, season="2024-25", season_type=RS
    )
    shots = pd.DataFrame(
        [
            {
                "game_id": GAME,
                "game_event_id": 7,
                "player_id": TATUM,
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
    write_family(nba, "events", events, **kw)
    write_family(nba, "event_participants", participants, **kw)
    write_family(nba, "event_id_map", build_event_id_map(events, shots), **kw)
    write_family(nba, "shots", shots, **kw)
    write_family(
        nba,
        "player_season",
        pd.DataFrame(
            [
                {
                    "player_id": TATUM,
                    "season": "2024-25",
                    "season_type": RS,
                    "team_id": 1610612738,
                    "team_abbreviation": "BOS",
                    "is_aggregate": False,
                    "gp": 1.0,
                }
            ]
        ),
        **kw,
    )
    state = open_state_db(nba)
    try:
        link_game_events(state, Database(nba), GAME)
    finally:
        state.close()
    return root


@pytest.fixture(scope="module")
def nba_client(shared_root):
    with TestClient(
        create_app(settings=Settings(nba_data_dir=shared_root, nba_namespace="nba"))
    ) as c:
        yield c


@pytest.fixture(scope="module")
def demo_client(shared_root):
    with TestClient(
        create_app(settings=Settings(nba_data_dir=shared_root, nba_namespace="demo"))
    ) as c:
        yield c


def _data(resp):
    assert resp.status_code == 200, resp.text
    return resp.json()["data"], resp.json()["meta"]


def test_each_namespace_owns_its_own_state_file(shared_root, nba_client, demo_client):
    assert (shared_root / "nba" / "scouting.sqlite").exists()
    assert (shared_root / "demo" / "scouting.sqlite").exists()
    assert _data(nba_client.get("/api/meta/capabilities"))[0]["state_db"]["namespace"] == "nba"
    assert _data(demo_client.get("/api/meta/capabilities"))[0]["state_db"]["namespace"] == "demo"


def test_real_evidence_is_invisible_from_demo_and_vice_versa(nba_client, demo_client):
    rows, meta = _data(nba_client.get("/api/evidence", params={"limit": 5}))
    assert meta["total"] > 0
    assert _data(demo_client.get("/api/evidence"))[1]["total"] == 0
    assert demo_client.get(f"/api/evidence/{rows[0]['evidence_id']}").status_code == 404
    assert nba_client.get(f"/api/evidence/{rows[0]['evidence_id']}").status_code == 200


def test_games_and_events_do_not_cross(nba_client, demo_client, shared_root):
    demo_games = read_family(DataLayout(shared_root, "demo"), "games")
    demo_game = demo_games.iloc[0]["game_id"]
    assert demo_game.startswith("D")  # demo ids can never collide with provider ids
    assert nba_client.get(f"/api/games/{demo_game}").status_code == 404
    assert demo_client.get(f"/api/games/{GAME}").status_code == 404
    assert _data(nba_client.get(f"/api/games/{GAME}/events"))[1]["total"] == 50
    assert _data(demo_client.get(f"/api/games/{GAME}/events"))[1]["total"] == 0
    demo_events, _ = _data(demo_client.get(f"/api/games/{demo_game}/events", params={"limit": 3}))
    assert demo_events and demo_events[0]["source_event_system"] == "demo_shots"


def test_demo_shot_resolves_its_synthetic_event_with_no_evidence(demo_client, shared_root):
    shots = read_family(DataLayout(shared_root, "demo"), "shots").iloc[0]
    data, meta = _data(
        demo_client.get(f"/api/shots/{shots['game_id']}/{int(shots['game_event_id'])}/evidence")
    )
    assert (
        meta["event_id_map_method"] == "equal_ids"
        and data["event"]["source_event_system"] == "demo_shots"
    )
    assert data["evidence"] == []


def test_demo_player_ids_cannot_enter_the_real_registry_and_vice_versa(shared_root):
    nba = open_state_db(DataLayout(shared_root, "nba"))
    demo = open_state_db(DataLayout(shared_root, "demo"))
    try:
        with pytest.raises(EvidenceNamespaceError):
            ensure_evidence_item(
                nba,
                kind="statistic",
                ref_table="t",
                ref_id="x",
                evidence_class="statistical",
                summary="s",
                player_ids=[9_000_001],
            )
        with pytest.raises(EvidenceNamespaceError):
            ensure_evidence_item(
                demo,
                kind="statistic",
                ref_table="t",
                ref_id="x",
                evidence_class="statistical",
                summary="s",
                player_ids=[TATUM],
            )
        with pytest.raises(EvidenceNamespaceError):
            link_game_events(demo, Database(DataLayout(shared_root, "demo")), GAME)
    finally:
        nba.close()
        demo.close()


def test_namespace_switch_swaps_evidence_visibility(tmp_path, shared_root):
    """auto mode: demo first, then the real namespace appears -> state, routes and ids all switch."""
    import shutil

    root = tmp_path / "switch"
    shutil.copytree(shared_root / "demo", root / "demo")
    app = create_app(settings=Settings(nba_data_dir=root, nba_namespace="auto"))
    with TestClient(app) as c:
        assert _data(c.get("/api/meta/status"))[0]["namespace"] == "demo"
        assert _data(c.get("/api/evidence"))[1]["total"] == 0
        shutil.copytree(shared_root / "nba", root / "nba")
        Manifest(namespace="nba").upsert(
            ManifestEntry(
                family="events",
                season="2024-25",
                season_type=RS,
                status="ok",
                rows=50,
                fetched_at=datetime.now(UTC),
                source="test",
            )
        ).save(DataLayout(root, "nba"))
        app.state.ingestion._on_complete(None)
        assert _data(c.get("/api/meta/status"))[0]["namespace"] == "nba"
        assert _data(c.get("/api/meta/capabilities"))[0]["state_db"]["namespace"] == "nba"
        rows, meta = _data(c.get("/api/evidence", params={"limit": 1}))
        assert meta["total"] > 0 and rows[0]["game_id"] == GAME
        assert _data(c.get(f"/api/games/{GAME}/events"))[1]["total"] == 50
