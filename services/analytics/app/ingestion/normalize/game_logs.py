"""player_game_logs / team_game_logs: playergamelogs & teamgamelogs with home/opponent derivation."""

from __future__ import annotations

from collections.abc import Mapping

import pandas as pd

from app.ingestion.normalize.common import (
    Payload,
    box_mapping,
    cast_to_schema,
    pick,
    result_set,
    to_date,
    with_season,
)

_COMMON = {
    "TEAM_ID": "team_id",
    "TEAM_ABBREVIATION": "team_abbreviation",
    "GAME_ID": "game_id",
    "GAME_DATE": "game_date",
    "MATCHUP": "matchup",
    "WL": "wl",
    **box_mapping(),
}
_PLAYER = {"PLAYER_ID": "player_id", **_COMMON}


def parse_matchup(matchup: object) -> tuple[bool | None, str | None]:
    """``"BOS vs. NYK"`` -> (True, "NYK"); ``"BOS @ NYK"`` -> (False, "NYK")."""
    if matchup is None or not isinstance(matchup, str):
        return None, None
    text = matchup.strip()
    if " vs. " in text:
        return True, text.split(" vs. ", 1)[1].strip()
    if " @ " in text:
        return False, text.split(" @ ", 1)[1].strip()
    return None, None


def _derive(df: pd.DataFrame, abbreviations: Mapping[str, int]) -> pd.DataFrame:
    parsed = df["matchup"].map(parse_matchup)
    home = [p[0] for p in parsed]
    opp = [abbreviations.get(p[1]) if p[1] is not None else None for p in parsed]
    return df.assign(home=home, opponent_team_id=opp, game_date=to_date(df["game_date"]))


def normalize_player_game_logs(
    payload: Payload, *, season: str, season_type: str, abbreviations: Mapping[str, int]
) -> pd.DataFrame:
    raw = pick(result_set(payload, "PlayerGameLogs"), _PLAYER)
    if raw.empty:
        return cast_to_schema(pd.DataFrame(), "player_game_logs")
    out = with_season(_derive(raw, abbreviations), season, season_type)
    return cast_to_schema(out, "player_game_logs")


def normalize_team_game_logs(
    payload: Payload, *, season: str, season_type: str, abbreviations: Mapping[str, int]
) -> pd.DataFrame:
    raw = pick(result_set(payload, "TeamGameLogs"), _COMMON)
    if raw.empty:
        return cast_to_schema(pd.DataFrame(), "team_game_logs")
    out = with_season(_derive(raw, abbreviations), season, season_type)
    return cast_to_schema(out.drop(columns=["team_abbreviation"]), "team_game_logs")
