"""Inline mode (``JOBS_INLINE=1``): run queued jobs in a thread of the API process using the same table."""

from __future__ import annotations

import threading
from typing import Any

from app.config import Settings
from app.data.paths import DataLayout
from app.jobs import queue as q
from app.jobs.models import Job
from app.jobs.worker import Worker
from app.state.connection import StateDB


def run_inline(settings: Settings, layout: DataLayout, state_db: StateDB, job_id: str) -> None:
    worker = Worker(settings, layout, state_db, worker_id=f"inline:{job_id[-6:]}")
    while True:
        job = q.get_job(state_db, job_id)
        if job is None or job.status not in ("queued", "running"):
            break
        if not worker.run_once():
            return
    # handlers may enqueue follow-ups (probe -> playback -> thumbnails); drain them too
    while worker.run_once():
        pass


def enqueue_and_maybe_run(
    settings: Settings,
    layout: DataLayout,
    state_db: StateDB,
    kind: str,
    payload: dict[str, Any],
    *,
    idempotency_key: str,
    max_attempts: int = 3,
    wait: bool = False,
) -> Job:
    """Enqueue; in inline mode run it on a thread, or synchronously when ``wait`` (short jobs whose
    result the caller needs, such as snapshot export). Returns the job as last seen."""
    job = q.enqueue(
        state_db, kind, payload, idempotency_key=idempotency_key, max_attempts=max_attempts
    )
    if settings.jobs_inline and job.status == "queued" and wait:
        run_inline(settings, layout, state_db, job.job_id)
        return q.get_job(state_db, job.job_id) or job
    if settings.jobs_inline and job.status == "queued":
        threading.Thread(
            target=run_inline,
            args=(settings, layout, state_db, job.job_id),
            name=f"inline-{job.job_id}",
            daemon=True,
        ).start()
    return job
