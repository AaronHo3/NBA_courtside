"""processing_jobs: durable, idempotent, leased, retried with backoff, cancellable, recoverable."""

from datetime import UTC, datetime, timedelta

import pytest

from app.jobs import queue as q

T0 = datetime(2026, 10, 9, 12, 0, tzinfo=UTC)


def test_enqueue_is_idempotent_per_key(state):
    a = q.enqueue(state, "test_noop", {"x": 1}, idempotency_key="asset:1:probe:v1")
    b = q.enqueue(state, "test_noop", {"x": 2}, idempotency_key="asset:1:probe:v1")
    assert a.job_id == b.job_id and b.payload == {"x": 1} and a.status == "queued"
    assert len(a.job_id) == 26 and a.attempt == 0 and a.max_attempts == 3
    assert state.scalar("SELECT COUNT(*) FROM processing_jobs") == 1
    events = q.events(state, a.job_id)
    assert [e["type"] for e in events] == ["enqueued"]


def test_claim_is_fifo_and_respects_next_run_at(state):
    first = q.enqueue(state, "test_noop", {}, idempotency_key="k1", now=T0)
    q.enqueue(state, "test_noop", {}, idempotency_key="k2", now=T0 + timedelta(seconds=1))
    later = q.enqueue(
        state, "test_noop", {}, idempotency_key="k3", now=T0, next_run_at=T0 + timedelta(hours=1)
    )
    claimed = q.claim_next(state, worker_id="w1", lease_seconds=30, now=T0 + timedelta(seconds=2))
    assert claimed.job_id == first.job_id and claimed.status == "running"
    assert (
        claimed.locked_by == "w1"
        and claimed.attempt == 1
        and claimed.lease_until > T0 + timedelta(seconds=2)
    )
    second = q.claim_next(state, worker_id="w1", lease_seconds=30, now=T0 + timedelta(seconds=2))
    assert second.idempotency_key == "k2"
    assert (
        q.claim_next(state, worker_id="w1", lease_seconds=30, now=T0 + timedelta(seconds=2)) is None
    )  # k3 not due yet
    assert (
        q.claim_next(state, worker_id="w1", lease_seconds=30, now=T0 + timedelta(hours=2)).job_id
        == later.job_id
    )


def test_heartbeat_extends_lease_and_records_progress(state):
    job = q.enqueue(state, "test_noop", {}, idempotency_key="k", now=T0)
    q.claim_next(state, worker_id="w1", lease_seconds=10, now=T0)
    q.heartbeat(
        state,
        job.job_id,
        worker_id="w1",
        lease_seconds=10,
        progress=0.5,
        note="half",
        now=T0 + timedelta(seconds=8),
    )
    got = q.get_job(state, job.job_id)
    assert (
        got.lease_until == T0 + timedelta(seconds=18)
        and got.progress == 0.5
        and got.progress_note == "half"
    )
    with pytest.raises(q.LeaseError):
        q.heartbeat(
            state, job.job_id, worker_id="other", lease_seconds=10, now=T0 + timedelta(seconds=9)
        )


def test_complete_and_partial(state):
    a = q.enqueue(state, "test_noop", {}, idempotency_key="a", now=T0)
    b = q.enqueue(state, "test_noop", {}, idempotency_key="b", now=T0)
    q.claim_next(state, worker_id="w1", lease_seconds=10, now=T0)
    q.claim_next(state, worker_id="w1", lease_seconds=10, now=T0)
    q.complete(state, a.job_id, {"rows": 3}, now=T0 + timedelta(seconds=1))
    q.complete(
        state,
        b.job_id,
        {"done": 2, "failed": ["x"]},
        status="partial",
        now=T0 + timedelta(seconds=1),
    )
    assert q.get_job(state, a.job_id).status == "succeeded" and q.get_job(
        state, a.job_id
    ).result == {"rows": 3}
    assert (
        q.get_job(state, b.job_id).status == "partial"
        and q.get_job(state, b.job_id).finished_at is not None
    )


def test_fail_retries_with_backoff_until_attempts_run_out(state):
    job = q.enqueue(state, "test_noop", {}, idempotency_key="k", max_attempts=2, now=T0)
    q.claim_next(state, worker_id="w1", lease_seconds=10, now=T0)
    q.fail(state, job.job_id, "boom", now=T0)
    retried = q.get_job(state, job.job_id)
    assert retried.status == "queued" and retried.attempt == 1 and retried.error == "boom"
    assert (
        T0 + timedelta(seconds=2) <= retried.next_run_at <= T0 + timedelta(seconds=4)
    )  # base 2s + jitter
    assert q.claim_next(state, worker_id="w1", lease_seconds=10, now=T0) is None  # not due yet
    q.claim_next(state, worker_id="w1", lease_seconds=10, now=T0 + timedelta(seconds=5))
    q.fail(state, job.job_id, "boom again", now=T0 + timedelta(seconds=6))
    final = q.get_job(state, job.job_id)
    assert final.status == "failed" and final.attempt == 2 and final.finished_at is not None
    assert [e["type"] for e in q.events(state, job.job_id)] == [
        "enqueued",
        "claimed",
        "retry_scheduled",
        "claimed",
        "failed",
    ]


def test_non_retryable_failure_fails_immediately(state):
    job = q.enqueue(state, "test_noop", {}, idempotency_key="k", now=T0)
    q.claim_next(state, worker_id="w1", lease_seconds=10, now=T0)
    q.fail(state, job.job_id, "bad input", retry=False, now=T0)
    assert q.get_job(state, job.job_id).status == "failed"


def test_cancel_queued_is_immediate_and_cancel_running_sets_the_flag(state):
    a = q.enqueue(state, "test_noop", {}, idempotency_key="a", now=T0)
    b = q.enqueue(state, "test_noop", {}, idempotency_key="b", now=T0)
    q.cancel(state, a.job_id, now=T0)
    assert q.get_job(state, a.job_id).status == "cancelled"
    q.claim_next(state, worker_id="w1", lease_seconds=10, now=T0)
    q.cancel(state, b.job_id, now=T0)
    got = q.get_job(state, b.job_id)
    assert got.status == "running" and got.cancel_requested is True
    assert q.is_cancel_requested(state, b.job_id)
    q.mark_cancelled(state, b.job_id, now=T0)
    assert q.get_job(state, b.job_id).status == "cancelled"


def test_expired_leases_are_requeued_or_failed(state):
    a = q.enqueue(state, "test_noop", {}, idempotency_key="a", max_attempts=3, now=T0)
    b = q.enqueue(state, "test_noop", {}, idempotency_key="b", max_attempts=1, now=T0)
    q.claim_next(state, worker_id="dead", lease_seconds=5, now=T0)
    q.claim_next(state, worker_id="dead", lease_seconds=5, now=T0)
    assert q.requeue_expired(state, now=T0 + timedelta(seconds=3)) == 0
    assert q.requeue_expired(state, now=T0 + timedelta(seconds=10)) == 2
    assert (
        q.get_job(state, a.job_id).status == "queued"
        and q.get_job(state, a.job_id).locked_by is None
    )
    assert (
        q.get_job(state, b.job_id).status == "failed"
        and "lease" in q.get_job(state, b.job_id).error
    )


def test_listing_filters_and_namespace(state):
    q.enqueue(state, "test_noop", {}, idempotency_key="a")
    q.enqueue(state, "test_other", {}, idempotency_key="b")
    assert [j.kind for j in q.list_jobs(state, kind="test_other")] == ["test_other"]
    assert len(q.list_jobs(state, status="queued")) == 2
    assert q.get_job(state, "01HZZZZZZZZZZZZZZZZZZZZZZZ") is None
