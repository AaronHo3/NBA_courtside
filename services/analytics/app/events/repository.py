"""Event queries over the ``events``, ``event_participants`` and ``event_id_map`` views."""

from __future__ import annotations

import json
from typing import Any

import pandas as pd

from app.data.db import Database


def _records(df: pd.DataFrame) -> list[dict[str, Any]]:
    if df.empty:
        return []
    return json.loads(df.to_json(orient="records", date_format="iso", date_unit="s"))


def game_events(
    db: Database,
    game_id: str,
    *,
    period: int | None = None,
    action_type: str | None = None,
    person_id: int | None = None,
    is_field_goal: bool | None = None,
    limit: int | None = None,
) -> pd.DataFrame:
    where = ["game_id = ?"]
    params: list[Any] = [game_id]
    if period is not None:
        where.append("period = ?")
        params.append(period)
    if action_type is not None:
        where.append("action_type = ?")
        params.append(action_type)
    if person_id is not None:
        where.append("person_id = ?")
        params.append(person_id)
    if is_field_goal is not None:
        where.append("is_field_goal = ?")
        params.append(is_field_goal)
    sql = f"SELECT * FROM events WHERE {' AND '.join(where)} ORDER BY source_order"
    if limit is not None:
        sql += " LIMIT ?"
        params.append(int(limit))
    return db.query(sql, params)


def event(db: Database, system: str, game_id: str, event_id: int) -> dict[str, Any] | None:
    rows = db.query(
        "SELECT * FROM events WHERE source_event_system = ? AND game_id = ? AND source_event_id = ? ORDER BY source_order",
        [system, game_id, event_id],
    )
    if rows.empty:
        return None
    participants = db.query(
        "SELECT * FROM event_participants WHERE source_event_system = ? AND game_id = ? AND source_event_id = ? ORDER BY source_order",
        [system, game_id, event_id],
    )
    copies = _records(rows)
    return {"event": copies[0], "duplicates": copies, "participants": _records(participants)}


def events_for_shot(db: Database, game_id: str, game_event_id: int) -> dict[str, Any] | None:
    mapped = db.query(
        "SELECT * FROM event_id_map WHERE game_id = ? AND shots_game_event_id = ?",
        [game_id, game_event_id],
    )
    if mapped.empty:
        return None
    row = _records(mapped)[0]
    action = row.get("pbp_v3_action_number")
    detail = None
    if action is not None:
        # the map stores action numbers; the event system comes from the game's events (pbp_v3, or
        # demo_shots in the synthetic namespace)
        systems = db.query(
            "SELECT DISTINCT source_event_system AS s FROM events WHERE game_id = ? AND source_event_id = ?",
            [game_id, int(action)],
        )
        for system in sorted(systems["s"].tolist(), key=lambda x: x != "pbp_v3"):
            detail = event(db, system, game_id, int(action))
            if detail is not None:
                break
    return {
        "method": row["method"],
        "confidence": row["confidence"],
        "verified_at": row.get("verified_at"),
        "event": detail["event"] if detail else None,
        "participants": detail["participants"] if detail else [],
    }


# --- games ---------------------------------------------------------------------------------------


def game(db: Database, game_id: str) -> dict[str, Any] | None:
    rows = db.query("SELECT * FROM games WHERE game_id = ?", [game_id])
    return _records(rows)[0] if not rows.empty else None


def games(
    db: Database, season: str, season_type: str, *, limit: int = 50, offset: int = 0
) -> tuple[pd.DataFrame, int]:
    total = int(
        db.scalar(
            "SELECT COUNT(*) FROM games WHERE season = ? AND season_type = ?", [season, season_type]
        )
        or 0
    )
    df = db.query(
        "SELECT * FROM games WHERE season = ? AND season_type = ? ORDER BY game_date, game_id LIMIT ? OFFSET ?",
        [season, season_type, int(limit), int(offset)],
    )
    return df, total


def game_coverage(db: Database, game_id: str) -> dict[str, int]:
    return {
        "events": int(db.scalar("SELECT COUNT(*) FROM events WHERE game_id = ?", [game_id]) or 0),
        "shots": int(db.scalar("SELECT COUNT(*) FROM shots WHERE game_id = ?", [game_id]) or 0),
        "mapped_shots": int(
            db.scalar(
                "SELECT COUNT(*) FROM event_id_map WHERE game_id = ? AND confidence IN ('exact', 'probable')",
                [game_id],
            )
            or 0
        ),
    }


def _event_where(
    game_id: str,
    period: int | None,
    action_type: str | None,
    person_id: int | None,
    is_field_goal: bool | None,
) -> tuple[str, list[Any]]:
    where, params = ["game_id = ?"], [game_id]
    if period is not None:
        where.append("period = ?")
        params.append(period)
    if action_type is not None:
        where.append("action_type = ?")
        params.append(action_type)
    if person_id is not None:
        where.append("person_id = ?")
        params.append(person_id)
    if is_field_goal is not None:
        where.append("is_field_goal = ?")
        params.append(is_field_goal)
    return " AND ".join(where), params


def game_events_page(
    db: Database,
    game_id: str,
    *,
    period: int | None = None,
    action_type: str | None = None,
    person_id: int | None = None,
    is_field_goal: bool | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[pd.DataFrame, int]:
    clause, params = _event_where(game_id, period, action_type, person_id, is_field_goal)
    total = int(db.scalar(f"SELECT COUNT(*) FROM events WHERE {clause}", params) or 0)
    df = db.query(
        f"SELECT * FROM events WHERE {clause} ORDER BY source_order LIMIT ? OFFSET ?",
        [*params, int(limit), int(offset)],
    )
    return df, total


def shot_for_event(db: Database, system: str, game_id: str, event_id: int) -> dict[str, Any] | None:
    """The shot row an action maps to (reverse of ``events_for_shot``), with the map's method."""
    column = "pbp_v3_action_number" if system == "pbp_v3" else "pbp_v2_eventnum"
    if system == "demo_shots":
        column = "pbp_v3_action_number"
    mapped = db.query(
        f"SELECT * FROM event_id_map WHERE game_id = ? AND {column} = ?", [game_id, event_id]
    )
    if mapped.empty:
        return None
    m = _records(mapped)[0]
    shots = db.query(
        "SELECT * FROM shots WHERE game_id = ? AND game_event_id = ?",
        [game_id, m["shots_game_event_id"]],
    )
    shot = _records(shots)[0] if not shots.empty else {"game_event_id": m["shots_game_event_id"]}
    return {
        **shot,
        "map": {
            "method": m["method"],
            "confidence": m["confidence"],
            "verified_at": m.get("verified_at"),
        },
    }


def game_roster(db: Database, game_id: str) -> list[dict[str, Any]]:
    """Both teams' players for one game from ``player_game_logs``, with names when ``players`` exists."""
    if "player_game_logs" not in db.available_families():
        return []
    logs = db.query(
        """SELECT DISTINCT player_id, team_id, team_abbreviation FROM player_game_logs
           WHERE game_id = ? ORDER BY team_abbreviation, player_id""",
        [game_id],
    )
    if logs.empty:
        return []
    rows = _records(logs)
    if "players" in db.available_families():
        names = db.query(
            "SELECT player_id, full_name, position FROM players WHERE player_id IN (SELECT player_id FROM player_game_logs WHERE game_id = ?)",
            [game_id],
        )
        by_id = {int(r["player_id"]): r for r in _records(names)}
    else:
        by_id = {}
    return [
        {
            **r,
            "full_name": by_id.get(int(r["player_id"]), {}).get("full_name"),
            "position": by_id.get(int(r["player_id"]), {}).get("position"),
        }
        for r in rows
    ]
