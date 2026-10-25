"""Queue operations on ``processing_jobs``: every state change is one SQLite transaction plus an event."""

from __future__ import annotations

import json
import random
from datetime import UTC, datetime, timedelta
from typing import Any

from app.jobs.models import TERMINAL, Job
from app.state.connection import StateDB
from app.state.ids import new_ulid

BACKOFF_BASE_SECONDS = 2.0
BACKOFF_CAP_SECONDS = 60.0
_rng = random.Random()


class LeaseError(RuntimeError):
    """The caller does not hold the job's lease."""


def _now(now: datetime | None) -> datetime:
    return now or datetime.now(UTC)


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _event(db: StateDB, job_id: str, type_: str, at: datetime, detail: dict | None = None) -> None:
    db.execute(
        "INSERT INTO job_events (event_id, job_id, at, type, detail_json) VALUES (?, ?, ?, ?, ?)",
        [new_ulid(), job_id, at.isoformat(), type_, json.dumps(detail) if detail else None],
    )


def get_job(db: StateDB, job_id: str) -> Job | None:
    rows = db.query(
        "SELECT * FROM processing_jobs WHERE job_id = ? AND namespace = ?", [job_id, db.namespace]
    )
    return Job.from_row(rows[0]) if rows else None


def events(db: StateDB, job_id: str) -> list[dict[str, Any]]:
    # rowid is insertion order; ULIDs minted in the same millisecond are not mutually ordered
    rows = db.query("SELECT * FROM job_events WHERE job_id = ? ORDER BY rowid", [job_id])
    return [
        {**r, "detail": json.loads(r["detail_json"]) if r["detail_json"] else None} for r in rows
    ]


def list_jobs(
    db: StateDB, *, status: str | None = None, kind: str | None = None, limit: int = 100
) -> list[Job]:
    where, params = ["namespace = ?"], [db.namespace]
    if status:
        where.append("status = ?")
        params.append(status)
    if kind:
        where.append("kind = ?")
        params.append(kind)
    rows = db.query(
        f"SELECT * FROM processing_jobs WHERE {' AND '.join(where)} ORDER BY created_at DESC, job_id DESC LIMIT ?",
        [*params, int(limit)],
    )
    return [Job.from_row(r) for r in rows]


def enqueue(
    db: StateDB,
    kind: str,
    payload: dict[str, Any],
    *,
    idempotency_key: str,
    max_attempts: int = 3,
    next_run_at: datetime | None = None,
    now: datetime | None = None,
) -> Job:
    """Create a job, or return the existing one with the same key (any status)."""
    rows = db.query(
        "SELECT * FROM processing_jobs WHERE namespace = ? AND idempotency_key = ?",
        [db.namespace, idempotency_key],
    )
    if rows:
        return Job.from_row(rows[0])
    at = _now(now)
    job_id = new_ulid()
    with db.transaction():
        db.execute(
            """INSERT INTO processing_jobs (job_id, namespace, kind, idempotency_key, payload_json, status, attempt, max_attempts,
                   next_run_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?, ?)""",
            [
                job_id,
                db.namespace,
                kind,
                idempotency_key,
                json.dumps(payload, default=str),
                int(max_attempts),
                _iso(next_run_at or at),
                at.isoformat(),
                at.isoformat(),
            ],
        )
        _event(db, job_id, "enqueued", at, {"kind": kind})
    return get_job(db, job_id)


def claim_next(
    db: StateDB, *, worker_id: str, lease_seconds: float, now: datetime | None = None
) -> Job | None:
    at = _now(now)
    with db.transaction():
        rows = db.query(
            """SELECT job_id FROM processing_jobs WHERE namespace = ? AND status = 'queued' AND next_run_at <= ?
               ORDER BY created_at, job_id LIMIT 1""",
            [db.namespace, at.isoformat()],
        )
        if not rows:
            return None
        job_id = rows[0]["job_id"]
        lease = at + timedelta(seconds=lease_seconds)
        db.execute(
            """UPDATE processing_jobs SET status = 'running', locked_by = ?, lease_until = ?, attempt = attempt + 1,
                   started_at = COALESCE(started_at, ?), updated_at = ? WHERE job_id = ?""",
            [worker_id, lease.isoformat(), at.isoformat(), at.isoformat(), job_id],
        )
        _event(db, job_id, "claimed", at, {"worker_id": worker_id})
    return get_job(db, job_id)


def heartbeat(
    db: StateDB,
    job_id: str,
    *,
    worker_id: str,
    lease_seconds: float,
    progress: float | None = None,
    note: str | None = None,
    now: datetime | None = None,
) -> None:
    at = _now(now)
    with db.transaction():
        cur = db.execute(
            """UPDATE processing_jobs SET lease_until = ?, updated_at = ?,
                   progress = COALESCE(?, progress), progress_note = COALESCE(?, progress_note)
               WHERE job_id = ? AND namespace = ? AND status = 'running' AND locked_by = ?""",
            [
                (at + timedelta(seconds=lease_seconds)).isoformat(),
                at.isoformat(),
                progress,
                note,
                job_id,
                db.namespace,
                worker_id,
            ],
        )
        if cur.rowcount == 0:
            raise LeaseError(f"worker {worker_id} does not hold the lease on job {job_id}")


def complete(
    db: StateDB,
    job_id: str,
    result: dict[str, Any] | None,
    *,
    status: str = "succeeded",
    now: datetime | None = None,
) -> None:
    if status not in ("succeeded", "partial"):
        raise ValueError("complete() accepts succeeded or partial")
    at = _now(now)
    with db.transaction():
        db.execute(
            """UPDATE processing_jobs SET status = ?, result_json = ?, locked_by = NULL, lease_until = NULL, progress = 1.0,
                   finished_at = ?, updated_at = ? WHERE job_id = ? AND namespace = ?""",
            [
                status,
                json.dumps(result or {}, default=str),
                at.isoformat(),
                at.isoformat(),
                job_id,
                db.namespace,
            ],
        )
        _event(db, job_id, status, at)


def backoff_seconds(attempt: int) -> float:
    base = min(BACKOFF_CAP_SECONDS, BACKOFF_BASE_SECONDS * (2 ** max(0, attempt - 1)))
    return base + _rng.uniform(0, base / 2)


def fail(
    db: StateDB, job_id: str, error: str, *, retry: bool = True, now: datetime | None = None
) -> None:
    at = _now(now)
    job = get_job(db, job_id)
    if job is None:
        raise KeyError(job_id)
    with db.transaction():
        if retry and job.attempt < job.max_attempts:
            delay = backoff_seconds(job.attempt)
            db.execute(
                """UPDATE processing_jobs SET status = 'queued', error = ?, locked_by = NULL, lease_until = NULL,
                       next_run_at = ?, updated_at = ? WHERE job_id = ?""",
                [error[:2000], (at + timedelta(seconds=delay)).isoformat(), at.isoformat(), job_id],
            )
            _event(
                db,
                job_id,
                "retry_scheduled",
                at,
                {"attempt": job.attempt, "delay_seconds": round(delay, 2), "error": error[:300]},
            )
        else:
            db.execute(
                """UPDATE processing_jobs SET status = 'failed', error = ?, locked_by = NULL, lease_until = NULL,
                       finished_at = ?, updated_at = ? WHERE job_id = ?""",
                [error[:2000], at.isoformat(), at.isoformat(), job_id],
            )
            _event(db, job_id, "failed", at, {"attempt": job.attempt, "error": error[:300]})


def cancel(db: StateDB, job_id: str, *, now: datetime | None = None) -> Job:
    at = _now(now)
    job = get_job(db, job_id)
    if job is None:
        raise KeyError(job_id)
    with db.transaction():
        if job.status == "queued":
            db.execute(
                "UPDATE processing_jobs SET status = 'cancelled', cancel_requested = 1, finished_at = ?, updated_at = ? WHERE job_id = ?",
                [at.isoformat(), at.isoformat(), job_id],
            )
            _event(db, job_id, "cancelled", at)
        elif job.status == "running":
            db.execute(
                "UPDATE processing_jobs SET cancel_requested = 1, updated_at = ? WHERE job_id = ?",
                [at.isoformat(), job_id],
            )
            _event(db, job_id, "cancel_requested", at)
    return get_job(db, job_id)


def is_cancel_requested(db: StateDB, job_id: str) -> bool:
    return bool(
        db.scalar("SELECT cancel_requested FROM processing_jobs WHERE job_id = ?", [job_id])
    )


def mark_cancelled(db: StateDB, job_id: str, *, now: datetime | None = None) -> None:
    at = _now(now)
    with db.transaction():
        db.execute(
            """UPDATE processing_jobs SET status = 'cancelled', locked_by = NULL, lease_until = NULL, finished_at = ?, updated_at = ?
               WHERE job_id = ? AND status NOT IN ('succeeded', 'failed', 'partial')""",
            [at.isoformat(), at.isoformat(), job_id],
        )
        _event(db, job_id, "cancelled", at)


def requeue_expired(db: StateDB, *, now: datetime | None = None) -> int:
    """Running jobs whose lease lapsed: back to the queue, or failed when attempts are exhausted."""
    at = _now(now)
    rows = db.query(
        "SELECT * FROM processing_jobs WHERE namespace = ? AND status = 'running' AND lease_until < ?",
        [db.namespace, at.isoformat()],
    )
    with db.transaction():
        for r in rows:
            job = Job.from_row(r)
            if job.attempt >= job.max_attempts:
                db.execute(
                    """UPDATE processing_jobs SET status = 'failed', error = ?, locked_by = NULL, lease_until = NULL,
                           finished_at = ?, updated_at = ? WHERE job_id = ?""",
                    [
                        f"lease expired after {job.attempt} attempt(s); worker {job.locked_by} did not finish",
                        at.isoformat(),
                        at.isoformat(),
                        job.job_id,
                    ],
                )
                _event(db, job.job_id, "failed", at, {"reason": "lease_expired"})
            else:
                db.execute(
                    "UPDATE processing_jobs SET status = 'queued', locked_by = NULL, lease_until = NULL, next_run_at = ?, updated_at = ? WHERE job_id = ?",
                    [at.isoformat(), at.isoformat(), job.job_id],
                )
                _event(db, job.job_id, "lease_expired", at, {"worker_id": job.locked_by})
    return len(rows)


__all__ = [
    "TERMINAL",
    "LeaseError",
    "backoff_seconds",
    "cancel",
    "claim_next",
    "complete",
    "enqueue",
    "events",
    "fail",
    "get_job",
    "heartbeat",
    "is_cancel_requested",
    "list_jobs",
    "mark_cancelled",
    "requeue_expired",
]
