"""Shot queries: markers, hex bins, zone summaries, filter options, availability."""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from app.analytics.shooting import aggregate_hex_bins, aggregate_zones
from app.data.db import Database
from app.data.manifest import Manifest
from app.data.paths import DataLayout

UNSUPPORTED_FILTERS = [
    {
        "key": "defender_distance",
        "reason": "closest-defender distance is not part of the public shot chart data",
    },
    {"key": "shot_clock", "reason": "shot-clock state is not part of the public shot chart data"},
    {
        "key": "touch_time",
        "reason": "touch time / dribbles are tracking data not available per shot",
    },
]


@dataclass(frozen=True)
class ShotFilters:
    season: str
    season_type: str = "Regular Season"
    player_ids: tuple[int, ...] = ()
    team_id: int | None = None
    opponent_team_id: int | None = None
    period: int | None = None
    shot_type: str | None = None  # "2PT" | "3PT"
    made: bool | None = None
    min_distance: float | None = None
    max_distance: float | None = None
    date_from: str | None = None
    date_to: str | None = None
    game_id: str | None = None
    zone_basic: str | None = None
    action_type: str | None = None
    home: bool | None = None
    extra: dict = field(default_factory=dict)

    def has_subject(self) -> bool:
        return bool(self.player_ids) or self.team_id is not None


def _where(f: ShotFilters) -> tuple[str, list]:
    clauses = ["season = ?", "season_type = ?"]
    params: list = [f.season, f.season_type]
    if f.player_ids:
        clauses.append(f"player_id IN ({','.join('?' for _ in f.player_ids)})")
        params.extend(f.player_ids)
    if f.team_id is not None:
        clauses.append("team_id = ?")
        params.append(f.team_id)
    if f.opponent_team_id is not None:
        clauses.append("opponent_team_id = ?")
        params.append(f.opponent_team_id)
    if f.period is not None:
        clauses.append("period = ?")
        params.append(f.period)
    if f.shot_type:
        clauses.append("shot_type = ?")
        params.append("3PT Field Goal" if f.shot_type.upper().startswith("3") else "2PT Field Goal")
    if f.made is not None:
        clauses.append("shot_made_flag = ?")
        params.append(1 if f.made else 0)
    if f.min_distance is not None:
        clauses.append("shot_distance >= ?")
        params.append(f.min_distance)
    if f.max_distance is not None:
        clauses.append("shot_distance <= ?")
        params.append(f.max_distance)
    if f.date_from:
        clauses.append("game_date >= ?")
        params.append(f.date_from)
    if f.date_to:
        clauses.append("game_date <= ?")
        params.append(f.date_to)
    if f.game_id:
        clauses.append("game_id = ?")
        params.append(f.game_id)
    if f.zone_basic:
        clauses.append("shot_zone_basic = ?")
        params.append(f.zone_basic)
    if f.action_type:
        clauses.append("action_type = ?")
        params.append(f.action_type)
    if f.home is not None:
        clauses.append("home = ?")
        params.append(f.home)
    return " AND ".join(clauses), params


def availability(layout: DataLayout, season: str, season_type: str) -> tuple[bool, str | None]:
    entry = Manifest.load(layout).find("shots", season, season_type)
    if entry is None:
        return False, f"no shot data has been ingested for {season} {season_type}"
    if entry.status not in ("ok", "partial") or entry.rows == 0:
        return (
            False,
            entry.note or entry.error or f"shot data for {season} {season_type} is {entry.status}",
        )
    return True, None


def fetch(db: Database, f: ShotFilters) -> pd.DataFrame:
    where, params = _where(f)
    return db.query(f"SELECT * FROM shots WHERE {where}", params)


def markers(db: Database, f: ShotFilters, limit: int) -> tuple[pd.DataFrame, int]:
    where, params = _where(f)
    total = int(db.scalar(f"SELECT COUNT(*) FROM shots WHERE {where}", params) or 0)
    cols = (
        "game_id, game_event_id, player_id, team_id, opponent_team_id, game_date, period, minutes_remaining, "
        "seconds_remaining, action_type, shot_type, shot_zone_basic, shot_zone_area, shot_zone_range, "
        "shot_distance, loc_x, loc_y, shot_made_flag, home"
    )
    df = db.query(
        f"SELECT {cols} FROM shots WHERE {where} ORDER BY game_date, game_event_id LIMIT ?",
        [*params, limit],
    )
    return df, total


def league_zone_baseline(db: Database, season: str, season_type: str) -> pd.DataFrame:
    df = db.query(
        "SELECT shot_zone_basic, SUM(fga) AS fga, SUM(fgm) AS fgm FROM shot_league_zone_avg WHERE season = ? AND season_type = ? GROUP BY 1",
        [season, season_type],
    )
    return df


def hexbins(db: Database, f: ShotFilters, size_ft: float, min_attempts: int) -> pd.DataFrame:
    shots = fetch(db, f)
    return aggregate_hex_bins(
        shots,
        size_ft=size_ft,
        min_attempts=min_attempts,
        league_zone=league_zone_baseline(db, f.season, f.season_type),
    )


def zones(db: Database, f: ShotFilters, min_attempts: int) -> pd.DataFrame:
    shots = fetch(db, f)
    return aggregate_zones(
        shots,
        min_attempts=min_attempts,
        league_zone=league_zone_baseline(db, f.season, f.season_type),
    )


def filter_options(db: Database, f: ShotFilters) -> dict:
    where, params = _where(
        ShotFilters(
            season=f.season, season_type=f.season_type, player_ids=f.player_ids, team_id=f.team_id
        )
    )
    opp = db.query(
        f"SELECT DISTINCT s.opponent_team_id AS team_id, t.abbreviation, t.full_name FROM shots s LEFT JOIN teams t ON t.team_id = s.opponent_team_id WHERE {where} ORDER BY 2",
        params,
    )
    periods = db.query(f"SELECT DISTINCT period FROM shots WHERE {where} ORDER BY 1", params)[
        "period"
    ].tolist()
    actions = db.query(
        f"SELECT action_type, COUNT(*) AS n FROM shots WHERE {where} GROUP BY 1 ORDER BY n DESC",
        params,
    )
    dates = db.query(
        f"SELECT MIN(game_date) AS min, MAX(game_date) AS max FROM shots WHERE {where}", params
    )
    zones_ = db.query(f"SELECT DISTINCT shot_zone_basic FROM shots WHERE {where}", params)[
        "shot_zone_basic"
    ].tolist()
    return {
        "opponents": opp.to_dict("records"),
        "periods": periods,
        "action_types": actions.to_dict("records"),
        "zones": zones_,
        "date_range": {
            "min": str(dates.iloc[0]["min"])
            if not dates.empty and pd.notna(dates.iloc[0]["min"])
            else None,
            "max": str(dates.iloc[0]["max"])
            if not dates.empty and pd.notna(dates.iloc[0]["max"])
            else None,
        },
        "supported": [
            "season",
            "season_type",
            "opponent",
            "period",
            "shot_type",
            "made",
            "distance",
            "date",
            "game",
            "zone",
            "action_type",
            "home_away",
        ],
        "unsupported": UNSUPPORTED_FILTERS,
    }
