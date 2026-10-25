"""export_snapshot and purge_media jobs over the API with the inline runner (scouting B-08)."""

import io

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.data.paths import DataLayout
from app.evidence.evidence_items import ensure_evidence_item
from app.evidence.models import EventKey
from app.evidence.registry import (
    add_permission,
    ensure_link,
    get_asset,
    register_managed_asset,
    soft_delete_asset,
)
from app.evidence.storage import MediaStore
from app.main import create_app
from app.state.connection import open_state_db


def _ok(resp, codes=(200, 201, 202)):
    assert resp.status_code in codes, resp.text
    body = resp.json()
    assert body["success"] is True
    return body["data"], body["meta"]


@pytest.fixture
def env(tmp_path):
    layout = DataLayout(tmp_path, "nba")
    store = MediaStore(layout)
    db = open_state_db(layout)
    try:
        ids = {}
        for name, payload in (("free", b"a" * 20), ("cited", b"b" * 20), ("live", b"c" * 20)):
            res = store.write_atomic(f"incoming/{name}.mp4", io.BytesIO(payload))
            key = store.promote_original(res.path, res.sha256, "mp4")
            asset = register_managed_asset(
                db,
                sha256=res.sha256,
                storage_key=key,
                original_filename=f"{name}.mp4",
                byte_size=20,
                container="mp4",
            )
            add_permission(
                db,
                asset_id=asset["asset_id"],
                source="user_upload",
                allowed_operations=["view"],
                permission_status="known",
            )
            ids[name] = (asset["asset_id"], store.resolve(key))
        link = ensure_link(
            db,
            event_key=EventKey("pbp_v3", "0022400061", 7),
            asset_id=ids["cited"][0],
            alignment_method="manual",
        )
        ensure_evidence_item(
            db,
            kind="video_segment",
            ref_table="event_video_links",
            ref_id=link["link_id"],
            evidence_class="reviewed_observation",
            summary="s",
            player_ids=[],
        )
        soft_delete_asset(db, ids["free"][0])
        soft_delete_asset(db, ids["cited"][0])
    finally:
        db.close()
    settings = Settings(
        nba_data_dir=tmp_path, nba_namespace="nba", jobs_inline=True, media_purge_after_days=0
    )
    with TestClient(create_app(settings=settings)) as c:
        yield c, ids, layout


def test_purge_removes_unreferenced_deleted_assets_only(env):
    c, ids, layout = env
    dry, _ = _ok(c.post("/api/media/purge", json={"dry_run": True}))
    assert dry["status"] == "succeeded" and dry["result"]["dry_run"] is True
    assert dry["result"]["purged"] == [ids["free"][0]] and ids["free"][1].exists()
    assert (
        ids["cited"][0] in dry["result"]["kept"]
        and "evidence" in dry["result"]["kept"][ids["cited"][0]]
    )
    job, _ = _ok(c.post("/api/media/purge", json={}))
    assert job["status"] == "succeeded" and job["result"]["purged"] == [ids["free"][0]]
    assert not ids["free"][1].exists() and ids["cited"][1].exists() and ids["live"][1].exists()
    db = open_state_db(layout)
    try:
        assert (
            get_asset(db, ids["free"][0])["storage_key"] is None
            and get_asset(db, ids["free"][0])["status"] == "deleted"
        )
        assert get_asset(db, ids["live"][0])["storage_key"]
    finally:
        db.close()
    again, _ = _ok(c.post("/api/media/purge", json={}))
    assert again["result"]["purged"] == []


def test_export_snapshot_job_and_listing(env):
    c, _, layout = env
    before, meta = _ok(c.get("/api/snapshots"))
    assert before == [] and meta["latest_version"] == 0
    job, _ = _ok(c.post("/api/snapshots/export"))
    assert (
        job["status"] == "succeeded"
        and job["result"]["version"] == 1
        and job["result"]["evidence_rows"] == 1
    )
    after, meta = _ok(c.get("/api/snapshots"))
    assert (
        meta["latest_version"] == 1
        and after[0]["version"] == 1
        and after[0]["families"]["evidence_snapshots"]["rows"] == 1
    )
    rows, _ = _ok(c.get("/api/evidence"))  # the live listing still works
    assert len(rows) == 1
    assert c.get("/api/meta/status").status_code == 200
