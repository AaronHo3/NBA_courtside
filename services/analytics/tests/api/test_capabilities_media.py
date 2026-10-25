import shutil


def test_capabilities_describe_media_tools(client):
    data = client.get("/api/meta/capabilities").json()["data"]
    have = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None
    assert data["ffmpeg"]["available"] is have
    assert set(data["ffmpeg"]) >= {"available", "version", "ffprobe"}
    assert set(data["media_limits"]) == {
        "max_upload_bytes",
        "max_duration_ms",
        "max_pixels",
        "purge_after_days",
        "reference_stale_after_days",
    }
