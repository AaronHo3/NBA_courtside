"""``export_snapshot``: write the next version of the evidence and annotation snapshot families."""

from __future__ import annotations

from app.data.db import Database
from app.evidence.snapshots import export_snapshots
from app.jobs.handlers import JobContext, JobOutcome, register_handler


def export_snapshot(ctx: JobContext) -> JobOutcome:
    ctx.progress(0.1, "collecting evidence items and annotations")
    analytics = Database(ctx.layout)
    report = export_snapshots(ctx.state_db, ctx.layout, analytics)
    return JobOutcome(
        "succeeded",
        {
            "version": report.version,
            "evidence_rows": report.evidence_rows,
            "annotation_rows": report.annotation_rows,
            "files": list(report.files),
            "exported_at": report.exported_at,
        },
    )


register_handler("export_snapshot", export_snapshot)
