import io

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.data.paths import DataLayout
from app.evidence.registry import add_permission, register_managed_asset, update_asset_fields
from app.evidence.storage import MediaStore
from app.main import create_app
from app.state.connection import open_state_db


def _ok(resp, codes=(200, 201)):
    assert resp.status_code in codes, resp.text
    body = resp.json()
    assert body["success"] is True
    return body["data"], body["meta"]


@pytest.fixture(scope="module")
def setup(tmp_path_factory):
    root = tmp_path_factory.mktemp("seg")
    layout = DataLayout(root, "nba")
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
        update_asset_fields(db, asset["asset_id"], duration_ms=200_000)
        add_permission(
            db,
            asset_id=asset["asset_id"],
            source="user_upload",
            allowed_operations=["view"],
            permission_status="known",
        )
    finally:
        db.close()
    with TestClient(create_app(settings=Settings(nba_data_dir=root, nba_namespace="nba"))) as c:
        yield c, asset["asset_id"]


def test_segments_anchors_and_validation_over_the_api(setup):
    c, aid = setup
    seg, _ = _ok(
        c.post(
            f"/api/media/{aid}/segments",
            json={
                "media_start_ms": 0,
                "media_end_ms": 100_000,
                "classification": "live",
                "view": "broadcast",
            },
        )
    )
    assert seg["origin"] == "manual"
    assert (
        c.post(
            f"/api/media/{aid}/segments",
            json={"media_start_ms": 10, "media_end_ms": 5, "classification": "live"},
        ).status_code
        == 422
    )
    patched, _ = _ok(
        c.patch(
            f"/api/media/{aid}/segments/{seg['segment_id']}",
            json={"review_status": "reviewed_ok", "reviewer": "aaron"},
        )
    )
    assert patched["review_status"] == "reviewed_ok"
    a1, _ = _ok(
        c.post(
            f"/api/media/{aid}/anchors",
            json={
                "media_pts_ms": 1_000,
                "period": 1,
                "clock_ms": 700_000,
                "method": "manual",
                "error_ms": 120,
            },
        )
    )
    a2, _ = _ok(
        c.post(
            f"/api/media/{aid}/anchors",
            json={
                "media_pts_ms": 61_000,
                "period": 1,
                "clock_ms": 640_000,
                "method": "manual",
                "error_ms": 120,
            },
        )
    )
    assert a1["segment_id"] == seg["segment_id"] and a2["segment_id"] == seg["segment_id"]
    assert (
        c.post(
            f"/api/media/{aid}/anchors",
            json={"media_pts_ms": 150_000, "period": 1, "clock_ms": 600_000, "method": "manual"},
        ).status_code
        == 422
    )
    anchors, _ = _ok(c.get(f"/api/media/{aid}/anchors"))
    assert len(anchors) == 2
    placed, meta = _ok(
        c.get(f"/api/media/{aid}/alignment/place", params={"period": 1, "clock_ms": 670_000})
    )
    assert (
        placed["method"] == "interpolated"
        and 30_000 < placed["media_ms"] < 32_000
        and placed["timing_error_ms"] > 120
    )
    none, meta = _ok(
        c.get(f"/api/media/{aid}/alignment/place", params={"period": 2, "clock_ms": 670_000})
    )
    assert none is None and "reason" in meta
    report, _ = _ok(c.get(f"/api/media/{aid}/alignment/validate"))
    assert report["ok"] is True and len(report["rules"]) >= 5
    reviewed, _ = _ok(
        c.patch(
            f"/api/media/{aid}/anchors/{a1['anchor_id']}",
            json={"review_status": "reviewed_ok", "reviewer": "aaron"},
        )
    )
    assert reviewed["review_status"] == "reviewed_ok"
