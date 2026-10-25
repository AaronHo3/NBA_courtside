"""The app owns a per-namespace state database and reports machine capabilities."""

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.config import Settings
from app.data.manifest import Manifest, ManifestEntry
from app.data.paths import DataLayout
from app.main import create_app


def test_capabilities_envelope(client):
    body = client.get("/api/meta/capabilities").json()
    assert body["success"] is True
    data = body["data"]
    assert set(data) >= {
        "ffmpeg",
        "cv_runtime",
        "llm_provider",
        "worker_alive",
        "video_sources",
        "state_db",
    }
    assert isinstance(data["ffmpeg"]["available"], bool)
    assert data["cv_runtime"] is False
    assert data["llm_provider"] == "none"
    assert data["worker_alive"] is False
    assert data["video_sources"] == ["nba_stats_events"]  # from Settings.video_sources
    assert data["state_db"]["namespace"] == "demo"
    assert data["state_db"]["schema_version"] >= 1


def test_app_opens_state_db_for_served_namespace(demo_root):
    settings = Settings(nba_data_dir=demo_root, nba_namespace="demo")
    app = create_app(settings=settings)
    with TestClient(app):
        assert app.state.state_db.namespace == "demo"
        assert DataLayout(demo_root, "demo").state_db_path.exists()
    # shutdown closes the connection so no sqlite handle leaks between namespace switches or tests
    assert app.state.state_db.closed is True


def test_namespace_change_reopens_state_db(tmp_path):
    settings = Settings(nba_data_dir=tmp_path, nba_namespace="auto")
    app = create_app(settings=settings)
    with TestClient(app):
        assert app.state.namespace.namespace == "demo"
        old = app.state.state_db
        real = DataLayout(tmp_path, "nba")
        Manifest(namespace="nba").upsert(
            ManifestEntry(
                family="teams", status="ok", rows=30, fetched_at=datetime.now(UTC), source="test"
            )
        ).save(real)
        app.state.ingestion._on_complete(None)
        assert app.state.namespace.namespace == "nba"
        assert app.state.state_db is not old
        assert app.state.state_db.namespace == "nba"
        assert old.closed is True
        assert real.state_db_path.exists()
