from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

JobStatus = Literal["queued", "running", "succeeded", "failed", "cancelled", "partial"]
TERMINAL: tuple[str, ...] = ("succeeded", "failed", "cancelled", "partial")


def _dt(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


@dataclass(frozen=True)
class Job:
    job_id: str
    namespace: str
    kind: str
    idempotency_key: str
    payload: dict[str, Any]
    status: JobStatus
    attempt: int
    max_attempts: int
    next_run_at: datetime
    locked_by: str | None
    lease_until: datetime | None
    progress: float | None
    progress_note: str | None
    result: dict[str, Any] | None
    error: str | None
    cancel_requested: bool
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def from_row(r: dict[str, Any]) -> Job:
        return Job(
            job_id=r["job_id"],
            namespace=r["namespace"],
            kind=r["kind"],
            idempotency_key=r["idempotency_key"],
            payload=json.loads(r["payload_json"] or "{}"),
            status=r["status"],
            attempt=int(r["attempt"]),
            max_attempts=int(r["max_attempts"]),
            next_run_at=_dt(r["next_run_at"]),
            locked_by=r["locked_by"],
            lease_until=_dt(r["lease_until"]),
            progress=r["progress"],
            progress_note=r["progress_note"],
            result=json.loads(r["result_json"]) if r["result_json"] else None,
            error=r["error"],
            cancel_requested=bool(r["cancel_requested"]),
            started_at=_dt(r["started_at"]),
            finished_at=_dt(r["finished_at"]),
            created_at=_dt(r["created_at"]),
            updated_at=_dt(r["updated_at"]),
        )

    def as_dict(self) -> dict[str, Any]:
        out = self.__dict__.copy()
        for k, v in out.items():
            if isinstance(v, datetime):
                out[k] = v.isoformat()
        return out
