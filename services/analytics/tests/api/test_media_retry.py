"""Retrying processing for a managed asset enqueues a fresh probe (B-09 state card's retry button)."""

import io

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.data.paths import DataLayout
from app.evidence.registry import add_permission, register_managed_asset
from app.evidence.storage import MediaStore
from app.main import create_app
from app.state.connection import open_state_db


@pytest.fixture
def env(tmp_path):
    layout = DataLayout(tmp_path, "nba")
    store = MediaStore(layout)
    db = open_state_db(layout)
    try:
        res = store.write_atomic("incoming/a.mp4", io.BytesIO(b"x"))
        key = store.promote_original(res.path, res.sha256, "mp4")
        asset = register_managed_asset(
            db,
            sha256=res.sha256,
            storage_key=key,
            original_filename="a.mp4",
            byte_size=1,
            container="mp4",
        )
        add_permission(
            db,
            asset_id=asset["asset_id"],
            source="user_upload",
            allowed_operations=["view"],
            permission_status="known",
        )
    finally:
        db.close()
    with TestClient(
        create_app(settings=Settings(nba_data_dir=tmp_path, nba_namespace="nba", jobs_inline=False))
    ) as c:
        yield c, asset["asset_id"]


def test_retry_enqueues_a_new_probe_job_each_time(env):
    c, aid = env
    first = c.post(f"/api/media/{aid}/jobs/retry")
    assert first.status_code == 202, first.text
    job = first.json()["data"]
    assert (
        job["kind"] == "probe_media"
        and job["payload"]["asset_id"] == aid
        and job["status"] == "queued"
    )
    second = c.post(f"/api/media/{aid}/jobs/retry").json()["data"]
    assert second["job_id"] != job["job_id"]  # a retry is always a fresh attempt
    assert c.post("/api/media/01HZZZZZZZZZZZZZZZZZZZZZZZ/jobs/retry").status_code == 404
    detail = c.get(f"/api/media/{aid}").json()["data"]
    assert detail["job"]["job_id"] == second["job_id"]
