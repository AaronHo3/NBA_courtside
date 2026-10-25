from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from app.api.deps import get_state_db
from app.api.envelope import clean, ok
from app.jobs import queue as q

router = APIRouter(prefix="/api/jobs", tags=["jobs"])
JobId = Annotated[str, Path(pattern=r"^[0-9A-HJKMNP-TV-Z]{26}$")]
Status = Literal["queued", "running", "succeeded", "failed", "cancelled", "partial"]


@router.get("")
def list_jobs(
    status: Status | None = None,
    kind: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    state_db=Depends(get_state_db),
):
    jobs = q.list_jobs(state_db, status=status, kind=kind, limit=limit)
    return ok(clean([j.as_dict() for j in jobs]), {"total": len(jobs), "limit": limit})


@router.get("/{job_id}")
def job_detail(job_id: JobId, state_db=Depends(get_state_db)):
    job = q.get_job(state_db, job_id)
    if job is None:
        raise HTTPException(404, f"job {job_id} not found")
    return ok(clean({"job": job.as_dict(), "events": q.events(state_db, job_id)}))


@router.post("/{job_id}/cancel")
def cancel_job(job_id: JobId, state_db=Depends(get_state_db)):
    try:
        job = q.cancel(state_db, job_id)
    except KeyError as exc:
        raise HTTPException(404, f"job {job_id} not found") from exc
    return ok(clean({"job": job.as_dict()}))
