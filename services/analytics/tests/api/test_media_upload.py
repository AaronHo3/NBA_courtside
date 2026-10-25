"""Uploads: streamed, size-capped, content-sniffed, deduplicated by hash, permission captured, probe job run."""

import shutil
import time

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.evidence import ffmpeg as ff
from app.main import create_app

HAVE = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def _ok(resp, codes=(200, 201)):
    assert resp.status_code in codes, resp.text
    body = resp.json()
    assert body["success"] is True
    return body["data"], body["meta"]


@pytest.fixture(scope="module")
def media_root(tmp_path_factory):
    return tmp_path_factory.mktemp("media")


@pytest.fixture(scope="module")
def mclient(media_root):
    """Real namespace, inline jobs, small limits so caps are testable."""
    from datetime import UTC, datetime

    from app.data.manifest import Manifest, ManifestEntry
    from app.data.paths import DataLayout

    Manifest(namespace="nba").upsert(
        ManifestEntry(
            family="teams", status="ok", rows=30, fetched_at=datetime.now(UTC), source="test"
        )
    ).save(DataLayout(media_root, "nba"))
    settings = Settings(
        nba_data_dir=media_root,
        nba_namespace="nba",
        jobs_inline=True,
        media_max_upload_bytes=5_000_000,
        media_max_duration_ms=10_000,
    )
    with TestClient(create_app(settings=settings)) as c:
        yield c


@pytest.fixture(scope="module")
def clip(tmp_path_factory):
    if not HAVE:
        pytest.skip("ffmpeg not installed")
    path = tmp_path_factory.mktemp("clips") / "clip.mp4"
    ff.run_ffmpeg(
        [
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=160x120:rate=25",
            "-t",
            "1",
            "-pix_fmt",
            "yuv420p",
            str(path),
        ],
        timeout_s=60,
    )
    return path


def _wait_probed(client, asset_id, seconds=10):
    for _ in range(int(seconds / 0.05)):
        data, _ = _ok(client.get(f"/api/media/{asset_id}"))
        if data["asset"]["status"] in ("probed", "failed", "ready"):
            return data
        time.sleep(0.05)
    raise AssertionError("probe job did not finish")


def test_oversize_declared_upload_is_refused_before_reading(mclient):
    r = mclient.post(
        "/api/media/uploads",
        files={"file": ("big.mp4", b"x" * 10, "video/mp4")},
        data={"permission_source": "user_upload", "allowed_operations": "view"},
        headers={"Content-Length": "6000000"},
    )
    assert r.status_code in (413, 422)


def test_non_media_is_refused_and_nothing_is_kept(mclient, media_root):
    if not HAVE:
        pytest.skip("content sniffing needs ffprobe")
    r = mclient.post(
        "/api/media/uploads",
        files={"file": ("../../evil.mp4", b"definitely not a video" * 100, "video/mp4")},
        data={"permission_source": "user_upload", "allowed_operations": "view,playback_derivative"},
    )
    assert r.status_code == 415
    assert (
        not list((media_root / "nba" / "media").rglob("*.mp4"))
        if (media_root / "nba" / "media").exists()
        else True
    )
    assert _ok(mclient.get("/api/media"))[1]["total"] == 0


def test_valid_upload_registers_asset_permission_and_probe(mclient, media_root, clip):
    r = mclient.post(
        "/api/media/uploads",
        files={"file": ("my clip (1).mp4", clip.read_bytes(), "video/mp4")},
        data={
            "permission_source": "user_upload",
            "authorization_ref": "my own recording",
            "allowed_operations": "view,playback_derivative,thumbnail,cv_processing",
            "notes": "test",
        },
    )
    data, _ = _ok(r, (201,))
    asset = data["asset"]
    assert (
        asset["kind"] == "managed_original"
        and asset["storage_key"].startswith("originals/")
        and asset["storage_key"].endswith(".mp4")
    )
    assert (
        asset["original_filename"] == "my_clip_1_.mp4"
        and asset["byte_size"] == clip.stat().st_size
        and len(asset["sha256"]) == 64
    )
    assert (media_root / "nba" / "media" / asset["storage_key"]).exists()
    assert data["permissions"][0]["allowed_operations"] == [
        "view",
        "playback_derivative",
        "thumbnail",
        "cv_processing",
    ]
    assert data["permissions"][0]["permission_status"] == "known"
    assert data["job"]["kind"] == "probe_media"
    probed = _wait_probed(mclient, asset["asset_id"])
    a = probed["asset"]
    assert a["status"] == "probed" and a["width"] == 160 and a["height"] == 120
    assert a["frame_rate_num"] == 25 and a["frame_rate_den"] == 1 and a["time_base_den"] > 0
    assert 900 <= a["duration_ms"] <= 1100 and a["video_codec"] and a["container"]
    assert probed["job"]["status"] == "succeeded"


def test_duplicate_upload_returns_the_existing_asset(mclient, clip):
    first, _ = _ok(
        mclient.post(
            "/api/media/uploads",
            files={"file": ("a.mp4", clip.read_bytes(), "video/mp4")},
            data={"permission_source": "user_upload", "allowed_operations": "view"},
        )
    )
    second = mclient.post(
        "/api/media/uploads",
        files={"file": ("b.mp4", clip.read_bytes(), "video/mp4")},
        data={
            "permission_source": "dataset:sportsmot",
            "authorization_ref": "CC BY-NC 4.0",
            "allowed_operations": "view,cv_processing",
        },
    )
    data, meta = _ok(second, (200,))
    assert data["asset"]["asset_id"] == first["asset"]["asset_id"] and meta["created"] is False
    assert len(data["permissions"]) >= 2 and _ok(mclient.get("/api/media"))[1]["total"] == 1


def test_permission_unknown_when_no_operations_are_granted(mclient, clip):
    data, _ = _ok(
        mclient.post(
            "/api/media/uploads",
            files={"file": ("c.mp4", clip.read_bytes(), "video/mp4")},
            data={"permission_source": "unknown"},
        )
    )
    latest = data["permissions"][-1]
    assert latest["permission_status"] == "unknown" and latest["allowed_operations"] == []


def test_soft_delete_hides_the_asset(mclient, clip):
    data, _ = _ok(
        mclient.post(
            "/api/media/uploads",
            files={"file": ("d.mp4", clip.read_bytes(), "video/mp4")},
            data={"permission_source": "user_upload", "allowed_operations": "view"},
        )
    )
    aid = data["asset"]["asset_id"]
    _ok(mclient.delete(f"/api/media/{aid}"))
    assert mclient.get(f"/api/media/{aid}").status_code == 404
    assert _ok(mclient.get("/api/media"))[1]["total"] == 0


def test_probe_rejects_media_over_the_duration_limit(media_root, tmp_path):
    if not HAVE:
        pytest.skip("ffmpeg not installed")
    from app.data.paths import DataLayout
    from app.evidence.registry import get_asset, register_managed_asset
    from app.evidence.storage import MediaStore
    from app.jobs import queue as q
    from app.jobs.worker import Worker
    from app.state.connection import open_state_db

    layout = DataLayout(tmp_path / "d", "nba")
    long_clip = tmp_path / "long.mp4"
    ff.run_ffmpeg(
        [
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=64x64:rate=25",
            "-t",
            "3",
            "-pix_fmt",
            "yuv420p",
            str(long_clip),
        ],
        timeout_s=60,
    )
    store = MediaStore(layout)
    import io

    res = store.write_atomic("incoming/x.mp4", io.BytesIO(long_clip.read_bytes()))
    key = store.promote_original(res.path, res.sha256, "mp4")
    state = open_state_db(layout)
    try:
        asset = register_managed_asset(
            state,
            sha256=res.sha256,
            storage_key=key,
            original_filename="long.mp4",
            byte_size=res.byte_size,
            container="mp4",
        )
        settings = Settings(
            nba_data_dir=tmp_path / "d", nba_namespace="nba", media_max_duration_ms=1000
        )
        job = q.enqueue(
            state,
            "probe_media",
            {"asset_id": asset["asset_id"]},
            idempotency_key=f"asset:{asset['asset_id']}:probe:v1",
        )
        Worker(settings, layout, state, worker_id="w").run_once()
        got = q.get_job(state, job.job_id)
        assert got.status == "failed" and "duration" in got.error
        assert get_asset(state, asset["asset_id"])["status"] == "failed"
    finally:
        state.close()
