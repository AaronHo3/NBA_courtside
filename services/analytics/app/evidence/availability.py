"""Bounded availability checks for external references, and ageing to ``stale``."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.data.paths import DataLayout
from app.evidence.adapters.base import ExternalReferenceAdapter
from app.evidence.adapters.nba_stats_events import NbaStatsEventsAdapter
from app.evidence.models import AvailabilityReport
from app.evidence.registry import get_asset, now_iso, set_asset_availability
from app.ingestion.cache import get_or_fetch
from app.ingestion.providers.base import ProviderError, StatsProvider
from app.state.connection import StateDB

CACHE_FAMILY = "video_refs"


def _game_and_event(asset: dict) -> tuple[str, int] | None:
    key = asset.get("external_ref_key") or ""
    parts = key.split(":")
    if len(parts) == 3 and parts[2].isdigit():
        return parts[1], int(parts[2])
    return None


def check_availability(
    provider: StatsProvider,
    layout: DataLayout,
    db: StateDB,
    asset_ids: list[str],
    *,
    max_calls: int = 10,
    adapter: ExternalReferenceAdapter | None = None,
) -> AvailabilityReport:
    """Ask the provider for each reference's metadata, at most ``max_calls`` times.

    ok with a playlist -> ``available`` (+ metadata); ok but empty -> ``unavailable``; provider error ->
    availability unchanged but ``availability_checked_at`` recorded.
    """
    adapter = adapter or NbaStatsEventsAdapter()
    checked = available = unavailable = errors = 0
    todo = asset_ids[: max(0, int(max_calls))]
    for asset_id in todo:
        asset = get_asset(db, asset_id)
        if asset is None or asset.get("kind") != "external_reference":
            continue
        target = _game_and_event(asset)
        if target is None:
            continue
        endpoint, params = adapter.metadata_request(*target)
        checked += 1
        stamp = now_iso()
        try:
            raw = get_or_fetch(provider, layout, CACHE_FAMILY, endpoint, params)
        except ProviderError:
            errors += 1
            set_asset_availability(db, asset_id, asset["availability"], stamp)
            continue
        meta = adapter.parse_metadata(raw.payload)
        if meta:
            available += 1
            set_asset_availability(db, asset_id, "available", stamp, metadata=meta)
        else:
            unavailable += 1
            set_asset_availability(db, asset_id, "unavailable", stamp)
    return AvailabilityReport(
        checked, available, unavailable, errors, skipped=len(asset_ids) - len(todo)
    )


def mark_stale_references(db: StateDB, *, older_than_days: int, now: datetime | None = None) -> int:
    cutoff = ((now or datetime.now(UTC)) - timedelta(days=older_than_days)).isoformat()
    with db.transaction():
        cur = db.execute(
            """UPDATE video_assets SET availability = 'stale', updated_at = ?
               WHERE namespace = ? AND kind = 'external_reference' AND availability = 'available'
                 AND availability_checked_at IS NOT NULL AND availability_checked_at < ?""",
            [now_iso(), db.namespace, cutoff],
        )
        return int(cur.rowcount)
