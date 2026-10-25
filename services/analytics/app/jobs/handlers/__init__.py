"""Job handlers: ``kind -> callable(JobContext) -> JobOutcome``. Handlers poll ``check_cancel`` between steps."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from app.config import Settings
from app.data.paths import DataLayout
from app.jobs import queue as q
from app.jobs.models import Job
from app.state.connection import StateDB


class JobCancelled(Exception):  # noqa: N818 - control-flow signal, not an error condition
    pass


class NonRetryableError(RuntimeError):
    """The input itself is wrong (bad media, over a limit); retrying cannot help."""


@dataclass(frozen=True)
class JobOutcome:
    status: Literal["succeeded", "partial"]
    result: dict[str, Any] = field(default_factory=dict)


@dataclass
class JobContext:
    job: Job
    state_db: StateDB
    layout: DataLayout
    settings: Settings
    workdir: Path
    worker_id: str
    lease_seconds: float

    def progress(self, fraction: float, note: str | None = None) -> None:
        q.heartbeat(
            self.state_db,
            self.job.job_id,
            worker_id=self.worker_id,
            lease_seconds=self.lease_seconds,
            progress=max(0.0, min(1.0, float(fraction))),
            note=note,
        )
        self.check_cancel()

    def check_cancel(self) -> None:
        if q.is_cancel_requested(self.state_db, self.job.job_id):
            raise JobCancelled(self.job.job_id)


Handler = Callable[[JobContext], JobOutcome]
HANDLERS: dict[str, Handler] = {}


def register_handler(kind: str, fn: Handler) -> None:
    HANDLERS[kind] = fn
