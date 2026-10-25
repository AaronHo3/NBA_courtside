"""detect_shot_boundaries: camera-cut proposals for review, never auto-reviewed, permission-gated."""

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
def two_shot_clip(tmp_path_factory):
    d = tmp_path_factory.mktemp("cuts")
    a, b, out = d / "a.mp4", d / "b.mp4", d / "ab.mp4"
    ff.run_ffmpeg(
        [
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=160x120:rate=25",
            "-t",
            "2",
            "-pix_fmt",
            "yuv420p",
            str(a),
        ],
        timeout_s=60,
    )
    ff.run_ffmpeg(
        [
            "-f",
            "lavfi",
            "-i",
            "smptebars=size=160x120:rate=25",
            "-t",
            "2",
            "-pix_fmt",
            "yuv420p",
            str(b),
        ],
        timeout_s=60,
    )
    (d / "list.txt").write_text(f"file '{a}'\nfile '{b}'\n")
    ff.run_ffmpeg(
        ["-f", "concat", "-safe", "0", "-i", str(d / "list.txt"), "-c", "copy", str(out)],
        timeout_s=60,
    )
    return out


@pytest.fixture(scope="module")
def env(tmp_path_factory):
    from datetime import UTC, datetime

    from app.data.manifest import Manifest, ManifestEntry
    from app.data.paths import DataLayout

    root = tmp_path_factory.mktemp("sb")
    Manifest(namespace="nba").upsert(
        ManifestEntry(
            family="teams", status="ok", rows=30, fetched_at=datetime.now(UTC), source="test"
        )
    ).save(DataLayout(root, "nba"))
    app = create_app(settings=Settings(nba_data_dir=root, nba_namespace="nba", jobs_inline=True))
    with TestClient(app) as c:
        yield c, app


def _wait_jobs(app, kind, asset_id, seconds=60):
    state = app.state.state_db
    for _ in range(int(seconds / 0.1)):
        jobs = [j for j in q.list_jobs(state, kind=kind) if j.payload.get("asset_id") == asset_id]
        if jobs and jobs[0].status not in ("queued", "running"):
            return jobs[0]
        time.sleep(0.1)
    raise AssertionError("job did not finish")


def test_cut_detection_proposes_segments_for_review(env, two_shot_clip):
    client, app = env
    data, _ = _ok(
        client.post(
            "/api/media/uploads",
            files={"file": ("ab.mp4", two_shot_clip.read_bytes(), "video/mp4")},
            data={"permission_source": "user_upload", "allowed_operations": "view,thumbnail"},
        )
    )
    aid = data["asset"]["asset_id"]
    _wait_jobs(app, "probe_media", aid)
    job, _ = _ok(client.post(f"/api/media/{aid}/jobs/detect-boundaries"), (202,))
    finished = _wait_jobs(app, "detect_shot_boundaries", aid)
    assert finished.status == "succeeded" and finished.result["proposed"] == 2
    segs, _ = _ok(client.get(f"/api/media/{aid}/segments"))
    assert len(segs) == 2 and all(
        s["origin"] == "shot_boundary_model"
        and s["classification"] == "unknown"
        and s["review_status"] == "unreviewed"
        for s in segs
    )
    assert (
        segs[0]["media_start_ms"] == 0
        and 1_500 <= segs[0]["media_end_ms"] <= 2_500
        and segs[1]["media_start_ms"] == segs[0]["media_end_ms"]
    )
    # re-running proposes nothing new
    again, _ = _ok(client.post(f"/api/media/{aid}/jobs/detect-boundaries"), (202,))
    _wait_jobs(app, "detect_shot_boundaries", aid)
    assert len(_ok(client.get(f"/api/media/{aid}/segments"))[0]) == 2


def test_detection_needs_the_thumbnail_permission(env, two_shot_clip):
    client, app = env
    data, _ = _ok(
        client.post(
            "/api/media/uploads",
            files={"file": ("ab2.mp4", two_shot_clip.read_bytes()[:-1] + b"\x00", "video/mp4")},
            data={"permission_source": "unknown"},
        )
    )
    aid = data["asset"]["asset_id"]
    _wait_jobs(app, "probe_media", aid)
    assert client.post(f"/api/media/{aid}/jobs/detect-boundaries").status_code == 403
