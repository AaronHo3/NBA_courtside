"""stats.nba.com event clips as external references (DEC-08).

Stores a page reference and descriptive metadata from ``videoeventsasset`` (recorded shape, A-03):
``resultSets.playlist[0]`` (description, period, teams, scores) and ``resultSets.Meta.videoUrls[0]``
(clip uuid, durations). Media URLs are never copied out of the raw cache.
"""

from __future__ import annotations

from typing import Any

PROVIDER = "nba_stats_events"
EVENTS_PAGE = "https://www.nba.com/stats/events/?GameID={game_id}&GameEventID={event_id}&flag=1"
PLAYLIST_FIELDS = {
    "gi": ("game_id", str),
    "ei": ("event_id", int),
    "dsc": ("description", str),
    "p": ("period", int),
    "gc": ("game_code", str),
    "ha": ("home_team", str),
    "hid": ("home_team_id", int),
    "va": ("away_team", str),
    "vid": ("away_team_id", int),
    "hpb": ("home_score_before", int),
    "hpa": ("home_score_after", int),
    "vpb": ("away_score_before", int),
    "vpa": ("away_score_after", int),
}


def _coerce(value: Any, kind: type) -> Any:
    if value in (None, ""):
        return None
    try:
        return kind(value)
    except (TypeError, ValueError):
        return None


def metadata_from_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    sets = payload.get("resultSets")
    if not isinstance(sets, dict):
        return None
    playlist = sets.get("playlist") or []
    if not playlist:
        return None
    entry = playlist[0]
    meta = {name: _coerce(entry.get(key), kind) for key, (name, kind) in PLAYLIST_FIELDS.items()}
    if all(entry.get(k) for k in ("y", "m", "d")):
        meta["game_date"] = f"{entry['y']}-{str(entry['m']).zfill(2)}-{str(entry['d']).zfill(2)}"
    urls = (sets.get("Meta") or {}).get("videoUrls") or []
    first = urls[0] if urls else {}
    meta["clip_uuid"] = first.get("uuid")
    meta["duration_ms"] = _coerce(first.get("mdur") or first.get("sdur") or first.get("ldur"), int)
    return meta


class NbaStatsEventsAdapter:
    name = PROVIDER
    mode = "external_reference"

    def reference_url(self, game_id: str, event_id: int) -> str:
        return EVENTS_PAGE.format(game_id=game_id, event_id=int(event_id))

    def ref_key(self, game_id: str, event_id: int) -> str:
        return f"{PROVIDER}:{game_id}:{int(event_id)}"

    def metadata_request(self, game_id: str, event_id: int) -> tuple[str, dict[str, Any]]:
        return "videoeventsasset", {"game_id": game_id, "game_event_id": int(event_id)}

    def parse_metadata(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        return metadata_from_payload(payload)
