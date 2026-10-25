"""``make_playback``: browser-playable H.264/AAC derivative, constant frame rate when the source is variable."""

from __future__ import annotations

import hashlib
import json

from app.evidence import ffmpeg as ff
from app.evidence.registry import (
    add_derivative,
    asset_allows,
    get_asset,
    latest_derivative,
    update_asset_fields,
)
from app.evidence.storage import MediaStore, sha256_of
from app.jobs.handlers import JobContext, JobOutcome, NonRetryableError, register_handler
from app.jobs.publish import atomic_publish

KIND = "playback_mp4"


def playback_params(asset: dict) -> dict:
    return {
        "vcodec": "libx264",
        "preset": "veryfast",
        "crf": 23,
        "pix_fmt": "yuv420p",
        "acodec": "aac",
        "audio_bitrate": "128k",
        "faststart": True,
        "cfr": bool(asset.get("variable_frame_rate")),
    }


def params_hash(params: dict) -> str:
    return hashlib.sha1(json.dumps(params, sort_keys=True, default=str).encode()).hexdigest()[:12]


def make_playback(ctx: JobContext) -> JobOutcome:
    asset_id = ctx.job.payload["asset_id"]
    version = int(ctx.job.payload.get("processing_version", 1))
    asset = get_asset(ctx.state_db, asset_id)
    if asset is None or asset.get("kind") != "managed_original":
        raise NonRetryableError(f"asset {asset_id} is not a managed original")
    if not asset_allows(ctx.state_db, asset_id, "playback_derivative"):
        raise NonRetryableError("the asset's permissions do not allow a playback derivative")
    params = playback_params(asset)
    phash = params_hash(params)
    if (
        latest_derivative(
            ctx.state_db, asset_id, KIND, processing_version=version, params_hash=phash
        )
        is not None
    ):
        return JobOutcome("succeeded", {"asset_id": asset_id, "reused": True})
    if ff.ffmpeg_available() is None:
        raise NonRetryableError("ffmpeg is not installed; cannot make a playback derivative")
    store = MediaStore(ctx.layout)
    src = store.resolve(asset["storage_key"])
    out = ctx.workdir / "playback.mp4"
    ctx.progress(0.05, "encoding")
    duration_s = (asset.get("duration_ms") or 0) / 1000
    args = [
        "-i",
        str(src),
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        params["vcodec"],
        "-preset",
        params["preset"],
        "-crf",
        str(params["crf"]),
        "-pix_fmt",
        params["pix_fmt"],
        "-c:a",
        params["acodec"],
        "-b:a",
        params["audio_bitrate"],
        "-movflags",
        "+faststart",
    ]
    if params["cfr"]:
        args += ["-fps_mode", "cfr"]
    ff.run_ffmpeg([*args, str(out)], timeout_s=max(600.0, 3 * duration_s + 120))
    ctx.progress(0.85, "publishing")
    probe = ff.run_ffprobe(out)
    video = next(s for s in probe["streams"] if s["codec_type"] == "video")
    key = store.derived_key(asset_id, version, "playback.mp4")
    size, digest, duration = out.stat().st_size, sha256_of(out), ff.duration_ms(probe)

    def rows() -> None:
        add_derivative(
            ctx.state_db,
            asset_id=asset_id,
            kind=KIND,
            storage_key=key,
            processing_version=version,
            params=params,
            byte_size=size,
            width=int(video.get("width") or 0) or None,
            height=int(video.get("height") or 0) or None,
            duration_ms=duration,
            sha256=digest,
            job_id=ctx.job.job_id,
        )
        update_asset_fields(ctx.state_db, asset_id, status="ready", processing_version=version)

    atomic_publish(ctx.state_db, moves=[(out, store.resolve(key))], rows=rows)
    return JobOutcome(
        "succeeded",
        {"asset_id": asset_id, "storage_key": key, "byte_size": size, "duration_ms": duration},
    )


register_handler("make_playback", make_playback)
