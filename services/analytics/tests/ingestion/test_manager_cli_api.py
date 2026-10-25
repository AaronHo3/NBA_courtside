import argparse
import threading

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.ingestion import cli
from app.ingestion.manager import IngestionBusyError, IngestionManager
from app.main import create_app
from tests.ingestion.conftest import RS, SEASON
from tests.ingestion.fake_provider import FakeProvider


class BlockingProvider(FakeProvider):
    def __init__(self):
        super().__init__()
        self.gate = threading.Event()

    def fetch(self, endpoint_name, params):
        self.gate.wait(timeout=5)
        return super().fetch(endpoint_name, params)


def _settings(tmp_path, **kw) -> Settings:
    return Settings(
        nba_data_dir=tmp_path / "data", nba_namespace="nba", nba_request_delay_seconds=0.0, **kw
    )


class TestManager:
    def test_run_in_background(self, tmp_path):
        done = []
        manager = IngestionManager(
            _settings(tmp_path), provider=FakeProvider(), on_complete=lambda r: done.append(r)
        )
        assert manager.provider_reachable is None and manager.probe() is True
        plan = manager.start([SEASON], [RS], ["teams", "players"])
        assert plan["steps"] == 2
        assert manager.wait(10)
        assert (
            manager.running is False
            and manager.last_run["ok"] == 2
            and manager.last_run["failed"] == 0
        )
        assert manager.last_run["finished_at"] and [s["family"] for s in manager.progress] == [
            "teams",
            "players",
        ]
        assert len(done) == 1 and done[0].ok == 2

    def test_refuses_concurrent_runs(self, tmp_path):
        provider = BlockingProvider()
        manager = IngestionManager(_settings(tmp_path), provider=provider)
        manager.start([SEASON], [RS], ["players"])
        with pytest.raises(IngestionBusyError):
            manager.start([SEASON], [RS], ["players"])
        with pytest.raises(IngestionBusyError):
            manager.fetch_player_shots(1001, SEASON, RS)
        provider.gate.set()
        assert manager.wait(10) and manager.last_run["ok"] == 1

    def test_invalid_family_rejected_before_start(self, tmp_path):
        manager = IngestionManager(_settings(tmp_path), provider=FakeProvider())
        with pytest.raises(ValueError):
            manager.start([SEASON], [RS], ["bogus"])
        assert manager.running is False

    def test_fetch_player_shots(self, tmp_path):
        refreshed = []
        manager = IngestionManager(
            _settings(tmp_path), provider=FakeProvider(), on_complete=lambda r: refreshed.append(r)
        )
        result = manager.fetch_player_shots(1001, SEASON, RS)
        assert result["total_rows"] == 2 and refreshed == [None]


class TestCli:
    def test_parse_run(self):
        args = cli.build_parser().parse_args(
            [
                "run",
                "--seasons",
                "2024-25",
                "2023-24",
                "--season-types",
                "Regular Season",
                "Playoffs",
                "--families",
                "player_season,shots",
                "--refresh",
                "--players-limit",
                "5",
            ]
        )
        assert args.command == "run" and args.seasons == ["2024-25", "2023-24"] and args.refresh
        assert args.season_types == ["Regular Season", "Playoffs"] and args.players_limit == 5
        assert cli.parse_families(args.families) == ("player_season", "shots")

    def test_default_families_all(self):
        args = cli.build_parser().parse_args(["run", "--seasons", "2024-25"])
        assert (
            args.families == "all" and args.season_types == ["Regular Season"] and not args.refresh
        )

    def test_bad_family_and_season_type(self):
        with pytest.raises(argparse.ArgumentTypeError):
            cli.parse_families("player_season,nope")
        with pytest.raises(SystemExit):
            cli.build_parser().parse_args(
                ["run", "--seasons", "2024-25", "--season-types", "Summer"]
            )

    def test_run_status_probe(self, tmp_path, monkeypatch, capsys):
        monkeypatch.setattr(cli, "NbaApiProvider", lambda settings: FakeProvider())
        data_dir = str(tmp_path / "data")
        assert (
            cli.main(
                [
                    "--data-dir",
                    data_dir,
                    "run",
                    "--seasons",
                    SEASON,
                    "--families",
                    "teams,team_season",
                ]
            )
            == 0
        )
        out = capsys.readouterr().out
        assert "team_season 2024-25 Regular Season" in out and "done: ok=2 failed=0" in out
        assert cli.main(["--data-dir", data_dir, "status"]) == 0
        status_out = capsys.readouterr().out
        assert "entries=2" in status_out and "ok  team_season" in status_out
        assert cli.main(["--data-dir", data_dir, "probe"]) == 0
        assert "reachable: True" in capsys.readouterr().out


@pytest.fixture
def nba_client(tmp_path):
    settings = _settings(tmp_path)
    app = create_app(settings=settings)
    previous = app.state.ingestion
    app.state.ingestion = IngestionManager(
        settings, provider=FakeProvider(), on_complete=previous._on_complete
    )
    with TestClient(app) as c:
        yield c


def _data(response, status=200):
    assert response.status_code == status, response.text
    body = response.json()
    assert body["success"] is True
    return body["data"]


class TestApi:
    def test_status_before_any_run(self, nba_client):
        data = _data(nba_client.get("/api/ingestion/status"))
        assert (
            data["namespace"] == "nba"
            and data["running"] is False
            and data["provider_reachable"] is None
        )
        assert data["real_manifest"]["entries"] == 0

    def test_probe(self, nba_client):
        assert _data(nba_client.post("/api/ingestion/probe"))["provider_reachable"] is True
        assert _data(nba_client.get("/api/ingestion/status"))["provider_reachable"] is True

    def test_run_progress_and_status(self, nba_client):
        body = {"seasons": [SEASON], "families": ["teams", "players", "team_season", "shots"]}
        data = _data(nba_client.post("/api/ingestion/run", json=body), status=202)
        assert (
            data["accepted"] and data["plan"]["steps"] == 4 and data["plan"]["season_types"] == [RS]
        )
        manager = nba_client.app.state.ingestion
        assert manager.wait(15)
        progress = _data(nba_client.get("/api/ingestion/progress"))
        assert (
            progress["running"] is False and progress["completed"] == 4 and progress["planned"] == 4
        )
        assert [s["status"] for s in progress["steps"]] == ["ok"] * 4
        status = _data(nba_client.get("/api/ingestion/status"))
        assert status["real_manifest"]["ok"] == 5 and status["last_run"]["failed"] == 0
        assert status["real_manifest"]["coverage"][SEASON][RS]["shots"] == "ok"
        # DuckDB views were refreshed by on_complete: the real data is queryable immediately.
        markers = _data(nba_client.get(f"/api/shots/markers?season={SEASON}&player_id=1001"))
        assert len(markers) == 2

    def test_run_validation(self, nba_client):
        assert nba_client.post("/api/ingestion/run", json={"seasons": ["2024"]}).status_code == 422
        assert (
            nba_client.post(
                "/api/ingestion/run", json={"seasons": [SEASON], "families": ["x"]}
            ).status_code
            == 422
        )
        assert (
            nba_client.post(
                "/api/ingestion/run", json={"seasons": [SEASON], "season_types": ["Summer"]}
            ).status_code
            == 422
        )

    def test_run_conflict_when_busy(self, nba_client):
        manager = nba_client.app.state.ingestion
        blocking = BlockingProvider()
        manager._provider = blocking
        _data(
            nba_client.post(
                "/api/ingestion/run", json={"seasons": [SEASON], "families": ["players"]}
            ),
            status=202,
        )
        assert (
            nba_client.post(
                "/api/ingestion/run", json={"seasons": [SEASON], "families": ["players"]}
            ).status_code
            == 409
        )
        blocking.gate.set()
        assert manager.wait(10)

    def test_fetch_player_shots(self, nba_client):
        body = {"player_id": 1001, "season": SEASON, "season_type": RS}
        data = _data(nba_client.post("/api/shots/fetch-player", json=body))
        assert data["total_rows"] == 2 and data["fetched_rows"] == 2
        markers = _data(nba_client.get(f"/api/shots/markers?season={SEASON}&player_id=1001"))
        assert len(markers) == 2
        assert (
            nba_client.post("/api/shots/fetch-player", json={**body, "player_id": 0}).status_code
            == 422
        )

    def test_fetch_player_rejected_in_demo(self, client):
        r = client.post(
            "/api/shots/fetch-player", json={"player_id": 1, "season": SEASON, "season_type": RS}
        )
        assert r.status_code == 409
        body = r.json()
        assert body["success"] is False and "demo" in body["error"]

    def test_namespace_switches_after_first_real_ingestion(self, tmp_path):
        settings = Settings(
            nba_data_dir=tmp_path / "data", nba_namespace="auto", nba_request_delay_seconds=0.0
        )
        app = create_app(settings=settings)
        app.state.ingestion = IngestionManager(
            settings, provider=FakeProvider(), on_complete=app.state.ingestion._on_complete
        )
        with TestClient(app) as c:
            assert _data(c.get("/api/ingestion/status"))["namespace"] == "demo"
            _data(
                c.post(
                    "/api/ingestion/run",
                    json={"seasons": [SEASON], "families": ["teams", "players"]},
                ),
                status=202,
            )
            assert app.state.ingestion.wait(10)
            assert _data(c.get("/api/ingestion/status"))["namespace"] == "nba"
            assert app.state.layout.namespace == "nba"
