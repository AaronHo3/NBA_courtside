"""Season-level defensive inputs for traits: defense dashboard differences and matchup points allowed."""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from app.data.db import Database

DEFAULT_PRIOR_STRENGTH = 300.0  # possessions; stated with the trait


@dataclass(frozen=True)
class MatchupPrior:
    mean: float | None
    strength: float


def defense_dash_pooled(db: Database, season: str, season_type: str, category: str) -> pd.DataFrame:
    """One row per defender: pooled d_fgm, d_fga and attempt-weighted normal FG% for one category."""
    return db.query(
        """SELECT player_id,
                  SUM(d_fgm) AS d_fgm,
                  SUM(d_fga) AS d_fga,
                  SUM(normal_fg_pct * d_fga) / NULLIF(SUM(d_fga), 0) AS normal_fg_pct
           FROM defense_dash
           WHERE season = ? AND season_type = ? AND defense_category = ?
           GROUP BY player_id""",
        [season, season_type, category],
    )


def matchup_points_allowed(
    db: Database, season: str, season_type: str
) -> tuple[pd.DataFrame, MatchupPrior]:
    """Per defender: Σ player_pts, Σ partial_poss across all matchups, plus the league rate as prior."""
    per = db.query(
        """SELECT def_player_id AS player_id, SUM(player_pts) AS player_pts, SUM(partial_poss) AS partial_poss
           FROM matchups WHERE season = ? AND season_type = ? GROUP BY def_player_id""",
        [season, season_type],
    )
    league = db.query(
        "SELECT SUM(player_pts) AS p, SUM(partial_poss) AS q FROM matchups WHERE season = ? AND season_type = ?",
        [season, season_type],
    ).iloc[0]
    mean = float(league["p"] / league["q"]) if league["q"] and league["q"] > 0 else None
    return per, MatchupPrior(mean, DEFAULT_PRIOR_STRENGTH)
