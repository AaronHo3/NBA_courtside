"""Direct offender-vs-defender matchup queries with shrinkage and uncertainty."""

from __future__ import annotations

import pandas as pd

from app.analytics.metrics import series_safe_div
from app.analytics.uncertainty import beta_shrink, wilson_interval
from app.data.db import Database
from app.data.manifest import Manifest
from app.data.paths import DataLayout

DEFAULT_PRIOR_STRENGTH = 25.0  # pseudo-attempts
WORDING = (
    "Values describe the lowest observed efficiency (or the highest) among qualifying matchups, not a "
    "player's 'worst matchup'. Matchup attribution, switching, help defense, opponent selection "
    "and team scheme limit what individual matchup data can show."
)


def availability(layout: DataLayout, season: str, season_type: str) -> tuple[bool, str | None]:
    entry = Manifest.load(layout).find("matchups", season, season_type)
    if entry is None:
        return (
            False,
            f"no matchup data has been ingested for {season} {season_type} (the provider publishes matchups from 2017-18)",
        )
    if entry.status not in ("ok", "partial") or entry.rows == 0:
        return (
            False,
            entry.note
            or entry.error
            or f"matchup data for {season} {season_type} is {entry.status}",
        )
    return True, None


def league_prior(db: Database, season: str, season_type: str) -> float:
    row = db.query(
        "SELECT SUM(matchup_fgm) AS m, SUM(matchup_fga) AS a FROM matchups WHERE season = ? AND season_type = ?",
        [season, season_type],
    ).iloc[0]
    return float(row["m"] / row["a"]) if row["a"] and row["a"] > 0 else 0.45


def _enrich(
    df: pd.DataFrame, prior_mean: float, prior_strength: float, min_poss: float
) -> pd.DataFrame:
    if df.empty:
        return df
    out = df.copy()
    out["fg_pct"] = series_safe_div(out["matchup_fgm"], out["matchup_fga"])
    out["fg3_pct"] = series_safe_div(out["matchup_fg3m"], out["matchup_fg3a"])
    out["fg_pct_shrunk"] = [
        beta_shrink(int(m), int(a), prior_mean, prior_strength) if pd.notna(a) else None
        for m, a in zip(out["matchup_fgm"], out["matchup_fga"], strict=True)
    ]
    cis = [
        wilson_interval(int(m), int(a)) if pd.notna(a) and a > 0 else None
        for m, a in zip(out["matchup_fgm"], out["matchup_fga"], strict=True)
    ]
    out["ci_low"] = [None if c is None else c.lower for c in cis]
    out["ci_high"] = [None if c is None else c.upper for c in cis]
    out["pts_per_poss"] = series_safe_div(out["player_pts"], out["partial_poss"])
    out["team_pts_per_poss"] = series_safe_div(out["team_pts"], out["partial_poss"])
    out["qualifies"] = out["partial_poss"].fillna(0) >= min_poss
    return out


_BASE = """
SELECT m.*, po.full_name AS off_player_name, po.position AS off_position,
       pd.full_name AS def_player_name, pd.position AS def_position
FROM matchups m
LEFT JOIN players po ON po.player_id = m.off_player_id
LEFT JOIN players pd ON pd.player_id = m.def_player_id
WHERE m.season = ? AND m.season_type = ?
"""


def offense(
    db: Database,
    player_id: int,
    season: str,
    season_type: str,
    min_poss: float,
    prior_strength: float,
) -> tuple[pd.DataFrame, dict]:
    df = db.query(
        _BASE + " AND m.off_player_id = ? ORDER BY m.partial_poss DESC",
        [season, season_type, player_id],
    )
    prior = league_prior(db, season, season_type)
    return _enrich(df, prior, prior_strength, min_poss), {"mean": prior, "strength": prior_strength}


def defense(
    db: Database,
    player_id: int,
    season: str,
    season_type: str,
    min_poss: float,
    prior_strength: float,
) -> tuple[pd.DataFrame, dict]:
    df = db.query(
        _BASE + " AND m.def_player_id = ? ORDER BY m.partial_poss DESC",
        [season, season_type, player_id],
    )
    prior = league_prior(db, season, season_type)
    return _enrich(df, prior, prior_strength, min_poss), {"mean": prior, "strength": prior_strength}


def pair(db: Database, off_player_id: int, def_player_id: int, prior_strength: float) -> dict:
    sql = """
    SELECT m.*, po.full_name AS off_player_name, pd.full_name AS def_player_name
    FROM matchups m LEFT JOIN players po ON po.player_id = m.off_player_id LEFT JOIN players pd ON pd.player_id = m.def_player_id
    WHERE m.off_player_id = ? AND m.def_player_id = ? ORDER BY m.season
    """
    df = db.query(sql, [off_player_id, def_player_id])
    if df.empty:
        return {"seasons": [], "total": None}
    sums = {
        c: float(df[c].sum())
        for c in [
            "gp",
            "matchup_min",
            "partial_poss",
            "player_pts",
            "team_pts",
            "matchup_ast",
            "matchup_tov",
            "matchup_blk",
            "matchup_fgm",
            "matchup_fga",
            "matchup_fg3m",
            "matchup_fg3a",
            "matchup_ftm",
            "matchup_fta",
            "sfl",
        ]
        if c in df
    }
    total = pd.DataFrame([sums])
    prior = league_prior(db, str(df.iloc[-1]["season"]), str(df.iloc[-1]["season_type"]))
    seasons = _enrich(df, prior, prior_strength, 0)
    total = _enrich(total, prior, prior_strength, 0).iloc[0].to_dict()
    return {
        "seasons": seasons,
        "total": total,
        "prior": {"mean": prior, "strength": prior_strength},
    }


def heatmap(
    db: Database,
    team_id: int,
    opponent_team_id: int,
    season: str,
    season_type: str,
    min_poss: float,
) -> dict:
    offense_players = db.query(
        "SELECT DISTINCT ps.player_id, p.full_name, p.position FROM player_season ps JOIN players p USING (player_id) WHERE ps.season = ? AND ps.season_type = ? AND ps.team_id = ? AND NOT ps.is_aggregate ORDER BY p.full_name",
        [season, season_type, team_id],
    )
    defense_players = db.query(
        "SELECT DISTINCT ps.player_id, p.full_name, p.position FROM player_season ps JOIN players p USING (player_id) WHERE ps.season = ? AND ps.season_type = ? AND ps.team_id = ? AND NOT ps.is_aggregate ORDER BY p.full_name",
        [season, season_type, opponent_team_id],
    )
    if offense_players.empty or defense_players.empty:
        return {"offense": [], "defense": [], "cells": []}
    cells = db.query(
        "SELECT * FROM matchups WHERE season = ? AND season_type = ? AND off_player_id IN (SELECT UNNEST(?)) AND def_player_id IN (SELECT UNNEST(?))",
        [
            season,
            season_type,
            offense_players["player_id"].tolist(),
            defense_players["player_id"].tolist(),
        ],
    )
    if not cells.empty:
        cells["pts_per_poss"] = series_safe_div(cells["player_pts"], cells["partial_poss"])
        cells["fg_pct"] = series_safe_div(cells["matchup_fgm"], cells["matchup_fga"])
        cells["low_sample"] = cells["partial_poss"].fillna(0) < min_poss
        used_off = set(cells["off_player_id"])
        used_def = set(cells["def_player_id"])
        offense_players = offense_players[offense_players.player_id.isin(used_off)]
        defense_players = defense_players[defense_players.player_id.isin(used_def)]
    return {"offense": offense_players, "defense": defense_players, "cells": cells}


def defense_dashboard(db: Database, player_id: int, season: str, season_type: str) -> pd.DataFrame:
    df = db.query(
        "SELECT * FROM defense_dash WHERE player_id = ? AND season = ? AND season_type = ? ORDER BY defense_category",
        [player_id, season, season_type],
    )
    if df.empty:
        return df
    df["d_fg_pct"] = series_safe_div(df["d_fgm"], df["d_fga"])
    df["pct_plusminus"] = df["d_fg_pct"] - df["normal_fg_pct"]
    return df
