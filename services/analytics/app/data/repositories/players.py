"""Player search, profile, career and percentiles."""

from __future__ import annotations

import pandas as pd

from app.analytics.aggregation import SUM_COLS, sum_then_ratio
from app.analytics.metrics import RATE_DEFINITIONS, TS_FTA_WEIGHT, efg_pct, ts_pct
from app.analytics.percentiles import percentile_rank
from app.data.db import Database
from app.data.repositories.common import add_derived_rates
from app.data.repositories.league import PopulationFilters, league_population

PROFILE_METRICS = [
    "pts",
    "reb",
    "ast",
    "stl",
    "blk",
    "tov",
    "min",
    "fg3m",
    "fga",
    "fta",
    "ts_pct",
    "efg_pct",
    "fg3_pct",
    "ft_pct",
    "usg_pct",
    "ast_pct",
    "reb_pct",
    "tm_tov_pct",
    "off_rating",
    "def_rating",
    "net_rating",
    "pie",
    "on_off_net",
]


def search(db: Database, q: str, limit: int = 20, season: str | None = None) -> pd.DataFrame:
    sql = """
    SELECT p.player_id, p.full_name, p.position, p.is_active, p.from_year, p.to_year,
           (SELECT team_abbreviation FROM player_season s
             WHERE s.player_id = p.player_id AND NOT s.is_aggregate
             ORDER BY s.season DESC, s.gp DESC LIMIT 1) AS team_abbreviation
    FROM players p
    WHERE p.full_name ILIKE ?
    ORDER BY p.is_active DESC, p.to_year DESC, p.full_name
    LIMIT ?
    """
    return db.query(sql, [f"%{q}%", limit])


def bio(db: Database, player_id: int) -> dict | None:
    df = db.query("SELECT * FROM players WHERE player_id = ?", [player_id])
    if df.empty:
        return None
    return df.iloc[0].to_dict()


def combine(db: Database, player_id: int) -> dict | None:
    df = db.query(
        "SELECT * FROM combine_anthro WHERE player_id = ? ORDER BY combine_season DESC LIMIT 1",
        [player_id],
    )
    return None if df.empty else df.iloc[0].to_dict()


def seasons(db: Database, player_id: int) -> pd.DataFrame:
    sql = """
    SELECT ps.*, t.full_name AS team_name
    FROM player_season ps LEFT JOIN teams t USING (team_id)
    WHERE ps.player_id = ?
    ORDER BY ps.season, ps.season_type, ps.is_aggregate DESC, ps.team_id
    """
    df = db.query(sql, [player_id])
    if df.empty:
        return df
    df = add_derived_rates(df)
    df["mpg"] = df["min"] / df["gp"].where(df["gp"] > 0)
    return df


def career_totals(season_rows: pd.DataFrame, season_type: str = "Regular Season") -> dict:
    """Pool one row per season (aggregate or single stint); percentages from pooled totals."""
    rows = season_rows[season_rows.season_type == season_type]
    if rows.empty:
        return {}
    has_agg = rows.groupby("season")["is_aggregate"].transform("any")
    rows = rows[(rows.is_aggregate) | (~has_agg)]
    sum_cols = [c for c in SUM_COLS if c in rows.columns]
    out = sum_then_ratio(rows, sum_cols, {k: v for k, v in RATE_DEFINITIONS.items()})
    out["efg_pct"] = efg_pct(out.get("fgm"), out.get("fg3m"), out.get("fga"))
    out["ts_pct"] = ts_pct(out.get("pts"), out.get("fga"), out.get("fta"), TS_FTA_WEIGHT)
    out["seasons"] = int(rows["season"].nunique())
    out["teams"] = sorted(set(season_rows[~season_rows.is_aggregate]["team_abbreviation"].dropna()))
    return out


def percentiles(
    db: Database,
    player_id: int,
    season: str,
    season_type: str,
    population: str = "all",
    custom_ids: tuple[int, ...] | None = None,
    min_minutes: float = 0.0,
    min_gp: int = 0,
    normalization: str = "per_game",
) -> dict | None:
    base = league_population(
        db,
        season,
        season_type,
        normalization,
        PopulationFilters(min_minutes=min_minutes, min_gp=min_gp),
    )
    if base.empty:
        return None
    me = base[base.player_id == player_id]
    if me.empty:
        # the player may be filtered out by thresholds; fetch unfiltered to still show values
        me = league_population(
            db, season, season_type, normalization, PopulationFilters(player_ids=(player_id,))
        )
        if me.empty:
            return None
    me_row = me.iloc[0]
    if population == "position":
        pos = str(me_row["position"]).split("-")[0]
        pop = base[base["position"].astype(str).str.split("-").apply(lambda p: pos in p)]
        label = f"players listed at {pos}"
    elif population == "team":
        team_ids = db.query(
            "SELECT DISTINCT team_id FROM player_season WHERE player_id = ? AND season = ? AND season_type = ? AND NOT is_aggregate",
            [player_id, season, season_type],
        )["team_id"].tolist()
        pop = base[
            base["player_id"].isin(
                db.query(
                    "SELECT DISTINCT player_id FROM player_season WHERE season = ? AND season_type = ? AND team_id IN (SELECT UNNEST(?))",
                    [season, season_type, team_ids],
                )["player_id"]
            )
        ]
        label = "teammates"
    elif population == "custom" and custom_ids:
        pop = base[base["player_id"].isin(list(custom_ids) + [player_id])]
        label = "selected players"
    else:
        pop = base
        label = "all qualified players"
    metrics = []
    for m in PROFILE_METRICS:
        if m not in pop.columns:
            continue
        value = me_row[m]
        value = None if pd.isna(value) else float(value)
        metrics.append(
            {
                "metric": m,
                "value": value,
                "percentile": percentile_rank(
                    pop[m], value, higher_is_better=m not in ("tov", "tm_tov_pct", "def_rating")
                ),
                "population_size": int(pop[m].notna().sum()),
                "normalization": normalization
                if m in ("pts", "reb", "ast", "stl", "blk", "tov", "min", "fg3m", "fga", "fta")
                else None,
            }
        )
    return {
        "population": {
            "kind": population,
            "label": label,
            "size": int(len(pop)),
            "min_minutes": min_minutes,
            "min_gp": min_gp,
        },
        "metrics": metrics,
    }
