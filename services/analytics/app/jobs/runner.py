"""Execute one claimed job: heartbeat thread, handler call, outcome mapping, scratch cleanup."""

from __future__ import annotations

import logging
import shutil
import threading

from app.config import Settings
from app.data.paths import DataLayout
from app.evidence.ffmpeg import MediaToolCancelledError
from app.jobs import queue as q
from app.jobs.handlers import HANDLERS, JobCancelled, JobContext, NonRetryableError
from app.jobs.models import Job
from app.state.connection import StateDB

log = logging.getLogger("nba.jobs")


def _heartbeat_loop(ctx: JobContext, stop: threading.Event) -> None:
    interval = max(0.2, ctx.lease_seconds / 3)
    while not stop.wait(interval):
        try:
            q.heartbeat(
                ctx.state_db,
                ctx.job.job_id,
                worker_id=ctx.worker_id,
                lease_seconds=ctx.lease_seconds,
            )
        except q.LeaseError:
            log.warning("lost the lease on job %s", ctx.job.job_id)
            return


def execute(
    job: Job,
    state_db: StateDB,
    layout: DataLayout,
    settings: Settings,
    *,
    worker_id: str,
    lease_seconds: float,
) -> Job:
    handler = HANDLERS.get(job.kind)
    if handler is None:
        q.fail(state_db, job.job_id, f"unknown job kind {job.kind!r}", retry=False)
        return q.get_job(state_db, job.job_id)
    workdir = layout.media_dir / "incoming" / "jobs" / job.job_id
    workdir.mkdir(parents=True, exist_ok=True)
    ctx = JobContext(
        job=job,
        state_db=state_db,
        layout=layout,
        settings=settings,
        workdir=workdir,
        worker_id=worker_id,
        lease_seconds=lease_seconds,
    )
    stop = threading.Event()
    beat = threading.Thread(
        target=_heartbeat_loop, args=(ctx, stop), name=f"heartbeat-{job.job_id}", daemon=True
    )
    beat.start()
    try:
        outcome = handler(ctx)
        q.complete(state_db, job.job_id, outcome.result, status=outcome.status)
    except (JobCancelled, MediaToolCancelledError):
        q.mark_cancelled(state_db, job.job_id)
    except NonRetryableError as exc:
        log.warning("job %s (%s) rejected: %s", job.job_id, job.kind, exc)
        q.fail(state_db, job.job_id, f"{type(exc).__name__}: {exc}", retry=False)
    except Exception as exc:  # noqa: BLE001 - every failure becomes a recorded job failure
        log.exception("job %s (%s) failed", job.job_id, job.kind)
        q.fail(state_db, job.job_id, f"{type(exc).__name__}: {exc}")
    finally:
        stop.set()
        beat.join(timeout=5)
        shutil.rmtree(workdir, ignore_errors=True)
    return q.get_job(state_db, job.job_id)
