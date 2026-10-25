"""JOBS_INLINE: the same job table and runner, executed in a thread of the API process (tests, dev)."""

import time

from app.config import Settings
from app.jobs import queue as q
from app.jobs.handlers import JobOutcome
from app.jobs.inline import enqueue_and_maybe_run


def test_inline_mode_runs_after_enqueue(state, layout, tmp_path, handlers):
    handlers("test_noop", lambda ctx: JobOutcome("succeeded", {"ok": True}))
    settings = Settings(nba_data_dir=tmp_path / "data", nba_namespace="nba", jobs_inline=True)
    job = enqueue_and_maybe_run(settings, layout, state, "test_noop", {}, idempotency_key="a")
    for _ in range(200):
        if q.get_job(state, job.job_id).status == "succeeded":
            break
        time.sleep(0.01)
    assert q.get_job(state, job.job_id).status == "succeeded"


def test_without_inline_the_job_just_waits(state, layout, tmp_path, handlers):
    handlers("test_noop", lambda ctx: JobOutcome("succeeded", {}))
    settings = Settings(nba_data_dir=tmp_path / "data", nba_namespace="nba", jobs_inline=False)
    job = enqueue_and_maybe_run(settings, layout, state, "test_noop", {}, idempotency_key="a")
    time.sleep(0.05)
    assert q.get_job(state, job.job_id).status == "queued"
