"""shots + shot_league_zone_avg families from shotchartdetail (zone labels kept verbatim)."""

from __future__ import annotations

from collections.abc import Iterable, Mapping

import pandas as pd

from app.ingestion.normalize.common import (
    Payload,
    cast_to_schema,
    pick,
    result_set,
    to_date,
    with_season,
)

DETAIL_SET = "Shot_Chart_Detail"
LEAGUE_SET = "LeagueAverages"
_MAPPING = {
    "GAME_ID": "game_id",
    "GAME_EVENT_ID": "game_event_id",
    "PLAYER_ID": "player_id",
    "TEAM_ID": "team_id",
    "TEAM_NAME": "team_name",
    "PERIOD": "period",
    "MINUTES_REMAINING": "minutes_remaining",
    "SECONDS_REMAINING": "seconds_remaining",
    "EVENT_TYPE": "event_type",
    "ACTION_TYPE": "action_type",
    "SHOT_TYPE": "shot_type",
    "SHOT_ZONE_BASIC": "shot_zone_basic",
    "SHOT_ZONE_AREA": "shot_zone_area",
    "SHOT_ZONE_RANGE": "shot_zone_range",
    "SHOT_DISTANCE": "shot_distance",
    "LOC_X": "loc_x",
    "LOC_Y": "loc_y",
    "SHOT_MADE_FLAG": "shot_made_flag",
    "GAME_DATE": "game_date",
    "HTM": "htm",
    "VTM": "vtm",
}
_ZONE_MAPPING = {
    "SHOT_ZONE_BASIC": "shot_zone_basic",
    "SHOT_ZONE_AREA": "shot_zone_area",
    "SHOT_ZONE_RANGE": "shot_zone_range",
    "FGA": "fga",
    "FGM": "fgm",
}


def _team_abbreviation(row: pd.Series, teams: pd.DataFrame) -> str | None:
    by_id = teams.set_index("team_id")["abbreviation"]
    if row["team_id"] in by_id.index:
        return str(by_id.loc[row["team_id"]])
    by_name = teams.set_index("full_name")["abbreviation"]
    name = row.get("team_name")
    return str(by_name.loc[name]) if name in by_name.index else None


def _derive_home_and_opponent(
    df: pd.DataFrame, teams: pd.DataFrame, abbreviations: Mapping[str, int]
) -> pd.DataFrame:
    own = df.apply(lambda r: _team_abbreviation(r, teams), axis=1)
    home = [None if o is None else o == h for o, h in zip(own, df["htm"], strict=True)]
    opp_abbr = [
        None if hm is None else (v if hm else h)
        for hm, h, v in zip(home, df["htm"], df["vtm"], strict=True)
    ]
    opponent = [abbreviations.get(a) if a is not None else None for a in opp_abbr]
    return df.assign(home=home, opponent_team_id=opponent)


def normalize_shots(
    payloads: Iterable[Payload], *, season: str, season_type: str, teams: pd.DataFrame
) -> pd.DataFrame:
    """Concatenate Shot_Chart_Detail sets (one or many payloads), dedupe on (game_id, event)."""
    frames = [pick(result_set(p, DETAIL_SET), _MAPPING) for p in payloads]
    frames = [f for f in frames if not f.empty]
    if not frames:
        return cast_to_schema(pd.DataFrame(), "shots")
    raw = pd.concat(frames, ignore_index=True).drop_duplicates(subset=["game_id", "game_event_id"])
    abbreviations = {
        str(a): int(i) for a, i in zip(teams["abbreviation"], teams["team_id"], strict=True)
    }
    derived = _derive_home_and_opponent(raw, teams, abbreviations)
    derived = derived.assign(game_date=to_date(derived["game_date"].astype(str)))
    return cast_to_schema(with_season(derived, season, season_type), "shots")


def normalize_league_zone_avg(payload: Payload, *, season: str, season_type: str) -> pd.DataFrame:
    raw = pick(result_set(payload, LEAGUE_SET), _ZONE_MAPPING)
    if raw.empty:
        return cast_to_schema(pd.DataFrame(), "shot_league_zone_avg")
    return cast_to_schema(with_season(raw, season, season_type), "shot_league_zone_avg")


def merge_shots(existing: pd.DataFrame, incoming: pd.DataFrame) -> pd.DataFrame:
    """Union of two shot frames, newest wins on (game_id, game_event_id); inputs untouched."""
    if existing.empty:
        return incoming.copy()
    if incoming.empty:
        return existing.copy()
    combined = pd.concat([incoming, existing], ignore_index=True)
    return combined.drop_duplicates(subset=["game_id", "game_event_id"], keep="first").reset_index(
        drop=True
    )
