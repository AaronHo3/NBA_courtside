-- Durable job queue for the local worker (ARCHITECTURE §5, DATA_MODEL §11).
CREATE TABLE IF NOT EXISTS processing_jobs (
    job_id TEXT PRIMARY KEY,
    namespace TEXT NOT NULL,
    kind TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'partial')),
    attempt INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    next_run_at TEXT NOT NULL,
    locked_by TEXT,
    lease_until TEXT,
    progress REAL,
    progress_note TEXT,
    result_json TEXT,
    error TEXT,
    cancel_requested INTEGER NOT NULL DEFAULT 0,
    started_at TEXT,
    finished_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (namespace, idempotency_key)
);
CREATE INDEX IF NOT EXISTS ix_jobs_claim ON processing_jobs (namespace, status, next_run_at, created_at);
CREATE INDEX IF NOT EXISTS ix_jobs_lease ON processing_jobs (namespace, status, lease_until);

CREATE TABLE IF NOT EXISTS job_events (
    event_id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES processing_jobs (job_id) ON DELETE CASCADE,
    at TEXT NOT NULL,
    type TEXT NOT NULL,
    detail_json TEXT
);
CREATE INDEX IF NOT EXISTS ix_job_events_job ON job_events (job_id, at);

CREATE TABLE IF NOT EXISTS worker_lock (
    namespace TEXT PRIMARY KEY,
    worker_id TEXT NOT NULL,
    heartbeat_at TEXT NOT NULL
);
