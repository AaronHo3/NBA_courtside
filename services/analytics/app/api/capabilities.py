"""What this machine can do: media tools, CV runtime, LLM provider, worker. Read once by the UI."""

from __future__ import annotations

from typing import Any

from app.config import Settings
from app.evidence.ffmpeg import ffmpeg_available
from app.jobs.worker import worker_alive
from app.state.connection import StateDB


def detect_ffmpeg() -> dict[str, Any]:
    info = ffmpeg_available()
    if info is None:
        return {"available": False, "version": None, "ffprobe": False}
    return {"available": True, "version": info.version, "ffprobe": True}


def capabilities(state_db: StateDB, settings: Settings) -> dict[str, Any]:
    return {
        "ffmpeg": detect_ffmpeg(),
        "cv_runtime": False,
        "llm_provider": "none",
        "worker_alive": worker_alive(
            state_db, stale_after_seconds=settings.jobs_worker_stale_seconds
        ),
        "jobs": {
            "inline": settings.jobs_inline,
            "queued": int(
                state_db.scalar("SELECT COUNT(*) FROM processing_jobs WHERE status = 'queued'") or 0
            ),
            "running": int(
                state_db.scalar("SELECT COUNT(*) FROM processing_jobs WHERE status = 'running'")
                or 0
            ),
        },
        "video_sources": [s.strip() for s in settings.video_sources.split(",") if s.strip()],
        "state_db": {"namespace": state_db.namespace, "schema_version": state_db.schema_version},
        "media_limits": {
            "max_upload_bytes": settings.media_max_upload_bytes,
            "max_duration_ms": settings.media_max_duration_ms,
            "max_pixels": settings.media_max_pixels,
            "purge_after_days": settings.media_purge_after_days,
            "reference_stale_after_days": settings.media_reference_stale_after_days,
        },
    }
