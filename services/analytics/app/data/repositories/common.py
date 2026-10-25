"""Query helpers shared by repositories."""

from __future__ import annotations

import pandas as pd

from app.analytics.catalog import COUNTING_KEYS
from app.analytics.metrics import add_rate_columns, series_safe_div
from app.data.db import Database

# One row per player for a season: the provider/derived aggregate where a player had several
# stints, otherwise the single stint row.
PLAYER_SEASON_ONE_ROW = """
WITH ps AS (
    SELECT * FROM player_season WHERE season = ? AND season_type = ?
),
agg AS (SELECT player_id FROM ps WHERE is_aggregate)
SELECT ps.*
FROM ps
WHERE ps.is_aggregate OR ps.player_id NOT IN (SELECT player_id FROM agg)
"""

PLAYER_CONTEXT = """
SELECT p.player_id, p.full_name, p.position, p.height_in, p.weight_lb, p.birthdate, p.is_active,
       p.height_source, p.draft_year, p.from_year, p.to_year,
       c.wingspan_in, c.standing_reach_in, c.height_wo_shoes_in, c.height_w_shoes_in,
       c.wingspan_in / NULLIF(c.height_wo_shoes_in, 0) AS wingspan_height_ratio,
       c.combine_season
FROM players p
LEFT JOIN (
    -- a player measured at more than one combine keeps the most recent measurement
    SELECT * FROM combine_anthro
    QUALIFY ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY combine_season DESC) = 1
) c USING (player_id)
"""


def player_context(db: Database) -> pd.DataFrame:
    return db.query(PLAYER_CONTEXT)


def one_row_player_season(db: Database, season: str, season_type: str) -> pd.DataFrame:
    return db.query(PLAYER_SEASON_ONE_ROW, [season, season_type])


def add_derived_rates(df: pd.DataFrame) -> pd.DataFrame:
    out = add_rate_columns(df)
    if {"fg3a", "fga"}.issubset(out.columns):
        out["fg3a_rate"] = series_safe_div(out["fg3a"], out["fga"])
    if {"fta", "fga"}.issubset(out.columns):
        out["fta_rate"] = series_safe_div(out["fta"], out["fga"])
    return out


def normalize_counting(df: pd.DataFrame, normalization: str) -> pd.DataFrame:
    """Rescale counting stats. ``min`` and ``poss`` stay as totals except under per_game.

    per_100 requires a possessions column; rows without it get null, never zero.
    """
    out = df.copy()
    keys = [k for k in COUNTING_KEYS if k in out.columns and k not in ("min", "poss")]
    if normalization == "totals":
        return out
    if normalization == "per_game":
        den = out["gp"]
        for k in [*keys, "min", "poss"]:
            if k in out.columns:
                out[k] = series_safe_div(out[k], den)
        return out
    if normalization == "per_36":
        for k in keys:
            out[k] = series_safe_div(out[k], out["min"]) * 36.0
        return out
    if normalization == "per_100":
        poss = out["poss"] if "poss" in out.columns else pd.Series(float("nan"), index=out.index)
        for k in keys:
            out[k] = series_safe_div(out[k], poss) * 100.0
        return out
    raise ValueError(f"unknown normalization {normalization!r}")


def on_off_net_by_stint(db: Database, season: str, season_type: str) -> pd.DataFrame:
    sql = """
    SELECT o.player_id, o.team_id,
           o.net_rating AS on_net_rating, f.net_rating AS off_net_rating,
           o.net_rating - f.net_rating AS on_off_net
    FROM on_off o JOIN on_off f
      ON o.player_id = f.player_id AND o.team_id = f.team_id AND o.season = f.season AND o.season_type = f.season_type
    WHERE o.court_status = 'On' AND f.court_status = 'Off' AND o.season = ? AND o.season_type = ?
    """
    return db.query(sql, [season, season_type])
