"""ffmpeg/ffprobe detection and bounded subprocess runs (media jobs never run inside a request)."""

import shutil
import threading
import time

import pytest

from app.evidence import ffmpeg as ff

HAVE = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def test_detection_reports_none_when_binaries_are_absent(monkeypatch):
    monkeypatch.setenv("PATH", "")
    assert ff.ffmpeg_available() is None


@pytest.mark.skipif(not HAVE, reason="ffmpeg not installed")
def test_detection_reports_versions():
    info = ff.ffmpeg_available()
    assert info is not None and info.ffmpeg.startswith("/") and info.version and info.ffprobe


@pytest.mark.skipif(not HAVE, reason="ffmpeg not installed")
def test_probe_reads_streams_of_a_generated_clip(tmp_path):
    clip = tmp_path / "t.mp4"
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
            str(clip),
        ],
        timeout_s=60,
    )
    probe = ff.run_ffprobe(clip)
    video = next(s for s in probe["streams"] if s["codec_type"] == "video")
    assert video["width"] == 160 and video["height"] == 120
    assert ff.frame_rate(video) == (25, 1) and ff.time_base(video)[1] > 0
    assert 900 <= ff.duration_ms(probe) <= 1100


@pytest.mark.skipif(not HAVE, reason="ffmpeg not installed")
def test_timeout_kills_the_process(tmp_path):
    started = time.monotonic()
    with pytest.raises(ff.MediaToolTimeoutError):
        ff.run_ffmpeg(
            [
                "-re",
                "-f",
                "lavfi",
                "-i",
                "testsrc=size=64x64:rate=25",
                "-t",
                "120",
                "-f",
                "null",
                "-",
            ],
            timeout_s=1,
        )
    assert time.monotonic() - started < 10


@pytest.mark.skipif(not HAVE, reason="ffmpeg not installed")
def test_cancel_event_stops_a_run(tmp_path):
    cancel = threading.Event()
    threading.Timer(0.5, cancel.set).start()
    with pytest.raises(ff.MediaToolCancelledError):
        ff.run_ffmpeg(
            [
                "-re",
                "-f",
                "lavfi",
                "-i",
                "testsrc=size=64x64:rate=25",
                "-t",
                "120",
                "-f",
                "null",
                "-",
            ],
            timeout_s=60,
            cancel=cancel,
        )


def test_probe_on_a_non_media_file_raises(tmp_path):
    bad = tmp_path / "x.mp4"
    bad.write_bytes(b"this is not a video")
    if not HAVE:
        pytest.skip("ffmpeg not installed")
    with pytest.raises(ff.MediaToolError):
        ff.run_ffprobe(bad)
