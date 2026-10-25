"""Clock alignment (VIDEO_PIPELINE §6, DEC-09): anchors belong to one live segment; interpolation never
crosses a segment or a period, never extrapolates, and reports its uncertainty."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from app.evidence.registry import decode_row, get_asset, now_iso
from app.evidence.segments import REVIEW_STATUSES, list_segments
from app.state.connection import StateDB
from app.state.ids import new_ulid

ANCHOR_METHODS = ("manual", "ocr_assisted", "provider_metadata", "cv_shot_release")
DRIFT_MS_PER_10S = 30.0  # provisional constant (VIDEO_PIPELINE §6), revisited after pilot data


class AnchorError(ValueError):
    pass


@dataclass(frozen=True)
class Placement:
    media_ms: float
    timing_error_ms: float
    method: Literal["anchor", "interpolated"]
    anchor_ids: list[str]
    segment_id: str


def drift_allowance_ms(gap_ms: float) -> float:
    return max(0.0, gap_ms) / 10_000.0 * DRIFT_MS_PER_10S


def get_anchor(db: StateDB, anchor_id: str) -> dict[str, Any] | None:
    rows = db.query(
        "SELECT * FROM alignment_anchors WHERE anchor_id = ? AND namespace = ?",
        [anchor_id, db.namespace],
    )
    return decode_row(rows[0]) if rows else None


def anchors_for_asset(db: StateDB, asset_id: str) -> list[dict[str, Any]]:
    rows = db.query(
        "SELECT * FROM alignment_anchors WHERE asset_id = ? AND namespace = ? ORDER BY media_pts_ms, anchor_id",
        [asset_id, db.namespace],
    )
    return [decode_row(r) for r in rows]


def _segment_for(
    db: StateDB, asset_id: str, media_pts_ms: int, segment_id: str | None
) -> dict[str, Any]:
    segments = list_segments(db, asset_id)
    if segment_id is not None:
        seg = next((s for s in segments if s["segment_id"] == segment_id), None)
        if seg is None:
            raise AnchorError(f"segment {segment_id} does not belong to asset {asset_id}")
        if not (seg["media_start_ms"] <= media_pts_ms < seg["media_end_ms"]):
            raise AnchorError("anchor media time is outside the given segment")
        if seg["classification"] != "live":
            raise AnchorError(
                f"anchors belong to live segments; this one is {seg['classification']}"
            )
        return seg
    covering = [s for s in segments if s["media_start_ms"] <= media_pts_ms < s["media_end_ms"]]
    live = [s for s in covering if s["classification"] == "live"]
    if live:
        return live[0]
    if covering:
        kinds = ", ".join(sorted({s["classification"] for s in covering}))
        raise AnchorError(
            f"media time {media_pts_ms} ms falls in a {kinds} segment; anchors belong to live segments"
        )
    raise AnchorError(
        f"no segment covers media time {media_pts_ms} ms; create a live segment first"
    )


def add_anchor(
    db: StateDB,
    *,
    asset_id: str,
    media_pts_ms: int,
    period: int,
    clock_ms: int,
    method: str,
    error_ms: int | None = None,
    segment_id: str | None = None,
    created_by: str = "user",
) -> dict[str, Any]:
    if get_asset(db, asset_id) is None:
        raise KeyError(asset_id)
    if method not in ANCHOR_METHODS:
        raise AnchorError(f"method must be one of {ANCHOR_METHODS}")
    if period < 1 or clock_ms < 0 or media_pts_ms < 0:
        raise AnchorError("period must be >= 1 and times non-negative")
    seg = _segment_for(db, asset_id, int(media_pts_ms), segment_id)
    anchor_id = new_ulid()
    stamp = now_iso()
    with db.transaction():
        db.execute(
            """INSERT INTO alignment_anchors (anchor_id, namespace, asset_id, media_pts_ms, period, clock_ms, method, error_ms, segment_id,
                   review_status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unreviewed', ?, ?, ?)""",
            [
                anchor_id,
                db.namespace,
                asset_id,
                int(media_pts_ms),
                int(period),
                int(clock_ms),
                method,
                error_ms,
                seg["segment_id"],
                created_by,
                stamp,
                stamp,
            ],
        )
    return get_anchor(db, anchor_id)


def review_anchor(
    db: StateDB, anchor_id: str, *, status: str, reviewer: str | None
) -> dict[str, Any]:
    if status not in REVIEW_STATUSES:
        raise AnchorError(f"review_status must be one of {REVIEW_STATUSES}")
    if get_anchor(db, anchor_id) is None:
        raise KeyError(anchor_id)
    with db.transaction():
        db.execute(
            "UPDATE alignment_anchors SET review_status = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE anchor_id = ? AND namespace = ?",
            [status, reviewer, now_iso(), now_iso(), anchor_id, db.namespace],
        )
    return get_anchor(db, anchor_id)


def place_event(
    anchors: list[dict[str, Any]], *, segment: dict[str, Any], period: int, clock_ms: int
) -> Placement | None:
    """Media time for (period, clock) inside one live segment, or None when the anchors cannot support it."""
    if segment["classification"] != "live":
        return None
    cand = sorted(
        (a for a in anchors if a["segment_id"] == segment["segment_id"] and a["period"] == period),
        key=lambda a: (a["media_pts_ms"], a["anchor_id"]),
    )
    exact = [a for a in cand if a["clock_ms"] == clock_ms]
    if len(exact) == 1:
        a = exact[0]
        return Placement(
            float(a["media_pts_ms"]),
            float(a["error_ms"] or 0),
            "anchor",
            [a["anchor_id"]],
            segment["segment_id"],
        )
    if len(exact) > 1:
        return None  # stopped clock: several media times share this reading; needs its own anchor
    for a1, a2 in zip(cand, cand[1:], strict=False):
        if a1["clock_ms"] > clock_ms > a2["clock_ms"]:
            frac = (a1["clock_ms"] - clock_ms) / (a1["clock_ms"] - a2["clock_ms"])
            gap = a2["media_pts_ms"] - a1["media_pts_ms"]
            media = a1["media_pts_ms"] + frac * gap
            error = max(a1["error_ms"] or 0, a2["error_ms"] or 0) + drift_allowance_ms(gap)
            return Placement(
                float(media),
                float(error),
                "interpolated",
                [a1["anchor_id"], a2["anchor_id"]],
                segment["segment_id"],
            )
    return None


def _links(db: StateDB, asset_id: str) -> list[dict[str, Any]]:
    rows = db.query(
        "SELECT * FROM event_video_links WHERE asset_id = ? AND namespace = ?",
        [asset_id, db.namespace],
    )
    return [decode_row(r) for r in rows]


def validate_asset(db: StateDB, asset_id: str) -> dict[str, Any]:
    segments = {s["segment_id"]: s for s in list_segments(db, asset_id)}
    anchors = anchors_for_asset(db, asset_id)
    links = _links(db, asset_id)
    rules: list[dict[str, Any]] = []

    def rule(name: str, failing: list[str], details: list[str]) -> None:
        rules.append(
            {
                "rule": name,
                "passed": not failing,
                "failing_segments": sorted(set(failing)),
                "details": details,
            }
        )

    # 1. within a live segment and period, the clock never increases as media time advances
    failing, details = [], []
    for sid, seg in segments.items():
        if seg["classification"] != "live":
            continue
        by_period: dict[int, list[dict]] = {}
        for a in anchors:
            if a["segment_id"] == sid:
                by_period.setdefault(a["period"], []).append(a)
        for period, group in by_period.items():
            group.sort(key=lambda a: a["media_pts_ms"])
            for a1, a2 in zip(group, group[1:], strict=False):
                if a2["clock_ms"] > a1["clock_ms"]:
                    failing.append(sid)
                    details.append(
                        f"segment {sid} period {period}: clock rises from {a1['clock_ms']} to {a2['clock_ms']} between {a1['media_pts_ms']} and {a2['media_pts_ms']} ms"
                    )
    rule("monotonic_clock", failing, details)

    # 2. anchors live only in live segments
    failing, details = [], []
    for a in anchors:
        seg = segments.get(a["segment_id"])
        if seg is None or seg["classification"] != "live":
            failing.append(a["segment_id"] or "none")
            details.append(
                f"anchor {a['anchor_id']} is in a {seg['classification'] if seg else 'missing'} segment"
            )
    rule("anchors_in_live_segments", failing, details)

    # 3. links with timing sit inside their segment
    failing, details = [], []
    for link in links:
        seg = segments.get(link.get("segment_id"))
        if seg and link.get("media_start_ms") is not None and link.get("media_end_ms") is not None:
            if (
                link["media_start_ms"] < seg["media_start_ms"]
                or link["media_end_ms"] > seg["media_end_ms"]
            ):
                failing.append(seg["segment_id"])
                details.append(
                    f"link {link['link_id']} spans {link['media_start_ms']}-{link['media_end_ms']} ms outside segment {seg['segment_id']}"
                )
    rule("links_within_segments", failing, details)

    # 4. interpolated links carry an uncertainty
    failing, details = [], []
    for link in links:
        if link.get("alignment_method") == "interpolated" and link.get("timing_error_ms") is None:
            failing.append(link.get("segment_id") or "none")
            details.append(f"link {link['link_id']} is interpolated without timing_error_ms")
    rule("interpolated_links_have_error", failing, details)

    # 5. one period per live segment (a cut normally separates periods; a mix hides a missing cut)
    failing, details = [], []
    for sid in segments:
        periods = {a["period"] for a in anchors if a["segment_id"] == sid}
        if len(periods) > 1:
            failing.append(sid)
            details.append(f"segment {sid} has anchors from periods {sorted(periods)}")
    rule("single_period_per_segment", failing, details)

    return {
        "asset_id": asset_id,
        "ok": all(r["passed"] for r in rules),
        "rules": rules,
        "segments": len(segments),
        "anchors": len(anchors),
        "links": len(links),
    }
