"""``detect_shot_boundaries``: camera-cut proposals from ffmpeg's scene score; always ``unknown`` and unreviewed."""

from __future__ import annotations

import re

from app.evidence import ffmpeg as ff
from app.evidence.registry import asset_allows, get_asset, latest_derivative
from app.evidence.segments import create_segment, list_segments
from app.evidence.storage import MediaStore
from app.jobs.handlers import JobContext, JobOutcome, NonRetryableError, register_handler

MODEL_VERSION = "ffmpeg-scene@0.4"
THRESHOLD = 0.4
MIN_SEGMENT_MS = 300
_PTS = re.compile(r"pts_time:\s*(\d+(?:\.\d+)?)")


def cut_points_ms(stderr: str) -> list[int]:
    return sorted({int(round(float(m) * 1000)) for m in _PTS.findall(stderr)})


def segments_from_cuts(cuts: list[int], duration_ms: int) -> list[tuple[int, int]]:
    bounds = [0, *[c for c in cuts if 0 < c < duration_ms], duration_ms]
    out: list[tuple[int, int]] = []
    for start, end in zip(bounds, bounds[1:], strict=False):
        if end - start < MIN_SEGMENT_MS and out:
            out[-1] = (out[-1][0], end)  # too short to be a shot: merge into the previous one
        elif end > start:
            out.append((start, end))
    return out


def detect_shot_boundaries(ctx: JobContext) -> JobOutcome:
    asset_id = ctx.job.payload["asset_id"]
    asset = get_asset(ctx.state_db, asset_id)
    if asset is None or asset.get("kind") != "managed_original":
        raise NonRetryableError(f"asset {asset_id} is not a managed original")
    if not asset_allows(ctx.state_db, asset_id, "thumbnail"):
        raise NonRetryableError("the asset's permissions do not allow shot-boundary analysis")
    existing = [
        s
        for s in list_segments(ctx.state_db, asset_id)
        if s["origin"] == "shot_boundary_model" and s["model_version"] == MODEL_VERSION
    ]
    if existing:
        return JobOutcome(
            "succeeded",
            {"asset_id": asset_id, "proposed": 0, "reused": True, "existing": len(existing)},
        )
    if ff.ffmpeg_available() is None:
        raise NonRetryableError("ffmpeg is not installed")
    store = MediaStore(ctx.layout)
    playback = latest_derivative(ctx.state_db, asset_id, "playback_mp4")
    src = store.resolve(playback["storage_key"] if playback else asset["storage_key"])
    duration = asset.get("duration_ms") or ff.duration_ms(ff.run_ffprobe(src))
    if not duration:
        raise NonRetryableError("asset duration is unknown; probe it first")
    ctx.progress(0.1, "scanning for cuts")
    stderr = ff.run_ffmpeg(
        [
            "-i",
            str(src),
            "-vf",
            f"select='gt(scene,{THRESHOLD})',showinfo",
            "-an",
            "-f",
            "null",
            "-",
        ],
        timeout_s=900,
    )
    cuts = cut_points_ms(stderr)
    proposals = segments_from_cuts(cuts, int(duration))
    ctx.progress(0.8, "recording proposals")
    for start, end in proposals:
        create_segment(
            ctx.state_db,
            asset_id=asset_id,
            media_start_ms=start,
            media_end_ms=end,
            classification="unknown",
            origin="shot_boundary_model",
            model_version=MODEL_VERSION,
            created_by=f"worker:{ctx.job.kind}",
        )
    return JobOutcome(
        "succeeded",
        {
            "asset_id": asset_id,
            "proposed": len(proposals),
            "cuts_ms": cuts,
            "model_version": MODEL_VERSION,
        },
    )


register_handler("detect_shot_boundaries", detect_shot_boundaries)
