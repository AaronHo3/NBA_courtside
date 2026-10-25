"""Create external references (asset + link + evidence item) for a game's events."""

from __future__ import annotations

from app.data.db import Database
from app.events import repository as events_repo
from app.evidence.adapters.base import ExternalReferenceAdapter
from app.evidence.adapters.nba_stats_events import NbaStatsEventsAdapter
from app.evidence.evidence_items import ensure_evidence_item
from app.evidence.models import REAL_NAMESPACE, EventKey, LinkReport
from app.evidence.registry import (
    EvidenceNamespaceError,
    add_permission,
    ensure_link,
    upsert_external_asset,
)
from app.state.connection import StateDB

__all__ = ["EvidenceNamespaceError", "link_game_events"]


def _clock_label(clock_ms) -> str:
    if clock_ms is None or clock_ms != clock_ms:
        return "clock unknown"
    total = int(clock_ms) // 1000
    return f"{total // 60}:{total % 60:02d}"


def _summary(event: dict) -> str:
    what = event.get("description") or event.get("action_type") or "event"
    return f"{what} (period {event.get('period')}, {_clock_label(event.get('clock_ms'))}); external clip reference on nba.com"


def link_game_events(
    db: StateDB,
    analytics: Database,
    game_id: str,
    *,
    adapter: ExternalReferenceAdapter | None = None,
    only_field_goals: bool = True,
) -> LinkReport:
    if db.namespace != REAL_NAMESPACE:
        raise EvidenceNamespaceError(
            "external provider references exist only in the real `nba` namespace"
        )
    adapter = adapter or NbaStatsEventsAdapter()
    events = events_repo.game_events(
        analytics, game_id, is_field_goal=True if only_field_goals else None
    )
    if events.empty:
        return LinkReport(game_id, 0, 0, 0, 0)
    # duplicate action numbers share one clip reference: keep the first copy by source order
    events = events.sort_values("source_order").drop_duplicates(
        subset=["source_event_system", "source_event_id"]
    )
    assets = links = evidence = 0
    for row in events.to_dict("records"):
        event_id = int(row["source_event_id"])
        asset = upsert_external_asset(
            db,
            provider=adapter.name,
            ref_key=adapter.ref_key(game_id, event_id),
            external_url=adapter.reference_url(game_id, event_id),
            metadata={"game_id": game_id, "event_id": event_id},
        )
        if asset["created"]:
            assets += 1
            add_permission(
                db,
                asset_id=asset["asset_id"],
                source="external_reference",
                allowed_operations=["view"],
                permission_status="known",
                notes="viewed on the provider's site; nothing is downloaded",
                created_by=f"adapter:{adapter.name}",
            )
        link = ensure_link(
            db,
            event_key=EventKey(str(row["source_event_system"]), game_id, event_id),
            asset_id=asset["asset_id"],
            created_by=f"adapter:{adapter.name}",
        )
        links += int(link["created"])
        person = row.get("person_id")
        players = [int(person)] if person is not None and person == person else []
        item = ensure_evidence_item(
            db,
            kind="external_reference",
            ref_table="event_video_links",
            ref_id=link["link_id"],
            evidence_class="reference",
            summary=_summary(row),
            player_ids=players,
            game_id=game_id,
            season=row.get("season"),
            season_type=row.get("season_type"),
            created_by=f"adapter:{adapter.name}",
        )
        evidence += int(item["created"])
    return LinkReport(game_id, int(len(events)), assets, links, evidence)
