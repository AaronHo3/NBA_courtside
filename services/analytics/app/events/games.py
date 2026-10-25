"""``games`` family derived from ``team_game_logs``: one row per game, both teams, final scores.

Two log rows (one per team) normally describe a game. A game with a single row still yields both
team ids (own team + opponent) but the missing side's score stays null. Neutral-site games (both
rows say "@": Mexico City, Paris, NBA Cup knockout rounds) get ``neutral_site = true`` and their
home/away slots are filled deterministically (lower team id first) because the logs do not name a
designated home team. Contradictions between the two rows (both claim home, different dates) are
reported, never guessed away.
"""

from __future__ import annotations

import pandas as pd

from app.ingestion.normalize.common import cast_to_schema

GAMES_SOURCE_ENDPOINT = "derived:team_game_logs"


def _games_sorted(logs: pd.DataFrame) -> pd.DataFrame:
    return logs.sort_values(
        ["game_id", "home", "team_id"], ascending=[True, False, True], kind="stable"
    )


def incomplete_game_ids(logs: pd.DataFrame) -> list[str]:
    """Games represented by a single team row."""
    if logs.empty:
        return []
    counts = logs.groupby("game_id").size()
    return sorted(str(g) for g in counts[counts == 1].index)


def _is_neutral(group: pd.DataFrame) -> bool:
    homes = group["home"].tolist()
    return len(group) >= 2 and homes.count(True) == 0 and homes.count(False) == len(group)


def neutral_site_game_ids(logs: pd.DataFrame) -> list[str]:
    """Games where every team row says it played away: a neutral venue."""
    if logs.empty:
        return []
    return [str(g) for g, grp in logs.groupby("game_id", sort=True) if _is_neutral(grp)]


def inconsistent_game_ids(logs: pd.DataFrame) -> list[str]:
    """Two-row games whose rows disagree on who was home (both claim it) or on the date."""
    if logs.empty:
        return []
    bad: list[str] = []
    for game_id, group in logs.groupby("game_id", sort=True):
        if len(group) < 2 or _is_neutral(group):
            continue
        homes = group["home"].tolist()
        if homes.count(True) != 1 or homes.count(False) != 1 or group["game_date"].nunique() != 1:
            bad.append(str(game_id))
    return bad


def _one_game(game_id: str, group: pd.DataFrame) -> dict:
    rows = _games_sorted(group).to_dict("records")
    neutral = _is_neutral(group)
    home_row = next((r for r in rows if r["home"] is True), None)
    away_row = next((r for r in rows if r["home"] is False), None)
    if neutral:
        by_id = sorted(rows, key=lambda r: r["team_id"])  # no designated host: stable slot order
        home_team, away_team = by_id[0]["team_id"], by_id[1]["team_id"]
    elif home_row is not None:
        home_team, away_team = home_row["team_id"], home_row["opponent_team_id"]
    elif away_row is not None:
        home_team, away_team = away_row["opponent_team_id"], away_row["team_id"]
    else:  # home flag unparseable on every row: keep the first row as home, flagged by callers
        home_team, away_team = rows[0]["team_id"], rows[0]["opponent_team_id"]
    pts_by_team = {r["team_id"]: r["pts"] for r in rows}
    return {
        "game_id": str(game_id),
        "season": rows[0]["season"],
        "season_type": rows[0]["season_type"],
        "game_date": min(r["game_date"] for r in rows),
        "home_team_id": home_team,
        "away_team_id": away_team,
        "home_score": pts_by_team.get(home_team),
        "away_score": pts_by_team.get(away_team),
        "status": "final",
        "neutral_site": neutral,
        "periods": None,
        "attendance": None,
        "arena": None,
        "source_endpoint": GAMES_SOURCE_ENDPOINT,
    }


def derive_games(team_logs: pd.DataFrame) -> pd.DataFrame:
    if team_logs.empty:
        return cast_to_schema(pd.DataFrame(), "games")
    records = [_one_game(gid, grp) for gid, grp in team_logs.groupby("game_id", sort=True)]
    out = pd.DataFrame.from_records(records).sort_values(["game_date", "game_id"], kind="stable")
    return cast_to_schema(out.reset_index(drop=True), "games")
