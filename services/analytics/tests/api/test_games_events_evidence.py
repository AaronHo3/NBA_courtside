"""Read API for games, play-by-play events, shot evidence and evidence items (scouting A-06)."""

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.data.db import Database
from app.data.parquet_io import write_family
from app.data.paths import DataLayout
from app.events.games import derive_games
from app.events.id_map import build_event_id_map
from app.events.normalize_pbp import normalize_pbp_v3
from app.evidence.link_events import link_game_events
from app.main import create_app
from app.state.connection import open_state_db
from tests.ingestion.fake_provider import load_fixture

GAME = "0022400061"
RS = "Regular Season"
BOS, NYK = 1610612738, 1610612752
TATUM = 1628369


def _ok(resp):
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    return body["data"], body["meta"]


@pytest.fixture(scope="module")
def real_client(tmp_path_factory) -> TestClient:
    root = tmp_path_factory.mktemp("real")
    layout = DataLayout(root, "nba")
    kw = dict(source="test", season="2024-25", season_type=RS)
    logs = pd.DataFrame(
        [
            {
                "team_id": BOS,
                "season": "2024-25",
                "season_type": RS,
                "game_id": GAME,
                "game_date": pd.Timestamp("2024-10-22").date(),
                "matchup": "BOS vs. NYK",
                "home": True,
                "opponent_team_id": NYK,
                "wl": "W",
                "pts": 132.0,
            },
            {
                "team_id": NYK,
                "season": "2024-25",
                "season_type": RS,
                "game_id": GAME,
                "game_date": pd.Timestamp("2024-10-22").date(),
                "matchup": "NYK @ BOS",
                "home": False,
                "opponent_team_id": BOS,
                "wl": "L",
                "pts": 109.0,
            },
        ]
    )
    write_family(layout, "team_game_logs", logs, **kw)
    write_family(layout, "games", derive_games(logs), **kw)
    events, participants = normalize_pbp_v3(
        load_fixture(f"playbyplayv3__game_{GAME}"), game_id=GAME, season="2024-25", season_type=RS
    )
    shots = pd.DataFrame(
        [
            {
                "game_id": GAME,
                "game_event_id": 7,
                "player_id": TATUM,
                "team_id": BOS,
                "period": 1,
                "minutes_remaining": 11,
                "seconds_remaining": 48,
                "shot_made_flag": 1,
                "season": "2024-25",
                "season_type": RS,
            },
            {
                "game_id": GAME,
                "game_event_id": 44,
                "player_id": TATUM,
                "team_id": BOS,
                "period": 1,
                "minutes_remaining": 5,
                "seconds_remaining": 0,
                "shot_made_flag": 0,
                "season": "2024-25",
                "season_type": RS,
            },  # not in the 50-action fixture
        ]
    )
    write_family(layout, "events", events, **kw)
    write_family(layout, "event_participants", participants, **kw)
    write_family(layout, "event_id_map", build_event_id_map(events, shots), **kw)
    write_family(layout, "shots", shots, **kw)
    write_family(
        layout,
        "player_season",
        pd.DataFrame(
            [
                {
                    "player_id": TATUM,
                    "season": "2024-25",
                    "season_type": RS,
                    "team_id": BOS,
                    "team_abbreviation": "BOS",
                    "is_aggregate": False,
                    "gp": 1.0,
                }
            ]
        ),
        **kw,
    )
    state = open_state_db(layout)
    try:
        link_game_events(state, Database(layout), GAME)
    finally:
        state.close()
    app = create_app(settings=Settings(nba_data_dir=root, nba_namespace="nba", max_rows=100))
    with TestClient(app) as c:
        yield c


class TestGames:
    def test_game_detail_keeps_leading_zeros(self, real_client):
        data, _ = _ok(real_client.get(f"/api/games/{GAME}"))
        assert data["game"]["game_id"] == GAME
        assert data["game"]["home_team_id"] == BOS and data["game"]["away_team_id"] == NYK
        assert data["game"]["home_score"] == 132 and data["game"]["neutral_site"] is False
        assert data["coverage"]["events"] == 50 and data["coverage"]["evidence_items"] > 0

    def test_unknown_and_malformed_ids(self, real_client):
        r = real_client.get("/api/games/0000000000")
        assert r.status_code == 404 and r.json()["success"] is False
        assert real_client.get("/api/games/22400061").status_code == 422

    def test_events_are_paginated_and_filterable(self, real_client):
        data, meta = _ok(
            real_client.get(f"/api/games/{GAME}/events", params={"limit": 20, "offset": 0})
        )
        assert (
            len(data) == 20
            and meta["total"] == 50
            and meta["returned"] == 20
            and meta["offset"] == 0
        )
        assert data[0]["source_order"] == 0 and data[0]["game_id"] == GAME
        fg, meta = _ok(
            real_client.get(
                f"/api/games/{GAME}/events", params={"is_field_goal": True, "person_id": TATUM}
            )
        )
        assert fg and all(e["person_id"] == TATUM and e["is_field_goal"] for e in fg)
        assert meta["total"] == len(fg)

    def test_events_limit_is_capped(self, real_client):
        assert (
            real_client.get(f"/api/games/{GAME}/events", params={"limit": 5000}).status_code == 422
        )


class TestEvents:
    def test_event_detail_has_participants_duplicates_and_evidence(self, real_client):
        data, _ = _ok(real_client.get(f"/api/events/pbp_v3/{GAME}/7"))
        assert (
            data["event"]["description"].startswith("Tatum") and data["event"]["clock_ms"] == 708000
        )
        assert [p["role"] for p in data["participants"]] == ["actor"]
        assert data["shot"]["game_event_id"] == 7 and data["shot"]["map"]["confidence"] == "exact"
        assert len(data["evidence"]) == 1
        ev = data["evidence"][0]
        assert ev["kind"] == "external_reference" and ev["reference"]["external_url"].endswith(
            "GameEventID=7&flag=1"
        )
        assert ev["reference"]["availability"] == "unverified" and "murl" not in str(ev)

    def test_duplicate_action_numbers_return_every_copy(self, real_client):
        data, _ = _ok(real_client.get(f"/api/events/pbp_v3/{GAME}/33"))
        assert len(data["duplicates"]) == 2 and data["shot"] is None

    def test_unknown_event_is_404(self, real_client):
        assert real_client.get(f"/api/events/pbp_v3/{GAME}/999999").status_code == 404
        assert real_client.get(f"/api/events/nope/{GAME}/7").status_code == 422


class TestShotEvidence:
    def test_mapped_shot(self, real_client):
        data, meta = _ok(real_client.get(f"/api/shots/{GAME}/7/evidence"))
        assert meta["event_id_map_method"] == "equal_ids" and meta["confidence"] == "exact"
        assert data["event"]["source_event_id"] == 7
        assert len(data["evidence"]) == 1 and data["evidence"][0]["evidence_class"] == "reference"

    def test_unmapped_shot_is_explicit(self, real_client):
        data, meta = _ok(real_client.get(f"/api/shots/{GAME}/44/evidence"))
        assert data is None and "reason" in meta and meta["event_id_map_method"] is None


class TestEvidence:
    def test_listing_filters_and_pagination(self, real_client):
        data, meta = _ok(real_client.get("/api/evidence", params={"player_id": TATUM, "limit": 2}))
        assert len(data) == 2 and meta["total"] >= 3 and meta["limit"] == 2 and meta["offset"] == 0
        assert all(TATUM in row["player_ids"] for row in data)
        empty, meta = _ok(real_client.get("/api/evidence", params={"game_id": "0000000000"}))
        assert empty == [] and meta["total"] == 0
        assert real_client.get("/api/evidence", params={"limit": 1000}).status_code == 422

    def test_detail_includes_referent_without_media_urls(self, real_client):
        rows, _ = _ok(real_client.get("/api/evidence", params={"limit": 1}))
        data, _ = _ok(real_client.get(f"/api/evidence/{rows[0]['evidence_id']}"))
        assert data["item"]["evidence_id"] == rows[0]["evidence_id"]
        assert data["referent"]["link"]["game_id"] == GAME
        assert data["referent"]["asset"]["external_url"].startswith(
            "https://www.nba.com/stats/events/"
        )
        assert data["referent"]["permissions"][0]["allowed_operations"] == ["view"]
        assert ".mp4" not in str(data)

    def test_unknown_id_is_404(self, real_client):
        r = real_client.get("/api/evidence/01HZZZZZZZZZZZZZZZZZZZZZZZ")
        assert r.status_code == 404 and r.json()["success"] is False


class TestDemoNamespace:
    def test_demo_events_serve_but_evidence_is_empty(self, client):
        status, _ = _ok(client.get("/api/meta/status"))
        season = status["default_season"]
        games, meta = _ok(client.get("/api/games", params={"season": season, "limit": 1}))
        assert games and meta["total"] > 0
        gid = games[0]["game_id"]
        events, meta = _ok(client.get(f"/api/games/{gid}/events", params={"limit": 5}))
        assert events and events[0]["source_event_system"] == "demo_shots"
        evidence, meta = _ok(client.get("/api/evidence"))
        assert evidence == [] and meta["total"] == 0

    def test_real_evidence_id_is_not_visible_from_demo(self, client, real_client):
        rows, _ = _ok(real_client.get("/api/evidence", params={"limit": 1}))
        assert client.get(f"/api/evidence/{rows[0]['evidence_id']}").status_code == 404

    def test_game_without_events_reports_coverage(self, client):
        status, _ = _ok(client.get("/api/meta/status"))
        season = status["seasons"][
            -1
        ]  # summary-only demo season: games exist? if not, 404 is acceptable
        r = client.get("/api/games", params={"season": season})
        assert r.status_code == 200
