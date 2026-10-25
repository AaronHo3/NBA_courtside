"""Bounded capability probe for candidate endpoints (DECISIONS DEC-07).

Calls a small, capped set of endpoints for one game through the normal provider (pacing, retries,
raw cache) and records what actually came back: result-set names, row counts, field names, errors.
Nothing downstream may treat an endpoint as available until this log says so. Optionally saves
scrubbed fixtures (headers + first rows) for the ingestion tests.
"""

from __future__ import annotations

import copy
import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.data.paths import DataLayout
from app.ingestion.cache import get_or_fetch
from app.ingestion.providers.base import ProviderError, StatsProvider

CAPABILITY_LOG_NAME = "capability_log.jsonl"
CACHE_FAMILY = "capability_probe"
DEFAULT_MAX_CALLS = 10
FIXTURE_ROWS = 50
GAME_ENDPOINTS: tuple[str, ...] = (
    "playbyplayv3",
    "playbyplayv2",
    "gamerotation",
    "boxscoretraditionalv3",
)


@dataclass(frozen=True)
class ProbeCall:
    endpoint: str
    params: dict[str, Any]
    fixture_suffix: str


@dataclass(frozen=True)
class CapabilityRecord:
    endpoint: str
    params: dict[str, Any]
    status: str  # ok | empty | error | unreachable
    result_set_names: list[str]
    row_count: int
    fields_seen: dict[str, list[str]]
    fetched_at: str
    error: str | None
    from_cache: bool = field(default=False)


def season_from_game_id(game_id: str) -> str:
    """``0022400061`` -> ``2024-25`` (digits 3-4 are the season start year's last two digits)."""
    yy = int(game_id[3:5])
    start = 2000 + yy if yy < 50 else 1900 + yy
    return f"{start}-{str(start + 1)[-2:]}"


def plan_probe_calls(
    game_id: str,
    event_ids: list[int],
    shooter: tuple[int, int] | None,
    max_calls: int = DEFAULT_MAX_CALLS,
) -> list[ProbeCall]:
    """Game-level endpoints first, then one video-event call per event, then one video-details call."""
    calls = [ProbeCall(ep, {"game_id": game_id}, f"game_{game_id}") for ep in GAME_ENDPOINTS]
    for event_id in event_ids:
        calls.append(
            ProbeCall(
                "videoeventsasset",
                {"game_id": game_id, "game_event_id": int(event_id)},
                f"game_{game_id}__event_{int(event_id)}",
            )
        )
    if shooter is not None:
        team_id, player_id = shooter
        calls.append(
            ProbeCall(
                "videodetailsasset",
                {
                    "team_id": int(team_id),
                    "player_id": int(player_id),
                    "game_id_nullable": game_id,
                    "season": season_from_game_id(game_id),
                    "season_type_all_star": "Regular Season",
                    "context_measure_detailed": "FGA",
                },
                f"game_{game_id}__player_{int(player_id)}",
            )
        )
    return calls[:max_calls]


def _list_of_rows(value: Any) -> bool:
    return isinstance(value, list) and bool(value) and isinstance(value[0], list | dict)


MAX_DEPTH = 4


def _collect_row_lists(node: Any, path: str, depth: int, out: list[tuple[str, list]]) -> None:
    if depth > MAX_DEPTH or not isinstance(node, dict):
        return
    for key, value in node.items():
        name = f"{path}.{key}" if path else str(key)
        if _list_of_rows(value):
            out.append((name, value))
        elif isinstance(value, dict):
            _collect_row_lists(value, name, depth + 1, out)


def summarise_payload(payload: dict[str, Any]) -> tuple[list[str], int, dict[str, list[str]]]:
    """Result-set names, total rows and field names.

    Handles the classic ``resultSets`` list (headers + rowSet), ``resultSets`` as a dict (video
    endpoints) and nested v3 documents (``game.actions``, ``boxScoreTraditional.homeTeam.players``).
    """
    names: list[str] = []
    rows = 0
    fields: dict[str, list[str]] = {}
    if isinstance(payload.get("resultSets"), list):
        for rs in payload["resultSets"]:
            name = str(rs.get("name", "?"))
            names.append(name)
            rows += len(rs.get("rowSet") or [])
            fields[name] = [str(h) for h in rs.get("headers") or []]
        return names, rows, fields
    found: list[tuple[str, list]] = []
    _collect_row_lists(payload, "", 0, found)
    for name, lst in found:
        names.append(name)
        rows += len(lst)
        first = lst[0]
        fields[name] = sorted(first) if isinstance(first, dict) else []
    return names, rows, fields


def scrub_payload(payload: dict[str, Any], max_rows: int = FIXTURE_ROWS) -> dict[str, Any]:
    """Deep copy for a committed fixture: row lists truncated to ``max_rows``, URLs redacted.

    Media URLs are redacted so the repository never carries links to provider streams; the raw
    cache under ``data/`` keeps the untouched response.
    """

    def trim(node: Any, depth: int) -> Any:
        if isinstance(node, list):
            if _list_of_rows(node) and depth <= MAX_DEPTH:
                node = node[:max_rows]
            return [trim(x, depth + 1) for x in node]
        if isinstance(node, dict):
            return {k: trim(v, depth + 1) for k, v in node.items()}
        if isinstance(node, str) and node.startswith(("http://", "https://")):
            return "<redacted-url>"
        return node

    return trim(copy.deepcopy(payload), 0)


def _record(
    call: ProbeCall, provider: StatsProvider, layout: DataLayout
) -> tuple[CapabilityRecord, dict | None]:
    try:
        raw = get_or_fetch(provider, layout, CACHE_FAMILY, call.endpoint, call.params)
    except ProviderError as exc:
        return (
            CapabilityRecord(call.endpoint, call.params, "error", [], 0, {}, _now(), str(exc)),
            None,
        )
    names, rows, fields = summarise_payload(raw.payload)
    status = "ok" if rows > 0 else "empty"
    return (
        CapabilityRecord(
            call.endpoint,
            call.params,
            status,
            names,
            rows,
            fields,
            raw.fetched_at.isoformat(),
            None,
            from_cache=raw.from_cache,
        ),
        raw.payload,
    )


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _append_log(layout: DataLayout, records: list[CapabilityRecord]) -> None:
    path = layout.namespace_dir / CAPABILITY_LOG_NAME
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        for rec in records:
            fh.write(json.dumps(asdict(rec), default=str) + "\n")


def probe_capabilities(
    provider: StatsProvider,
    layout: DataLayout,
    game_id: str,
    event_ids: list[int],
    shooter: tuple[int, int] | None,
    max_calls: int = DEFAULT_MAX_CALLS,
    fixtures_dir: Path | None = None,
) -> list[CapabilityRecord]:
    if not provider.probe():
        records = [
            CapabilityRecord("probe", {}, "unreachable", [], 0, {}, _now(), "provider probe failed")
        ]
        _append_log(layout, records)
        return records
    records: list[CapabilityRecord] = []
    for call in plan_probe_calls(game_id, event_ids, shooter, max_calls):
        rec, payload = _record(call, provider, layout)
        records.append(rec)
        if fixtures_dir is not None and payload is not None and rec.status == "ok":
            fixtures_dir.mkdir(parents=True, exist_ok=True)
            target = fixtures_dir / f"{call.endpoint}__{call.fixture_suffix}.json"
            target.write_text(json.dumps(scrub_payload(payload), indent=1, default=str))
    _append_log(layout, records)
    return records
