"""make_playback / make_thumbnails: derivatives published atomically, permission-gated, chained after probe."""

import json
import shutil
import time

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.evidence import ffmpeg as ff
from app.jobs import queue as q
from app.main import create_app

HAVE = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None
pytestmark = pytest.mark.skipif(not HAVE, reason="ffmpeg not installed")


def _ok(resp, codes=(200, 201)):
    assert resp.status_code in codes, resp.text
    body = resp.json()
    assert body["success"] is True
    return body["data"], body["meta"]


@pytest.fixture(scope="module")
def clip(tmp_path_factory):
    path = tmp_path_factory.mktemp("clips") / "clip.mp4"
    ff.run_ffmpeg(
        [
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=320x240:rate=30",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440",
            "-t",
            "2",
            "-pix_fmt",
            "yuv420p",
            "-shortest",
            str(path),
        ],
        timeout_s=120,
    )
    return path


@pytest.fixture(scope="module")
def env(tmp_path_factory):
    from datetime import UTC, datetime

    from app.data.manifest import Manifest, ManifestEntry
    from app.data.paths import DataLayout

    root = tmp_path_factory.mktemp("mh")
    Manifest(namespace="nba").upsert(
        ManifestEntry(
            family="teams", status="ok", rows=30, fetched_at=datetime.now(UTC), source="test"
        )
    ).save(DataLayout(root, "nba"))
    settings = Settings(nba_data_dir=root, nba_namespace="nba", jobs_inline=True)
    app = create_app(settings=settings)
    with TestClient(app) as c:
        yield c, root, app


def _wait(client, asset_id, status, seconds=60):
    for _ in range(int(seconds / 0.1)):
        data, _ = _ok(client.get(f"/api/media/{asset_id}"))
        if data["asset"]["status"] == status:
            return data
        time.sleep(0.1)
    raise AssertionError(f"asset never reached {status}: {data['asset']['status']}")


def test_probe_chains_playback_and_thumbnails_and_publishes_derivatives(env, clip):
    client, root, app = env
    data, _ = _ok(
        client.post(
            "/api/media/uploads",
            files={"file": ("c.mp4", clip.read_bytes(), "video/mp4")},
            data={
                "permission_source": "user_upload",
                "allowed_operations": "view,playback_derivative,thumbnail",
            },
        )
    )
    aid = data["asset"]["asset_id"]
    _wait(
        client, aid, "ready"
    )  # playback publishes 'ready'; thumbnails follow in the same drained queue
    for _ in range(600):
        detail, _ = _ok(client.get(f"/api/media/{aid}"))
        kinds = {d["kind"]: d for d in detail["derivatives"]}
        if {"playback_mp4", "thumbnail_sheet"} <= set(kinds):
            break
        time.sleep(0.1)
    assert set(kinds) >= {"playback_mp4", "thumbnail_sheet"}, [
        j.as_dict() for j in q.list_jobs(app.state.state_db, kind="make_thumbnails")
    ]
    pb = kinds["playback_mp4"]
    assert (
        pb["storage_key"] == f"derived/{aid}/1/playback.mp4"
        and pb["width"] == 320
        and pb["height"] == 240
        and pb["sha256"]
    )
    assert (root / "nba" / "media" / pb["storage_key"]).exists()
    probe = ff.run_ffprobe(root / "nba" / "media" / pb["storage_key"])
    assert any(s["codec_name"] == "h264" for s in probe["streams"]) and any(
        s["codec_name"] == "aac" for s in probe["streams"]
    )
    th = kinds["thumbnail_sheet"]
    index = json.loads((root / "nba" / "media" / th["storage_key"]).read_text())
    assert index["every_seconds"] == 1 and index["count"] >= 2 and index["frames"][0]["t_ms"] == 0
    assert (
        root / "nba" / "media" / f"derived/{aid}/1/thumbs/{index['frames'][0]['file']}"
    ).exists()
    # the playback endpoint serves it and the thumbnail routes work
    pbr = client.get(f"/api/media/{aid}/playback", headers={"Range": "bytes=0-99"})
    assert pbr.status_code == 206 and len(pbr.content) == 100
    assert client.get(f"/api/media/{aid}/thumbs").json()["data"]["count"] == index["count"]
    assert client.get(f"/api/media/{aid}/thumbs/0").headers["content-type"].startswith("image/jpeg")
    assert client.get(f"/api/media/{aid}/thumbs/999").status_code == 404
    # idempotent: re-enqueueing the same version does not re-encode or duplicate rows
    state = app.state.state_db
    before = state.scalar("SELECT COUNT(*) FROM video_derivatives WHERE asset_id = ?", [aid])
    job = q.enqueue(
        state,
        "make_playback",
        {"asset_id": aid, "processing_version": 1},
        idempotency_key=f"asset:{aid}:playback:v1:again",
    )
    from app.data.paths import DataLayout
    from app.jobs.worker import Worker

    Worker(app.state.settings, DataLayout(root, "nba"), state, worker_id="w").run_once()
    assert (
        q.get_job(state, job.job_id).status == "succeeded"
        and q.get_job(state, job.job_id).result.get("reused") is True
    )
    assert (
        state.scalar("SELECT COUNT(*) FROM video_derivatives WHERE asset_id = ?", [aid]) == before
    )


def test_playback_is_not_made_without_the_permission(env, clip):
    client, root, app = env
    data, _ = _ok(
        client.post(
            "/api/media/uploads",
            files={"file": ("d.mp4", clip.read_bytes()[:-1] + b"\x00", "video/mp4")},
            data={"permission_source": "unknown"},
        )
    )
    aid = data["asset"]["asset_id"]
    probed = _wait(client, aid, "probed")
    assert probed["derivatives"] == []
    state = app.state.state_db
    jobs = q.list_jobs(state, kind="make_playback")
    assert not any(
        j.payload.get("asset_id") == aid for j in jobs
    )  # never enqueued without permission
    assert client.get(f"/api/media/{aid}/playback").status_code == 403


def test_a_failure_between_encode_and_commit_publishes_nothing(env, clip, monkeypatch):
    client, root, app = env
    import app.jobs.handlers.make_playback as mp

    def boom(*a, **k):
        raise RuntimeError("db down after encode")

    monkeypatch.setattr(mp, "add_derivative", boom)
    data, _ = _ok(
        client.post(
            "/api/media/uploads",
            files={"file": ("e.mp4", clip.read_bytes()[:-2] + b"\x00\x00", "video/mp4")},
            data={
                "permission_source": "user_upload",
                "allowed_operations": "view,playback_derivative",
            },
        )
    )
    aid = data["asset"]["asset_id"]
    state = app.state.state_db
    for _ in range(300):
        jobs = [
            j for j in q.list_jobs(state, kind="make_playback") if j.payload.get("asset_id") == aid
        ]
        if jobs and jobs[0].status in ("queued", "failed"):
            break
        time.sleep(0.1)
    assert jobs and jobs[0].status in ("queued", "failed") and "db down" in (jobs[0].error or "")
    assert state.scalar("SELECT COUNT(*) FROM video_derivatives WHERE asset_id = ?", [aid]) == 0
    assert not (root / "nba" / "media" / f"derived/{aid}/1/playback.mp4").exists()
