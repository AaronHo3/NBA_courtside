"""``purge_media``: remove files of soft-deleted assets past the retention window (DEC-04).

Registry rows stay (``status = deleted``, ``storage_key`` cleared) so links and history keep their
target. An asset is kept, with the reason, while any active evidence item cites one of its links or
while another live asset shares its content hash."""

from __future__ import annotations

import shutil
from datetime import UTC, datetime, timedelta

from app.evidence.registry import now_iso
from app.evidence.storage import MediaStore, StorageKeyError
from app.jobs.handlers import JobContext, JobOutcome, register_handler


def _candidates(db, cutoff_iso: str) -> list[dict]:
    return db.query(
        """SELECT asset_id, sha256, storage_key, deleted_at FROM video_assets
           WHERE namespace = ? AND kind = 'managed_original' AND deleted_at IS NOT NULL AND deleted_at <= ? AND storage_key IS NOT NULL
           ORDER BY deleted_at, asset_id""",
        [db.namespace, cutoff_iso],
    )


def _active_citations(db, asset_id: str) -> int:
    return int(
        db.scalar(
            """SELECT COUNT(*) FROM evidence_items e JOIN event_video_links l ON l.link_id = e.ref_id AND l.namespace = e.namespace
               WHERE e.namespace = ? AND e.ref_table = 'event_video_links' AND l.asset_id = ? AND e.status = 'active'""",
            [db.namespace, asset_id],
        )
        or 0
    )


def _shared_original(db, asset_id: str, sha256: str | None) -> bool:
    if not sha256:
        return False
    return bool(
        db.scalar(
            "SELECT COUNT(*) FROM video_assets WHERE namespace = ? AND sha256 = ? AND asset_id != ? AND storage_key IS NOT NULL AND deleted_at IS NULL",
            [db.namespace, sha256, asset_id],
        )
    )


def purge_media(ctx: JobContext) -> JobOutcome:
    payload = ctx.job.payload or {}
    dry_run = bool(payload.get("dry_run", False))
    days = payload.get("older_than_days", ctx.settings.media_purge_after_days)
    cutoff = (datetime.now(UTC) - timedelta(days=float(days))).isoformat()
    store = MediaStore(ctx.layout)
    purged: list[str] = []
    kept: dict[str, str] = {}
    freed = 0
    for asset in _candidates(ctx.state_db, cutoff):
        ctx.check_cancel()
        aid = asset["asset_id"]
        cites = _active_citations(ctx.state_db, aid)
        if cites:
            kept[aid] = f"{cites} active evidence item(s) cite links to this asset"
            continue
        purged.append(aid)
        if dry_run:
            continue
        try:
            original = store.resolve(asset["storage_key"])
        except StorageKeyError as exc:
            kept[aid] = f"storage key refused: {exc}"
            purged.pop()
            continue
        if original.exists() and not _shared_original(ctx.state_db, aid, asset["sha256"]):
            freed += original.stat().st_size
            original.unlink()
        derived_dir = store.resolve(f"derived/{aid}")
        if derived_dir.exists():
            freed += sum(p.stat().st_size for p in derived_dir.rglob("*") if p.is_file())
            shutil.rmtree(derived_dir)
        with ctx.state_db.transaction():
            ctx.state_db.execute(
                "DELETE FROM video_derivatives WHERE asset_id = ? AND namespace = ?",
                [aid, ctx.state_db.namespace],
            )
            ctx.state_db.execute(
                "UPDATE video_assets SET storage_key = NULL, updated_at = ? WHERE asset_id = ? AND namespace = ?",
                [now_iso(), aid, ctx.state_db.namespace],
            )
    return JobOutcome(
        "succeeded",
        {
            "dry_run": dry_run,
            "older_than_days": days,
            "purged": purged,
            "kept": kept,
            "bytes_freed": freed,
        },
    )


register_handler("purge_media", purge_media)
