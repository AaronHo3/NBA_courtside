"""Worker: executes handlers under a lease, honours cancellation, recovers after a crash, publishes atomically."""

import threading
import time

import pytest

from app.jobs import queue as q
from app.jobs.handlers import JobOutcome
from app.jobs.publish import atomic_publish
from app.jobs.worker import Worker, WorkerBusyError, acquire_lock


def test_run_once_executes_a_queued_job(state, layout, settings, handlers):
    handlers("test_noop", lambda ctx: JobOutcome("succeeded", {"saw": ctx.job.payload}))
    job = q.enqueue(state, "test_noop", {"x": 1}, idempotency_key="a")
    w = Worker(settings, layout, state, worker_id="w1")
    assert w.run_once() is True
    got = q.get_job(state, job.job_id)
    assert got.status == "succeeded" and got.result == {"saw": {"x": 1}} and got.locked_by is None
    assert w.run_once() is False  # nothing left


def test_handler_exception_schedules_a_retry_then_fails(state, layout, settings, handlers):
    calls = []

    def boom(ctx):
        calls.append(ctx.job.attempt)
        raise RuntimeError("encode failed")

    handlers("test_boom", boom)
    job = q.enqueue(state, "test_boom", {}, idempotency_key="a", max_attempts=2)
    w = Worker(settings, layout, state, worker_id="w1")
    w.run_once()
    assert q.get_job(state, job.job_id).status == "queued" and calls == [1]
    # make it due now and run again
    state.execute(
        "UPDATE processing_jobs SET next_run_at = '2000-01-01T00:00:00+00:00' WHERE job_id = ?",
        [job.job_id],
    )
    w.run_once()
    got = q.get_job(state, job.job_id)
    assert got.status == "failed" and "encode failed" in got.error and calls == [1, 2]


def test_unknown_kind_fails_without_retry(state, layout, settings):
    job = q.enqueue(state, "no_such_kind", {}, idempotency_key="a")
    Worker(settings, layout, state, worker_id="w1").run_once()
    assert q.get_job(state, job.job_id).status == "failed"


def test_progress_and_cancellation_between_steps(state, layout, settings, handlers):
    seen = []

    def stepper(ctx):
        for i in range(10):
            ctx.check_cancel()
            ctx.progress((i + 1) / 10, f"step {i + 1}")
            seen.append(i)
            if i == 2:
                q.cancel(state, ctx.job.job_id)
        return JobOutcome("succeeded", {})

    handlers("test_steps", stepper)
    job = q.enqueue(state, "test_steps", {}, idempotency_key="a")
    Worker(settings, layout, state, worker_id="w1").run_once()
    got = q.get_job(state, job.job_id)
    assert got.status == "cancelled" and seen == [0, 1, 2]
    assert [e["type"] for e in q.events(state, job.job_id)][-1] == "cancelled"


def test_worker_lock_is_exclusive_but_stale_locks_are_taken_over(state, settings):
    acquire_lock(state, "w1", stale_after_seconds=60)
    with pytest.raises(WorkerBusyError):
        acquire_lock(state, "w2", stale_after_seconds=60)
    state.execute("UPDATE worker_lock SET heartbeat_at = '2000-01-01T00:00:00+00:00'")
    acquire_lock(state, "w2", stale_after_seconds=60)
    assert state.scalar("SELECT worker_id FROM worker_lock") == "w2"


def test_restart_recovery_reruns_a_job_whose_worker_died(state, layout, settings, handlers):
    runs = []
    handlers(
        "test_once", lambda ctx: (runs.append(ctx.job.attempt), JobOutcome("succeeded", {}))[1]
    )
    job = q.enqueue(state, "test_once", {}, idempotency_key="a")
    # a worker claims the job and dies without finishing: the lease stays in the table
    q.claim_next(state, worker_id="dead", lease_seconds=1)
    time.sleep(1.1)
    Worker(settings, layout, state, worker_id="w2").run_once()
    got = q.get_job(state, job.job_id)
    assert got.status == "succeeded" and runs == [2]  # second attempt after the expired lease


def test_atomic_publish_moves_files_then_commits_rows_in_one_transaction(state, layout, tmp_path):
    state.execute("CREATE TABLE t (k TEXT PRIMARY KEY)")
    tmp = tmp_path / "out.tmp"
    tmp.write_text("data")
    final = tmp_path / "final.bin"
    atomic_publish(
        state, moves=[(tmp, final)], rows=lambda: state.execute("INSERT INTO t (k) VALUES ('a')")
    )
    assert final.exists() and not tmp.exists() and state.scalar("SELECT COUNT(*) FROM t") == 1

    tmp2 = tmp_path / "out2.tmp"
    tmp2.write_text("data")
    final2 = tmp_path / "final2.bin"

    def bad_rows():
        state.execute("INSERT INTO t (k) VALUES ('b')")
        raise RuntimeError("db failed after files moved")

    with pytest.raises(RuntimeError):
        atomic_publish(state, moves=[(tmp2, final2)], rows=bad_rows)
    assert state.scalar("SELECT COUNT(*) FROM t") == 1  # nothing visible from the failed publish
    assert not final2.exists() and tmp2.exists()  # files rolled back too


def test_handler_workdir_is_removed_after_the_job(state, layout, settings, handlers):
    paths = {}

    def writer(ctx):
        p = ctx.workdir / "scratch.bin"
        p.write_bytes(b"x")
        paths["dir"] = ctx.workdir
        raise RuntimeError("fail after writing scratch")

    handlers("test_scratch", writer)
    q.enqueue(state, "test_scratch", {}, idempotency_key="a", max_attempts=1)
    Worker(settings, layout, state, worker_id="w1").run_once()
    assert not paths["dir"].exists()


def test_run_forever_stops_on_event(state, layout, settings, handlers):
    handlers("test_noop", lambda ctx: JobOutcome("succeeded", {}))
    q.enqueue(state, "test_noop", {}, idempotency_key="a")
    stop = threading.Event()
    w = Worker(settings, layout, state, worker_id="w1")
    t = threading.Thread(target=w.run_forever, args=(stop,), daemon=True)
    t.start()
    for _ in range(100):
        if q.list_jobs(state, status="succeeded"):
            break
        time.sleep(0.02)
    stop.set()
    t.join(timeout=5)
    assert not t.is_alive() and q.list_jobs(state, status="succeeded")
