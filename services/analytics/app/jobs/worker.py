"""``python -m app.jobs.worker --namespace nba``: one durable worker per namespace."""

from __future__ import annotations

import argparse
import logging
import signal
import socket
import sys
import threading
import time
from datetime import UTC, datetime, timedelta

import app.jobs.handlers.all  # noqa: F401 - registers built-in handlers
from app.config import Settings, get_settings
from app.data.paths import DataLayout
from app.jobs import queue as q
from app.jobs.runner import execute
from app.state.connection import StateDB, open_state_db

log = logging.getLogger("nba.jobs.worker")


class WorkerBusyError(RuntimeError):
    pass


def acquire_lock(
    db: StateDB, worker_id: str, *, stale_after_seconds: float, now: datetime | None = None
) -> None:
    at = now or datetime.now(UTC)
    with db.transaction():
        rows = db.query(
            "SELECT worker_id, heartbeat_at FROM worker_lock WHERE namespace = ?", [db.namespace]
        )
        if rows and rows[0]["worker_id"] != worker_id:
            age = at - datetime.fromisoformat(rows[0]["heartbeat_at"])
            if age < timedelta(seconds=stale_after_seconds):
                raise WorkerBusyError(
                    f"another worker ({rows[0]['worker_id']}) holds the lock (heartbeat {int(age.total_seconds())}s ago)"
                )
        db.execute(
            "INSERT INTO worker_lock (namespace, worker_id, heartbeat_at) VALUES (?, ?, ?) ON CONFLICT(namespace) DO UPDATE SET worker_id = excluded.worker_id, heartbeat_at = excluded.heartbeat_at",
            [db.namespace, worker_id, at.isoformat()],
        )


def touch_lock(db: StateDB, worker_id: str, now: datetime | None = None) -> None:
    at = now or datetime.now(UTC)
    with db.transaction():
        db.execute(
            "UPDATE worker_lock SET heartbeat_at = ? WHERE namespace = ? AND worker_id = ?",
            [at.isoformat(), db.namespace, worker_id],
        )


def worker_alive(db: StateDB, *, stale_after_seconds: float, now: datetime | None = None) -> bool:
    rows = db.query("SELECT heartbeat_at FROM worker_lock WHERE namespace = ?", [db.namespace])
    if not rows:
        return False
    age = (now or datetime.now(UTC)) - datetime.fromisoformat(rows[0]["heartbeat_at"])
    return age < timedelta(seconds=stale_after_seconds)


class Worker:
    def __init__(
        self,
        settings: Settings,
        layout: DataLayout,
        state_db: StateDB,
        *,
        worker_id: str | None = None,
    ) -> None:
        self.settings = settings
        self.layout = layout
        self.state_db = state_db
        self.worker_id = worker_id or f"{socket.gethostname()}:{id(self)}"
        self.lease_seconds = float(settings.jobs_lease_seconds)

    def run_once(self) -> bool:
        """Recover expired leases, then run at most one job. Returns False when nothing was due."""
        q.requeue_expired(self.state_db)
        job = q.claim_next(
            self.state_db, worker_id=self.worker_id, lease_seconds=self.lease_seconds
        )
        if job is None:
            return False
        log.info("job %s %s attempt %d", job.job_id, job.kind, job.attempt)
        execute(
            job,
            self.state_db,
            self.layout,
            self.settings,
            worker_id=self.worker_id,
            lease_seconds=self.lease_seconds,
        )
        return True

    def run_forever(self, stop: threading.Event) -> None:
        acquire_lock(
            self.state_db,
            self.worker_id,
            stale_after_seconds=self.settings.jobs_worker_stale_seconds,
        )
        poll = float(self.settings.jobs_poll_seconds)
        while not stop.is_set():
            touch_lock(self.state_db, self.worker_id)
            try:
                worked = self.run_once()
            except Exception:  # noqa: BLE001 - the loop must survive any single job's trouble
                log.exception("worker loop error")
                worked = False
            if not worked:
                stop.wait(poll)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.jobs.worker", description="Durable media/snapshot worker"
    )
    parser.add_argument("--namespace", default="nba")
    parser.add_argument("--once", action="store_true", help="run at most one job and exit")
    args = parser.parse_args(argv)
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    layout = DataLayout(settings.data_dir, args.namespace)
    state_db = open_state_db(layout)
    worker = Worker(settings, layout, state_db)
    try:
        if args.once:
            return 0 if worker.run_once() else 3
        stop = threading.Event()
        for sig in (signal.SIGINT, signal.SIGTERM):
            signal.signal(sig, lambda *_: stop.set())
        log.info("worker %s serving namespace %s", worker.worker_id, args.namespace)
        worker.run_forever(stop)
        return 0
    except WorkerBusyError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    finally:
        state_db.close()
        time.sleep(0)


if __name__ == "__main__":
    sys.exit(main())
