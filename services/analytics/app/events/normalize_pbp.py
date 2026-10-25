"""``playbyplayv3`` -> ``events`` + ``event_participants``.

Every source action becomes one row (``source_order`` preserves the response order even when
``actionNumber`` repeats); the untouched action is kept in ``raw_json``. Participants come only
from structured ids: v3 names one ``personId`` per action, so a substitution yields the outgoing
player only (the incoming player is text in ``description`` and is never inferred).
"""

from __future__ import annotations

import json
import re
from typing import Any

import pandas as pd

from app.ingestion.normalize.common import cast_to_schema

NORMALIZER_VERSION = 1
SYSTEM_V3 = "pbp_v3"
TEAM_ID_FLOOR = 1_610_612_000  # provider team ids; v3 puts them in personId for team events
_CLOCK = re.compile(r"^PT(\d+)M(\d+(?:\.\d+)?)S$")
_ROLE_BY_ACTION = {"Substitution": "substituted_out", "Jump Ball": "jumper"}


def parse_clock(text: object) -> int | None:
    """``PT11M48.00S`` -> 708000 ms remaining; None when absent or unparseable."""
    if not isinstance(text, str):
        return None
    match = _CLOCK.match(text.strip())
    if not match:
        return None
    minutes, seconds = int(match.group(1)), float(match.group(2))
    return int(round((minutes * 60 + seconds) * 1000))


def _none_if_blank(value: Any) -> Any:
    return None if value in ("", None) else value


def _int_or_none(value: Any) -> int | None:
    if value in ("", None):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _ids(action: dict[str, Any]) -> tuple[int | None, int | None]:
    """(person_id, team_id); a team event carries the team id in personId with teamId 0."""
    person = _int_or_none(action.get("personId")) or None
    team = _int_or_none(action.get("teamId")) or None
    if person is not None and person >= TEAM_ID_FLOOR:
        return None, team or person
    return person, team


def _event_row(action: dict[str, Any], order: int, duplicate_of: int | None, game_id: str) -> dict:
    person, team = _ids(action)
    return {
        "game_id": game_id,
        "source_event_system": SYSTEM_V3,
        "source_event_id": _int_or_none(action.get("actionNumber")),
        "source_order": order,
        "duplicate_of": duplicate_of,
        "period": _int_or_none(action.get("period")),
        "clock_ms": parse_clock(action.get("clock")),
        "wall_clock": None,
        "action_type": _none_if_blank(action.get("actionType")),
        "sub_type": _none_if_blank(action.get("subType")),
        "description": _none_if_blank(action.get("description")),
        "team_id": team,
        "person_id": person,
        "is_field_goal": bool(_int_or_none(action.get("isFieldGoal")) or 0),
        "shot_result": _none_if_blank(action.get("shotResult")),
        "shot_value": _int_or_none(action.get("shotValue")),
        "x_legacy": _int_or_none(action.get("xLegacy")),
        "y_legacy": _int_or_none(action.get("yLegacy")),
        "shot_distance": _int_or_none(action.get("shotDistance")),
        "score_home": _int_or_none(action.get("scoreHome")),
        "score_away": _int_or_none(action.get("scoreAway")),
        "video_available": bool(_int_or_none(action.get("videoAvailable")) or 0),
        "action_id": _int_or_none(action.get("actionId")),
        "raw_json": json.dumps(action, separators=(",", ":"), default=str),
        "normalizer_version": NORMALIZER_VERSION,
    }


def _participant_row(event: dict, action_type: str | None) -> dict:
    return {
        "game_id": event["game_id"],
        "source_event_system": SYSTEM_V3,
        "source_event_id": event["source_event_id"],
        "source_order": event["source_order"],
        "role": _ROLE_BY_ACTION.get(action_type or "", "actor"),
        "person_id": event["person_id"],
        "team_id": event["team_id"],
        "source_slot": "personId",
        "duplicate_of": event["duplicate_of"],
    }


def normalize_pbp_v3(
    payload: dict[str, Any], *, game_id: str, season: str, season_type: str
) -> tuple[pd.DataFrame, pd.DataFrame]:
    actions = (payload.get("game") or {}).get("actions") or []
    events: list[dict] = []
    participants: list[dict] = []
    first_order_by_number: dict[int | None, int] = {}
    for order, action in enumerate(actions):
        number = _int_or_none(action.get("actionNumber"))
        duplicate_of = first_order_by_number.get(number)
        first_order_by_number.setdefault(number, order)
        row = _event_row(action, order, duplicate_of, game_id)
        events.append(row)
        if row["person_id"] is not None:
            participants.append(_participant_row(row, row["action_type"]))
    events_df = _finish(pd.DataFrame(events), "events", season, season_type)
    participants_df = _finish(pd.DataFrame(participants), "event_participants", season, season_type)
    return events_df, participants_df


def _finish(df: pd.DataFrame, family: str, season: str, season_type: str) -> pd.DataFrame:
    if df.empty:
        return cast_to_schema(pd.DataFrame(), family)
    return cast_to_schema(df.assign(season=season, season_type=season_type), family)
