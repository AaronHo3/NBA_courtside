"""``probe_media``: read container/stream facts with ffprobe into the asset row; enforce media limits."""

from __future__ import annotations

import json

from app.evidence import ffmpeg as ff
from app.evidence.registry import asset_allows, get_asset, update_asset_fields
from app.evidence.storage import MediaStore
from app.jobs import queue as q
from app.jobs.handlers import JobContext, JobOutcome, NonRetryableError, register_handler


class ProbeRejectedError(NonRetryableError):
    pass


def _video_stream(probe: dict) -> dict:
    for s in probe.get("streams", []):
        if s.get("codec_type") == "video":
            return s
    raise ProbeRejectedError("no video stream")


def probe_media(ctx: JobContext) -> JobOutcome:
    asset_id = ctx.job.payload["asset_id"]
    asset = get_asset(ctx.state_db, asset_id)
    if asset is None or asset.get("kind") != "managed_original":
        raise ProbeRejectedError(f"asset {asset_id} is not a managed original")
    if ff.ffmpeg_available() is None:
        update_asset_fields(ctx.state_db, asset_id, status="failed")
        raise ProbeRejectedError(
            "ffmpeg/ffprobe are not installed on this machine; install them and re-run the probe"
        )
    path = MediaStore(ctx.layout).resolve(asset["storage_key"])
    ctx.progress(0.1, "probing")
    probe = ff.run_ffprobe(path)
    video = _video_stream(probe)
    audio = next((s for s in probe.get("streams", []) if s.get("codec_type") == "audio"), None)
    duration = ff.duration_ms(probe)
    width, height = int(video.get("width") or 0), int(video.get("height") or 0)
    fr = ff.frame_rate(video) or (None, None)
    tb = ff.time_base(video) or (None, None)
    r_rate, avg_rate = ff._ratio(video.get("r_frame_rate")), ff._ratio(video.get("avg_frame_rate"))
    vfr = bool(
        r_rate and avg_rate and abs(r_rate[0] / r_rate[1] - avg_rate[0] / avg_rate[1]) > 0.01
    )
    problems = []
    if duration is not None and duration > ctx.settings.media_max_duration_ms:
        problems.append(
            f"duration {duration} ms exceeds the limit of {ctx.settings.media_max_duration_ms} ms"
        )
    if width * height > ctx.settings.media_max_pixels:
        problems.append(
            f"frame size {width}x{height} exceeds the pixel limit of {ctx.settings.media_max_pixels}"
        )
    fields = dict(
        container=(probe.get("format") or {}).get("format_name"),
        video_codec=video.get("codec_name"),
        audio_codec=audio.get("codec_name") if audio else None,
        duration_ms=duration,
        width=width or None,
        height=height or None,
        frame_rate_num=fr[0],
        frame_rate_den=fr[1],
        time_base_num=tb[0],
        time_base_den=tb[1],
        variable_frame_rate=int(vfr),
        probe_json=json.dumps(probe)[:200_000],
        processing_version=1,
    )
    if problems:
        update_asset_fields(ctx.state_db, asset_id, status="failed", **fields)
        raise ProbeRejectedError("; ".join(problems))
    ctx.progress(0.9, "recording")
    update_asset_fields(ctx.state_db, asset_id, status="probed", **fields)
    # follow-ups the permissions allow; FIFO claiming runs playback before thumbnails
    queued = []
    for op, kind in (("playback_derivative", "make_playback"), ("thumbnail", "make_thumbnails")):
        if asset_allows(ctx.state_db, asset_id, op):
            q.enqueue(
                ctx.state_db,
                kind,
                {"asset_id": asset_id, "processing_version": 1},
                idempotency_key=f"asset:{asset_id}:{kind}:v1",
            )
            queued.append(kind)
    return JobOutcome(
        "succeeded",
        {
            "asset_id": asset_id,
            "duration_ms": duration,
            "width": width,
            "height": height,
            "variable_frame_rate": vfr,
            "queued": queued,
        },
    )


register_handler("probe_media", probe_media)
