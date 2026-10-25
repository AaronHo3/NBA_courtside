"""``make_thumbnails``: one small JPEG every N seconds plus an index for timeline navigation."""

from __future__ import annotations

import json

from app.evidence import ffmpeg as ff
from app.evidence.registry import add_derivative, asset_allows, get_asset, latest_derivative
from app.evidence.storage import MediaStore, sha256_of
from app.jobs.handlers import JobContext, JobOutcome, NonRetryableError, register_handler
from app.jobs.handlers.make_playback import params_hash
from app.jobs.publish import atomic_publish

KIND = "thumbnail_sheet"
DEFAULT_EVERY_SECONDS = 1
WIDTH = 160


def make_thumbnails(ctx: JobContext) -> JobOutcome:
    asset_id = ctx.job.payload["asset_id"]
    version = int(ctx.job.payload.get("processing_version", 1))
    every = float(ctx.job.payload.get("every_seconds", DEFAULT_EVERY_SECONDS))
    asset = get_asset(ctx.state_db, asset_id)
    if asset is None or asset.get("kind") != "managed_original":
        raise NonRetryableError(f"asset {asset_id} is not a managed original")
    if not asset_allows(ctx.state_db, asset_id, "thumbnail"):
        raise NonRetryableError("the asset's permissions do not allow thumbnails")
    params = {"every_seconds": every, "width": WIDTH, "format": "jpg"}
    phash = params_hash(params)
    if (
        latest_derivative(
            ctx.state_db, asset_id, KIND, processing_version=version, params_hash=phash
        )
        is not None
    ):
        return JobOutcome("succeeded", {"asset_id": asset_id, "reused": True})
    if ff.ffmpeg_available() is None:
        raise NonRetryableError("ffmpeg is not installed; cannot make thumbnails")
    store = MediaStore(ctx.layout)
    playback = latest_derivative(ctx.state_db, asset_id, "playback_mp4")
    src = store.resolve(playback["storage_key"] if playback else asset["storage_key"])
    out_dir = ctx.workdir / "thumbs"
    out_dir.mkdir(parents=True, exist_ok=True)
    ctx.progress(0.1, "extracting frames")
    ff.run_ffmpeg(
        [
            "-i",
            str(src),
            "-vf",
            f"fps=1/{every:g},scale={WIDTH}:-2",
            "-q:v",
            "4",
            str(out_dir / "t_%04d.jpg"),
        ],
        timeout_s=600,
    )
    files = sorted(p.name for p in out_dir.glob("t_*.jpg"))
    if not files:
        raise NonRetryableError("no frames could be extracted")
    frames = [
        {"index": i, "t_ms": int(round(i * every * 1000)), "file": name}
        for i, name in enumerate(files)
    ]
    index = {"every_seconds": every, "width": WIDTH, "count": len(frames), "frames": frames}
    index_path = out_dir / "index.json"
    index_path.write_text(json.dumps(index))
    moves = [
        (out_dir / name, store.resolve(store.derived_key(asset_id, version, f"thumbs/{name}")))
        for name in files
    ]
    index_key = store.derived_key(asset_id, version, "thumbs/index.json")
    moves.append((index_path, store.resolve(index_key)))
    digest = sha256_of(index_path)
    ctx.progress(0.9, "publishing")

    def rows() -> None:
        add_derivative(
            ctx.state_db,
            asset_id=asset_id,
            kind=KIND,
            storage_key=index_key,
            processing_version=version,
            params=params,
            byte_size=sum(p.stat().st_size for p in out_dir.glob("t_*.jpg")),
            width=WIDTH,
            height=None,
            duration_ms=asset.get("duration_ms"),
            sha256=digest,
            job_id=ctx.job.job_id,
        )

    atomic_publish(ctx.state_db, moves=moves, rows=rows)
    return JobOutcome(
        "succeeded", {"asset_id": asset_id, "count": len(frames), "storage_key": index_key}
    )


register_handler("make_thumbnails", make_thumbnails)
