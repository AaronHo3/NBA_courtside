"""matchups family: leagueseasonmatchups (Totals), offensive player x defender per season."""

from __future__ import annotations

from collections.abc import Iterable

import pandas as pd

from app.ingestion.normalize.common import Payload, cast_to_schema, pick, result_set, with_season

RESULT_SET = "SeasonMatchups"
_MAPPING = {
    "OFF_PLAYER_ID": "off_player_id",
    "DEF_PLAYER_ID": "def_player_id",
    "GP": "gp",
    "MATCHUP_MIN": "matchup_min",
    "PARTIAL_POSS": "partial_poss",
    "PLAYER_PTS": "player_pts",
    "TEAM_PTS": "team_pts",
    "MATCHUP_AST": "matchup_ast",
    "MATCHUP_TOV": "matchup_tov",
    "MATCHUP_BLK": "matchup_blk",
    "MATCHUP_FGM": "matchup_fgm",
    "MATCHUP_FGA": "matchup_fga",
    "MATCHUP_FG3M": "matchup_fg3m",
    "MATCHUP_FG3A": "matchup_fg3a",
    "HELP_BLK": "help_blk",
    "HELP_FGM": "help_fgm",
    "HELP_FGA": "help_fga",
    "MATCHUP_FTM": "matchup_ftm",
    "MATCHUP_FTA": "matchup_fta",
    "SFL": "sfl",
}


def normalize_matchups(
    payloads: Iterable[Payload], *, season: str, season_type: str
) -> pd.DataFrame:
    frames = [pick(result_set(p, RESULT_SET), _MAPPING) for p in payloads]
    frames = [f for f in frames if not f.empty]
    if not frames:
        return cast_to_schema(pd.DataFrame(), "matchups")
    raw = pd.concat(frames, ignore_index=True).drop_duplicates(
        subset=["off_player_id", "def_player_id"]
    )
    return cast_to_schema(with_season(raw, season, season_type), "matchups")
