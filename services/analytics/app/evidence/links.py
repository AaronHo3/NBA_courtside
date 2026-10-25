"""Event-video links for managed media (DATA_MODEL §5, VIDEO_PIPELINE §6, DEC-08/DEC-09).

A link ties one provider event to one segment of one authorised asset. It is placed either by hand
(``manual``: the user supplies the window) or by interpolation between that segment's anchors
(``interpolated``: the window is derived and carries a stated ``timing_error_ms``). Every link owns one
``evidence_items`` row of kind ``video_segment`` so reports and the copilot can cite it.
"""

from __future__ import annotations

import math
from typing import Any

from app.data.db import Database
from app.events import repository as events_repo
from app.evidence.alignment import anchors_for_asset, place_event
from app.evidence.evidence_items import ensure_evidence_item
from app.evidence.models import EventKey
from app.evidence.read import get_link, item_by_ref
from app.evidence.registry import asset_allows, ensure_link, get_asset, now_iso, set_link_timing
from app.evidence.segments import REVIEW_STATUSES, get_segment
from app.state.connection import StateDB

MODES = ("manual", "interpolated")
WINDOW_BEFORE_MS = 4_000  # how much footage before the placed instant a clip shows
WINDOW_AFTER_MS = 3_000


class LinkError(ValueError):
    """The request is understood but violates a linking rule."""


class LinkNotFoundError(LinkError, KeyError):
    """A referenced event, asset, segment or link does not exist in this namespace."""


def _clock_label(clock_ms: Any) -> str:
    if clock_ms is None or clock_ms != clock_ms:
        return "clock unknown"
    total = int(clock_ms) // 1000
    return f"{total // 60}:{total % 60:02d}"


def _summary(event: dict[str, Any], method: str, start: int, end: int, error: int | None) -> str:
    what = event.get("description") or event.get("action_type") or "event"
    err = f"±{error} ms" if error is not None else "timing error unknown"
    return (
        f"{what} (period {event.get('period')}, {_clock_label(event.get('clock_ms'))}); "
        f"managed clip {start}–{end} ms, {method}, {err}"
    )


def _player_ids(detail: dict[str, Any]) -> list[int]:
    seen: list[int] = []
    for p in detail.get("participants") or []:
        pid = p.get("person_id")
        if pid is None or pid != pid:
            continue
        if int(pid) not in seen:
            seen.append(int(pid))
    person = detail["event"].get("person_id")
    if not seen and person is not None and person == person:
        seen.append(int(person))
    return seen


def _resolve_asset_and_segment(db: StateDB, asset_id: str, segment_id: str) -> tuple[dict, dict]:
    asset = get_asset(db, asset_id)
    if asset is None or asset.get("deleted_at"):
        raise LinkNotFoundError(f"asset {asset_id} not found")
    if asset.get("kind") != "managed_original":
        raise LinkError(
            "timed links need a managed asset; external references are linked by the adapter"
        )
    if not asset_allows(db, asset_id, "view"):
        raise LinkError(
            "the asset's recorded permissions do not allow viewing, so it cannot be linked"
        )
    segment = get_segment(db, segment_id)
    if segment is None or segment["asset_id"] != asset_id:
        raise LinkNotFoundError(f"segment {segment_id} not found for asset {asset_id}")
    return asset, segment


def _manual_window(segment: dict, start: int | None, end: int | None) -> tuple[int, int]:
    if start is None or end is None:
        raise LinkError("media_start_ms and media_end_ms are required for a manual link")
    if end <= start:
        raise LinkError("media_end_ms must be greater than media_start_ms")
    if start < segment["media_start_ms"] or end > segment["media_end_ms"]:
        raise LinkError(
            f"window {start}–{end} ms lies outside the segment ({segment['media_start_ms']}–{segment['media_end_ms']} ms)"
        )
    return int(start), int(end)


def _interpolated_window(
    db: StateDB, segment: dict, event: dict, *, before_ms: int, after_ms: int
) -> tuple[int, int, int, list[str]]:
    period, clock = event.get("period"), event.get("clock_ms")
    if period is None or clock is None or clock != clock:
        raise LinkError("the event has no period/clock, so it cannot be placed by interpolation")
    placed = place_event(
        anchors_for_asset(db, segment["asset_id"]),
        segment=segment,
        period=int(period),
        clock_ms=int(clock),
    )
    if placed is None:
        raise LinkError(
            "cannot place the event in this segment: it needs two reviewed-or-not anchors from the same period "
            "bracketing its clock in a live segment (a stopped clock needs its own anchor); add an anchor"
        )
    start = max(segment["media_start_ms"], int(round(placed.media_ms - before_ms)))
    end = min(segment["media_end_ms"], int(round(placed.media_ms + after_ms)))
    if end <= start:
        raise LinkError(
            "the derived window collapsed at the segment edge; widen the segment or add anchors"
        )
    return start, end, int(math.ceil(placed.timing_error_ms)), list(placed.anchor_ids)


def link_view(db: StateDB, link_id: str, *, created: bool | None = None) -> dict[str, Any]:
    link = get_link(db, link_id)
    if link is None:
        raise LinkNotFoundError(f"link {link_id} not found")
    out = {
        **link,
        "evidence": item_by_ref(db, "event_video_links", link_id),
        "segment": get_segment(db, link["segment_id"]) if link.get("segment_id") else None,
    }
    if created is not None:
        out["created"] = created
    return out


def create_managed_link(
    db: StateDB,
    analytics: Database,
    *,
    event_key: EventKey,
    asset_id: str,
    segment_id: str,
    mode: str,
    media_start_ms: int | None = None,
    media_end_ms: int | None = None,
    timing_error_ms: int | None = None,
    window_before_ms: int = WINDOW_BEFORE_MS,
    window_after_ms: int = WINDOW_AFTER_MS,
    created_by: str = "user",
) -> dict[str, Any]:
    if mode not in MODES:
        raise LinkError(f"mode must be one of {MODES}")
    _, segment = _resolve_asset_and_segment(db, asset_id, segment_id)
    detail = events_repo.event(
        analytics, event_key.source_event_system, event_key.game_id, event_key.source_event_id
    )
    if detail is None:
        raise LinkNotFoundError(
            f"event {event_key.source_event_system}/{event_key.game_id}/{event_key.source_event_id} not found; ingest the game's play-by-play first"
        )
    event = detail["event"]
    if mode == "manual":
        start, end = _manual_window(segment, media_start_ms, media_end_ms)
        error, anchor_ids = timing_error_ms, []
    else:
        start, end, error, anchor_ids = _interpolated_window(
            db, segment, event, before_ms=window_before_ms, after_ms=window_after_ms
        )
    with db.transaction():
        link = ensure_link(
            db,
            event_key=event_key,
            asset_id=asset_id,
            segment_id=segment_id,
            alignment_method=mode,
            link_status="available",
            created_by=created_by,
        )
        if link["created"]:
            set_link_timing(
                db,
                link["link_id"],
                media_start_ms=start,
                media_end_ms=end,
                alignment_method=mode,
                timing_error_ms=error,
                anchor_ids=anchor_ids,
            )
        ensure_evidence_item(
            db,
            kind="video_segment",
            ref_table="event_video_links",
            ref_id=link["link_id"],
            evidence_class="reviewed_observation",
            summary=_summary(event, mode, start, end, error),
            player_ids=_player_ids(detail),
            game_id=event_key.game_id,
            season=event.get("season"),
            season_type=event.get("season_type"),
            review_status="unreviewed",
            created_by=created_by,
        )
    return link_view(db, link["link_id"], created=bool(link["created"]))


def review_link(
    db: StateDB, link_id: str, *, review_status: str, reviewer: str | None
) -> dict[str, Any]:
    if review_status not in REVIEW_STATUSES:
        raise LinkError(f"review_status must be one of {REVIEW_STATUSES}")
    if get_link(db, link_id) is None:
        raise LinkNotFoundError(f"link {link_id} not found")
    stamp = now_iso()
    with db.transaction():
        db.execute(
            "UPDATE event_video_links SET review_status = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE link_id = ? AND namespace = ?",
            [review_status, reviewer, stamp, stamp, link_id, db.namespace],
        )
        db.execute(
            "UPDATE evidence_items SET review_status = ?, updated_at = ? WHERE namespace = ? AND ref_table = 'event_video_links' AND ref_id = ?",
            [review_status, stamp, db.namespace, link_id],
        )
    return link_view(db, link_id)
