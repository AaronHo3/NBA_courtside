"""Public read-only mode: no ingestion routes, no on-demand provider fetches, data still served."""

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture(scope="module")
def ro_client(demo_root) -> TestClient:
    settings = Settings(nba_data_dir=demo_root, nba_namespace="demo", public_read_only=True)
    with TestClient(create_app(settings=settings)) as c:
        yield c


def test_health_reports_read_only(ro_client):
    body = ro_client.get("/api/health").json()
    assert body["success"] is True and body["data"]["read_only"] is True


def test_ingestion_routes_are_absent(ro_client):
    assert ro_client.get("/api/ingestion/status").status_code == 404
    assert ro_client.post("/api/ingestion/run", json={"seasons": ["2024-25"]}).status_code == 404
    assert ro_client.post("/api/ingestion/probe").status_code == 404


def test_on_demand_fetch_is_refused(ro_client):
    r = ro_client.post(
        "/api/shots/fetch-player",
        json={"player_id": 9000001, "season": "2024-25", "season_type": "Regular Season"},
    )
    assert r.status_code == 403
    assert r.json()["success"] is False and "read-only" in r.json()["error"]


def test_data_routes_still_work(ro_client):
    body = ro_client.get("/api/meta/status").json()
    assert body["success"] is True and body["data"]["namespace"] == "demo"
    assert body["data"]["read_only"] is True
    assert ro_client.get("/api/meta/metrics").json()["success"] is True


def test_cors_origins_parse():
    s = Settings(cors_origins="https://a.example, https://b.example,")
    assert s.cors_origin_list == ["https://a.example", "https://b.example"]


def test_mutable_scouting_and_jobs_routes_are_absent_in_read_only_mode(ro_client):
    """Public hosts serve statistics only; shortlists, reports, jobs and uploads stay local until owner auth exists (A-00)."""
    assert ro_client.get("/api/jobs").status_code == 404
    assert ro_client.post("/api/jobs/01HZZZZZZZZZZZZZZZZZZZZZZZ/cancel").status_code == 404
    assert ro_client.get("/api/scouting/roles").status_code == 404
    assert (
        ro_client.post(
            "/api/scouting/shortlists", json={"label": "x", "season": "2024-25"}
        ).status_code
        == 404
    )
    # read-only analytics and evidence listings remain available
    assert ro_client.get("/api/evidence").status_code == 200
    assert ro_client.get("/api/meta/capabilities").status_code == 200
