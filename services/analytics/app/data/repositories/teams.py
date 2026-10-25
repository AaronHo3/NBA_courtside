"""Team seasons, roster contributions, lineups, on/off and roster-composition metrics."""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.analytics.metrics import series_safe_div
from app.data.db import Database
from app.data.repositories.common import add_derived_rates, on_off_net_by_stint, player_context


def list_teams(db: Database) -> pd.DataFrame:
    return db.query("SELECT * FROM teams ORDER BY full_name")


def team(db: Database, team_id: int) -> dict | None:
    df = db.query("SELECT * FROM teams WHERE team_id = ?", [team_id])
    return None if df.empty else df.iloc[0].to_dict()


def seasons(db: Database, team_id: int) -> pd.DataFrame:
    df = db.query(
        "SELECT * FROM team_season WHERE team_id = ? ORDER BY season, season_type", [team_id]
    )
    return add_derived_rates(df) if not df.empty else df


def league(db: Database, season: str, season_type: str) -> pd.DataFrame:
    df = db.query(
        "SELECT ts.*, t.abbreviation, t.full_name, t.conference, t.division FROM team_season ts LEFT JOIN teams t USING (team_id) WHERE season = ? AND season_type = ? ORDER BY net_rating DESC",
        [season, season_type],
    )
    return add_derived_rates(df) if not df.empty else df


def roster(db: Database, team_id: int, season: str, season_type: str) -> pd.DataFrame:
    ps = db.query(
        "SELECT * FROM player_season WHERE team_id = ? AND season = ? AND season_type = ? AND NOT is_aggregate",
        [team_id, season, season_type],
    )
    if ps.empty:
        return ps
    ctx = player_context(db)
    out = ps.merge(
        ctx[["player_id", "full_name", "position", "height_in", "weight_lb", "wingspan_in"]],
        on="player_id",
        how="left",
    )
    out = add_derived_rates(out)
    for col in ["min", "pts", "fga", "ast", "reb", "poss"]:
        total = out[col].sum()
        out[f"share_{col}"] = out[col] / total if total else np.nan
    out["mpg"] = series_safe_div(out["min"], out["gp"])
    stints = db.query(
        "SELECT player_id, COUNT(*) AS stints FROM player_season WHERE season = ? AND season_type = ? AND NOT is_aggregate GROUP BY 1",
        [season, season_type],
    )
    out = out.merge(stints, on="player_id", how="left")
    out["traded"] = out["stints"].fillna(1) > 1
    oo = on_off_net_by_stint(db, season, season_type)
    out = out.merge(oo, on=["player_id", "team_id"], how="left")
    return out.sort_values("min", ascending=False).reset_index(drop=True)


def lineups(
    db: Database, team_id: int, season: str, season_type: str, min_poss: float, limit: int = 50
) -> pd.DataFrame:
    df = db.query(
        "SELECT * FROM lineups WHERE team_id = ? AND season = ? AND season_type = ? AND COALESCE(poss, 0) >= ? ORDER BY min DESC LIMIT ?",
        [team_id, season, season_type, min_poss, limit],
    )
    return add_derived_rates(df) if not df.empty else df


def on_off(db: Database, team_id: int, season: str, season_type: str) -> pd.DataFrame:
    sql = """
    SELECT o.player_id, p.full_name, o.gp, o.min AS on_min, f.min AS off_min,
           o.off_rating AS on_off_rating, o.def_rating AS on_def_rating, o.net_rating AS on_net_rating,
           f.off_rating AS off_off_rating, f.def_rating AS off_def_rating, f.net_rating AS off_net_rating,
           o.net_rating - f.net_rating AS on_off_net, o.plus_minus AS on_plus_minus, f.plus_minus AS off_plus_minus
    FROM on_off o JOIN on_off f ON o.player_id = f.player_id AND o.team_id = f.team_id AND o.season = f.season AND o.season_type = f.season_type
    LEFT JOIN players p ON p.player_id = o.player_id
    WHERE o.court_status = 'On' AND f.court_status = 'Off' AND o.team_id = ? AND o.season = ? AND o.season_type = ?
    ORDER BY o.min DESC
    """
    return db.query(sql, [team_id, season, season_type])


def stints(db: Database, team_id: int, season: str, season_type: str) -> pd.DataFrame:
    sql = """
    SELECT ps.player_id, p.full_name, ps.team_id, ps.gp, ps.min,
           (SELECT MIN(game_date) FROM player_game_logs g WHERE g.player_id = ps.player_id AND g.team_id = ps.team_id AND g.season = ps.season AND g.season_type = ps.season_type) AS first_game,
           (SELECT MAX(game_date) FROM player_game_logs g WHERE g.player_id = ps.player_id AND g.team_id = ps.team_id AND g.season = ps.season AND g.season_type = ps.season_type) AS last_game,
           (SELECT COUNT(*) FROM player_season o WHERE o.player_id = ps.player_id AND o.season = ps.season AND o.season_type = ps.season_type AND NOT o.is_aggregate) AS season_stints
    FROM player_season ps LEFT JOIN players p USING (player_id)
    WHERE ps.team_id = ? AND ps.season = ? AND ps.season_type = ? AND NOT ps.is_aggregate
    ORDER BY ps.min DESC
    """
    return db.query(sql, [team_id, season, season_type])


def _gini(values: np.ndarray) -> float | None:
    v = np.sort(values[~np.isnan(values)])
    if v.size == 0 or v.sum() == 0:
        return None
    n = v.size
    return float((2 * np.sum(np.arange(1, n + 1) * v) / (n * v.sum())) - (n + 1) / n)


def roster_metrics(db: Database, season: str, season_type: str) -> pd.DataFrame:
    """Roster-composition descriptors per team to relate to team outcomes (associations only)."""
    ts = league(db, season, season_type)
    if ts.empty:
        return ts
    ps = db.query(
        "SELECT ps.*, p.height_in, p.wingspan_in_ctx AS wingspan_in FROM player_season ps LEFT JOIN (SELECT p.player_id, p.height_in, c.wingspan_in AS wingspan_in_ctx FROM players p LEFT JOIN combine_anthro c USING (player_id)) p USING (player_id) WHERE season = ? AND season_type = ? AND NOT is_aggregate",
        [season, season_type],
    )
    prev = None
    try:
        y = int(season[:4]) - 1
        prev_label = f"{y}-{str(y + 1)[-2:]}"
        prev = db.query(
            "SELECT player_id, team_id, min FROM player_season WHERE season = ? AND season_type = ? AND NOT is_aggregate",
            [prev_label, season_type],
        )
    except ValueError:
        prev = None
    rows = []
    for team_id, g in ps.groupby("team_id"):
        w = g["min"].fillna(0).to_numpy()
        wsum = w.sum() or 1.0
        top3 = np.sort(w)[::-1][:3].sum() / wsum
        pts_share = (g["pts"].fillna(0) / max(g["pts"].sum(), 1)).to_numpy()
        continuity = None
        if prev is not None and not prev.empty:
            prev_ids = set(prev[prev.team_id == team_id]["player_id"])
            continuity = float(w[g["player_id"].isin(prev_ids).to_numpy()].sum() / wsum)
        rows.append(
            {
                "team_id": team_id,
                "usage_gini": _gini(pts_share),
                "usg_pct_top": float(g["usg_pct"].max()) if g["usg_pct"].notna().any() else None,
                "avg_height_in": float(
                    np.average(g["height_in"].fillna(g["height_in"].mean()), weights=w)
                )
                if g["height_in"].notna().any()
                else None,
                "avg_wingspan_in": float(
                    np.average(
                        g["wingspan_in"].dropna(), weights=w[g["wingspan_in"].notna().to_numpy()]
                    )
                )
                if g["wingspan_in"].notna().sum() >= 3
                else None,
                "avg_age": float(np.average(g["age"].fillna(g["age"].mean()), weights=w))
                if g["age"].notna().any()
                else None,
                "top3_min_share": float(top3),
                "players_used": int(len(g)),
                "continuity_min_share": continuity,
            }
        )
    rm = pd.DataFrame(rows)
    out = ts.merge(rm, on="team_id", how="left")
    out["fg3a_rate"] = series_safe_div(out["fg3a"], out["fga"])
    return out
