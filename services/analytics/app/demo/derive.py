"""Derive the normalised families from simulated game logs and shots.

Where the real provider publishes a metric we cannot reconstruct without play-by-play (on-court
ratings, lineup stats, on/off) the demo synthesises a plausible value and the methodology document
labels it as such. Formulas that *are* public (usage, assist %, rebound %, PIE, eFG%, TS%) are
computed from the simulated totals.
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd

from app.analytics.aggregation import with_aggregate_rows
from app.analytics.metrics import add_rate_columns, series_safe_div
from app.demo.archetypes import ARCHETYPES, DEFENSE_CATEGORIES
from app.demo.config import REGULAR_SEASON, DemoConfig, season_start_year
from app.demo.league import League
from app.demo.simulate import BOX_COLS, SeasonSim, season_ability

POSS_NOTE = "possessions estimated as FGA - OREB + TOV + 0.44*FTA (demo approximation)"
SUM_BOX = [c for c in BOX_COLS]


def possessions(df: pd.DataFrame) -> pd.Series:
    return df["fga"] - df["oreb"] + df["tov"] + 0.44 * df["fta"]


def pie_numerator(df: pd.DataFrame) -> pd.Series:
    return (
        df["pts"]
        + df["fgm"]
        + df["ftm"]
        - df["fga"]
        - df["fta"]
        + df["dreb"]
        + 0.5 * df["oreb"]
        + df["ast"]
        + df["stl"]
        + 0.5 * df["blk"]
        - df["pf"]
        - df["tov"]
    )


def _team_context(team_logs: pd.DataFrame) -> pd.DataFrame:
    """Team logs joined with the opponent's line for the same game."""
    tl = team_logs.copy()
    tl["poss"] = possessions(tl)
    tl["pie_num"] = pie_numerator(tl)
    opp = tl[
        [
            "game_id",
            "team_id",
            "pts",
            "poss",
            "oreb",
            "dreb",
            "reb",
            "fga",
            "fta",
            "tov",
            "fgm",
            "fg3m",
            "fg3a",
            "pie_num",
        ]
    ].rename(
        columns={
            "team_id": "opponent_team_id",
            **{
                c: f"opp_{c}"
                for c in [
                    "pts",
                    "poss",
                    "oreb",
                    "dreb",
                    "reb",
                    "fga",
                    "fta",
                    "tov",
                    "fgm",
                    "fg3m",
                    "fg3a",
                    "pie_num",
                ]
            },
        }
    )
    return tl.merge(opp, on=["game_id", "opponent_team_id"], how="left")


def _advanced_from_sums(df: pd.DataFrame) -> pd.DataFrame:
    """Public formulas applied to pooled player + team + opponent totals (columns tm_*, opp_*)."""
    out = df.copy()
    tm_min5 = out["tm_min"] / 5.0
    out["usg_pct"] = series_safe_div(
        (out["fga"] + 0.44 * out["fta"] + out["tov"]) * tm_min5,
        out["min"] * (out["tm_fga"] + 0.44 * out["tm_fta"] + out["tm_tov"]),
    )
    ast_den = series_safe_div(out["min"], tm_min5) * out["tm_fgm"] - out["fgm"]
    out["ast_pct"] = series_safe_div(out["ast"], ast_den.where(ast_den > 0))
    out["oreb_pct"] = series_safe_div(
        out["oreb"] * tm_min5, out["min"] * (out["tm_oreb"] + out["opp_dreb"])
    )
    out["dreb_pct"] = series_safe_div(
        out["dreb"] * tm_min5, out["min"] * (out["tm_dreb"] + out["opp_oreb"])
    )
    out["reb_pct"] = series_safe_div(
        out["reb"] * tm_min5, out["min"] * (out["tm_reb"] + out["opp_reb"])
    )
    out["tm_tov_pct"] = series_safe_div(out["tov"], out["fga"] + 0.44 * out["fta"] + out["tov"])
    out["ast_ratio"] = 100 * series_safe_div(
        out["ast"], out["fga"] + 0.44 * out["fta"] + out["ast"] + out["tov"]
    )
    out["pie"] = series_safe_div(out["pie_num"], out["game_pie_total"])
    out["pace"] = 48 * series_safe_div((out["tm_poss"] + out["opp_poss"]) / 2.0, tm_min5)
    return add_rate_columns(out)


def player_season_from_logs(
    rng: np.random.Generator, season: str, sim: SeasonSim, league: League
) -> pd.DataFrame:
    ctx = _team_context(sim.team_logs)
    ctx["game_pie_total"] = ctx["pie_num"] + ctx["opp_pie_num"]
    keep = [
        "game_id",
        "team_id",
        "min",
        "fga",
        "fta",
        "tov",
        "fgm",
        "oreb",
        "dreb",
        "reb",
        "pts",
        "poss",
        "opp_oreb",
        "opp_dreb",
        "opp_reb",
        "opp_pts",
        "opp_poss",
        "game_pie_total",
    ]
    merged = sim.player_logs.merge(
        ctx[keep].rename(
            columns={
                c: f"tm_{c}"
                for c in keep
                if c not in ("game_id", "team_id")
                and not c.startswith("opp_")
                and c != "game_pie_total"
            }
        ),
        on=["game_id", "team_id"],
        how="left",
    )
    merged["pie_num"] = pie_numerator(merged)
    merged["row_poss"] = merged["tm_poss"] * merged["min"] / 240.0
    merged["w"] = (merged["wl"] == "W").astype(int)
    merged["l"] = 1 - merged["w"]
    merged["dd2"] = ((merged[["pts", "reb", "ast", "stl", "blk"]] >= 10).sum(axis=1) >= 2).astype(
        int
    )
    merged["td3"] = ((merged[["pts", "reb", "ast", "stl", "blk"]] >= 10).sum(axis=1) >= 3).astype(
        int
    )
    sums = [
        *SUM_BOX,
        "w",
        "l",
        "dd2",
        "td3",
        "pie_num",
        "row_poss",
        "tm_min",
        "tm_fga",
        "tm_fta",
        "tm_tov",
        "tm_fgm",
        "tm_oreb",
        "tm_dreb",
        "tm_reb",
        "tm_pts",
        "tm_poss",
        "opp_oreb",
        "opp_dreb",
        "opp_reb",
        "opp_pts",
        "opp_poss",
        "game_pie_total",
    ]
    g = merged.groupby(["player_id", "team_id"], sort=False)
    ps = g[sums].sum().reset_index()
    ps["gp"] = g.size().to_numpy()
    ps["team_abbreviation"] = ps["team_id"].map(league.teams.set_index("team_id")["abbreviation"])
    roster = league.roster_for(season).drop_duplicates("player_id").set_index("player_id")
    ps["age"] = ps["player_id"].map(roster["age"]).round(1)
    ps = _advanced_from_sums(ps)
    ps["poss"] = ps["row_poss"]
    attrs = league.attrs.loc[ps["player_id"]]
    team_off = 100 * series_safe_div(ps["tm_pts"], ps["tm_poss"])
    team_def = 100 * series_safe_div(ps["opp_pts"], ps["opp_poss"])
    ps["off_rating"] = (
        team_off + 0.6 * attrs["impact_off"].to_numpy() + rng.normal(0, 1.5, len(ps))
    ).round(1)
    ps["def_rating"] = (
        team_def - 0.6 * attrs["impact_def"].to_numpy() + rng.normal(0, 1.5, len(ps))
    ).round(1)
    ps["net_rating"] = (ps["off_rating"] - ps["def_rating"]).round(1)
    ps["season"] = season
    ps["season_type"] = REGULAR_SEASON
    ps["is_aggregate"] = False
    ps = ps.drop(
        columns=[
            c
            for c in ps.columns
            if c.startswith("tm_")
            or c.startswith("opp_")
            or c in ("pie_num", "row_poss", "game_pie_total")
        ]
    )
    return with_aggregate_rows(ps)


def player_season_synthetic(
    rng: np.random.Generator, season: str, league: League, cfg: DemoConfig
) -> pd.DataFrame:
    """Season totals for seasons without simulated games (expected rates x minutes, Poisson noise)."""
    roster = league.roster_for(season)
    attrs = league.attrs.loc[roster["player_id"]]
    ability = season_ability(attrs["talent"].to_numpy(), roster["age"].to_numpy())
    games = (roster["game_to"] - roster["game_from"]).to_numpy()
    gp = np.maximum(rng.binomial(games, cfg.availability), np.where(games > 0, 1, 0))
    # minutes tier by ability rank within team
    rank = (
        roster.assign(ab=ability)
        .groupby("team_id")["ab"]
        .rank(ascending=False, method="first")
        .to_numpy()
    )
    mpg = np.where(
        rank <= 5,
        rng.normal(33, 3, len(rank)),
        np.where(
            rank <= 9,
            rng.normal(20, 4, len(rank)),
            np.where(rank <= 11, rng.normal(9, 3, len(rank)), rng.normal(3, 1.5, len(rank))),
        ),
    )
    mpg = np.clip(mpg, 1, 40)
    minutes = np.round(mpg * gp, 1)
    m36 = minutes / 36.0
    mult = 1.0 + 0.15 * ability
    arch = [ARCHETYPES[i] for i in attrs["archetype"].to_numpy()]

    def rate(attr: str, scale=1.0):
        return rng.poisson(
            np.maximum(np.array([getattr(a, attr) for a in arch]) * m36 * scale, 0)
        ).astype(float)

    fga = rate("fga36", mult)
    mix = np.array([a.zone_mix for a in arch])
    zone_counts = np.array(
        [rng.multinomial(int(f), p / p.sum()) for f, p in zip(fga, mix, strict=True)]
    )
    zone_pct = np.column_stack(
        [attrs[f"zone_pct_{z}"].to_numpy() for z in ("RA", "PAINT", "MID", "CORNER3", "ATB3")]
    )
    makes = rng.binomial(zone_counts, np.clip(zone_pct + 0.02 * ability[:, None], 0.03, 0.97))
    fgm = makes.sum(axis=1).astype(float)
    fg3a = zone_counts[:, 3:].sum(axis=1).astype(float)
    fg3m = makes[:, 3:].sum(axis=1).astype(float)
    fta = rng.poisson(np.array([a.fta_per_fga for a in arch]) * np.maximum(fga, 0)).astype(float)
    ftm = rng.binomial(fta.astype(int), attrs["ft_pct"].to_numpy()).astype(float)
    oreb, dreb, ast, tov, stl, blk, pf = (
        rate("oreb36"),
        rate("dreb36"),
        rate("ast36", 1 + 0.1 * ability),
        rate("tov36"),
        rate("stl36"),
        rate("blk36"),
        rate("pf36"),
    )
    pts = 2 * (fgm - fg3m) + 3 * fg3m + ftm
    ps = pd.DataFrame(
        {
            "player_id": roster["player_id"].to_numpy(),
            "team_id": roster["team_id"].to_numpy(),
            "season": season,
            "season_type": REGULAR_SEASON,
            "is_aggregate": False,
            "age": roster["age"].round(1).to_numpy(),
            "gp": gp.astype(float),
            "min": minutes,
            "fgm": fgm,
            "fga": fga,
            "fg3m": fg3m,
            "fg3a": fg3a,
            "ftm": ftm,
            "fta": fta,
            "oreb": oreb,
            "dreb": dreb,
            "reb": oreb + dreb,
            "ast": ast,
            "tov": tov,
            "stl": stl,
            "blk": blk,
            "blka": 0.0,
            "pf": pf,
            "pfd": 0.0,
            "pts": pts,
            "plus_minus": np.round(
                (attrs["impact_off"].to_numpy() + attrs["impact_def"].to_numpy())
                * minutes
                / 48.0
                * 0.3
                + rng.normal(0, 1.0, len(roster)) * np.sqrt(np.maximum(gp, 1)) * 3
            ),
        }
    )
    ps["team_abbreviation"] = ps["team_id"].map(league.teams.set_index("team_id")["abbreviation"])
    # team context from the pooled stints (team totals), league-average opponent context
    team = ps.groupby("team_id")[
        ["min", "fga", "fta", "tov", "fgm", "oreb", "dreb", "reb", "pts"]
    ].sum()
    team["poss"] = possessions(team.assign(fga=team["fga"]))
    team_gp = ps.groupby("team_id")["gp"].max()
    league_avg = team.mean()
    for c in ["min", "fga", "fta", "tov", "fgm", "oreb", "dreb", "reb", "pts", "poss"]:
        ps[f"tm_{c}"] = ps["team_id"].map(team[c]) * (ps["gp"] / ps["team_id"].map(team_gp))
    # a team's minutes are 240 per game, not the sum of all stints' minutes
    ps["tm_min"] = 240.0 * ps["gp"]
    for c in ["oreb", "dreb", "reb", "pts", "poss"]:
        ps[f"opp_{c}"] = float(league_avg[c]) * (ps["gp"] / float(team_gp.mean()))
    ps["pie_num"] = pie_numerator(ps)
    ps["w"] = np.round(
        ps["gp"]
        * np.clip(0.5 + 0.004 * ps["team_id"].map(team["pts"] - league_avg["pts"]) / 82, 0.15, 0.85)
    )
    ps["l"] = ps["gp"] - ps["w"]
    ps["dd2"] = np.nan
    ps["td3"] = np.nan
    team_pie = ps.groupby("team_id")["pie_num"].sum()
    ps["game_pie_total"] = (ps["team_id"].map(team_pie) + team_pie.mean()) * (
        ps["gp"] / ps["team_id"].map(team_gp)
    )
    ps = _advanced_from_sums(ps)
    ps["poss"] = ps["tm_poss"] * ps["min"] / ps["tm_min"]
    attrs_rows = league.attrs.loc[ps["player_id"]]
    team_off = 100 * series_safe_div(ps["tm_pts"], ps["tm_poss"])
    team_def = 100 * series_safe_div(ps["opp_pts"], ps["opp_poss"])
    ps["off_rating"] = (
        team_off + 0.6 * attrs_rows["impact_off"].to_numpy() + rng.normal(0, 1.5, len(ps))
    ).round(1)
    ps["def_rating"] = (
        team_def - 0.6 * attrs_rows["impact_def"].to_numpy() + rng.normal(0, 1.5, len(ps))
    ).round(1)
    ps["net_rating"] = (ps["off_rating"] - ps["def_rating"]).round(1)
    ps = ps.drop(
        columns=[
            c
            for c in ps.columns
            if c.startswith("tm_") or c.startswith("opp_") or c in ("pie_num", "game_pie_total")
        ]
    )
    return with_aggregate_rows(ps)


def _four_factors(ts: pd.DataFrame) -> pd.DataFrame:
    out = ts.copy()
    out["fta_rate"] = series_safe_div(out["fta"], out["fga"])
    out["tm_tov_pct"] = series_safe_div(out["tov"], out["fga"] + 0.44 * out["fta"] + out["tov"])
    out["oreb_pct"] = series_safe_div(out["oreb"], out["oreb"] + out["opp_dreb"])
    out["opp_efg_pct"] = series_safe_div(out["opp_fgm"] + 0.5 * out["opp_fg3m"], out["opp_fga"])
    out["opp_fta_rate"] = series_safe_div(out["opp_fta"], out["opp_fga"])
    out["opp_tov_pct"] = series_safe_div(
        out["opp_tov"], out["opp_fga"] + 0.44 * out["opp_fta"] + out["opp_tov"]
    )
    out["opp_oreb_pct"] = series_safe_div(out["opp_oreb"], out["opp_oreb"] + out["dreb"])
    out["ast_pct"] = series_safe_div(out["ast"], out["fgm"])
    out["reb_pct"] = series_safe_div(out["reb"], out["reb"] + out["opp_reb"])
    out["off_rating"] = 100 * series_safe_div(out["pts"], out["poss"])
    out["def_rating"] = 100 * series_safe_div(out["opp_pts"], out["opp_poss"])
    out["net_rating"] = out["off_rating"] - out["def_rating"]
    out["pace"] = series_safe_div(out["poss"] + out["opp_poss"], 2 * out["gp"])
    out["pie"] = series_safe_div(out["pie_num"], out["pie_num"] + out["opp_pie_num"])
    return add_rate_columns(out)


def team_season_from_logs(season: str, team_logs: pd.DataFrame) -> pd.DataFrame:
    ctx = _team_context(team_logs)
    ctx["w"] = (ctx["wl"] == "W").astype(int)
    ctx["l"] = 1 - ctx["w"]
    cols = [
        *SUM_BOX,
        "w",
        "l",
        "poss",
        "pie_num",
        "opp_pts",
        "opp_poss",
        "opp_oreb",
        "opp_dreb",
        "opp_reb",
        "opp_fga",
        "opp_fta",
        "opp_tov",
        "opp_fgm",
        "opp_fg3m",
        "opp_pie_num",
    ]
    g = ctx.groupby("team_id", sort=False)
    ts = g[cols].sum().reset_index()
    ts["gp"] = g.size().to_numpy()
    ts["season"] = season
    ts["season_type"] = REGULAR_SEASON
    return _four_factors(ts)


def team_season_synthetic(
    rng: np.random.Generator, season: str, player_season: pd.DataFrame, cfg: DemoConfig
) -> pd.DataFrame:
    stints = player_season[~player_season["is_aggregate"]]
    g = stints.groupby("team_id", sort=False)
    ts = g[SUM_BOX].sum().reset_index()
    ts["gp"] = float(cfg.games_per_team)
    ts["min"] = 240.0 * ts["gp"]
    ts["poss"] = possessions(ts)
    ts["pie_num"] = pie_numerator(ts)
    strength = (ts["pts"] - ts["pts"].mean()) / max(ts["pts"].std(ddof=0), 1.0)
    # opponents: league-average profile nudged by this team's defensive strength
    for c in ["pts", "poss", "oreb", "dreb", "reb", "fga", "fta", "tov", "fgm", "fg3m", "pie_num"]:
        ts[f"opp_{c}"] = ts[c].mean() * (1 - 0.02 * strength + rng.normal(0, 0.01, len(ts)))
    ts["opp_pts"] = ts["pts"] - (
        ts["plus_minus"]
        if ts["plus_minus"].abs().sum() > 0
        else 40 * strength + rng.normal(0, 60, len(ts))
    )
    wpct = np.clip(0.5 + 0.0025 * (ts["pts"] - ts["opp_pts"]) / ts["gp"] * 10, 0.15, 0.85)
    ts["w"] = np.round(ts["gp"] * wpct)
    ts["l"] = ts["gp"] - ts["w"]
    ts["plus_minus"] = ts["pts"] - ts["opp_pts"]
    ts["season"] = season
    ts["season_type"] = REGULAR_SEASON
    return _four_factors(ts)


def league_zone_avg(season: str, shots: pd.DataFrame) -> pd.DataFrame:
    g = shots.groupby(["shot_zone_basic", "shot_zone_area", "shot_zone_range"], sort=False)
    out = g.agg(fga=("shot_made_flag", "size"), fgm=("shot_made_flag", "sum")).reset_index()
    out["season"] = season
    out["season_type"] = REGULAR_SEASON
    out[["fga", "fgm"]] = out[["fga", "fgm"]].astype(float)
    return out


def matchups_from_shots(rng: np.random.Generator, season: str, sim: SeasonSim) -> pd.DataFrame:
    s = sim.shots
    is3 = (s["shot_type"] == "3PT Field Goal").astype(int)
    work = pd.DataFrame(
        {
            "off_player_id": s["player_id"],
            "def_player_id": s["def_player_id"],
            "game_id": s["game_id"],
            "fga": 1,
            "fgm": s["shot_made_flag"],
            "fg3a": is3,
            "fg3m": is3 * s["shot_made_flag"],
        }
    )
    g = work.groupby(["off_player_id", "def_player_id"], sort=False)
    mu = g[["fga", "fgm", "fg3a", "fg3m"]].sum().reset_index()
    mu["gp"] = g["game_id"].nunique().to_numpy()
    ft = (
        sim.free_throws[sim.free_throws.def_player_id > 0]
        .groupby(["player_id", "def_player_id"])[["fta", "ftm"]]
        .sum()
        .reset_index()
    )
    ft = ft.rename(columns={"player_id": "off_player_id"})
    mu = mu.merge(ft, on=["off_player_id", "def_player_id"], how="left").fillna(
        {"fta": 0, "ftm": 0}
    )
    n = len(mu)
    mu["partial_poss"] = np.maximum(
        np.round(mu["fga"] * 1.75 + mu["fta"] * 0.5 + rng.normal(0, 1.0, n)), mu["fga"]
    )
    mu["matchup_min"] = (mu["partial_poss"] * 0.42).round(2)
    mu["player_pts"] = 2 * (mu["fgm"] - mu["fg3m"]) + 3 * mu["fg3m"] + mu["ftm"]
    mu["team_pts"] = mu["player_pts"] + np.round(mu["partial_poss"] * 0.35)
    mu["matchup_ast"] = rng.poisson(0.08 * mu["partial_poss"])
    mu["matchup_tov"] = rng.poisson(0.06 * mu["partial_poss"])
    mu["matchup_blk"] = rng.poisson(0.02 * mu["fga"])
    mu["sfl"] = np.ceil(mu["fta"] / 2.0)
    mu = mu.rename(
        columns={
            "fga": "matchup_fga",
            "fgm": "matchup_fgm",
            "fg3a": "matchup_fg3a",
            "fg3m": "matchup_fg3m",
            "fta": "matchup_fta",
            "ftm": "matchup_ftm",
        }
    )
    for c in ("help_blk", "help_fgm", "help_fga"):
        mu[c] = np.nan  # not modelled -> null, never zero
    mu["season"] = season
    mu["season_type"] = REGULAR_SEASON
    return mu


def _category_masks(shots: pd.DataFrame) -> dict[str, pd.Series]:
    d = shots["shot_distance"]
    three = shots["shot_type"] == "3PT Field Goal"
    return {
        "Overall": pd.Series(True, index=shots.index),
        "3 Pointers": three,
        "2 Pointers": ~three,
        "Less Than 6Ft": d < 6,
        "Less Than 10Ft": d < 10,
        "Greater Than 15Ft": d > 15,
    }


def defense_dash_from_shots(season: str, sim: SeasonSim) -> pd.DataFrame:
    s = sim.shots
    gp = sim.player_logs.groupby("player_id")["game_id"].nunique()
    last_team = sim.player_logs.sort_values("game_date").groupby("player_id")["team_id"].last()
    frames = []
    for cat, mask in _category_masks(s).items():
        sub = s[mask]
        shooter_pct = sub.groupby("player_id")["shot_made_flag"].mean()
        sub = sub.assign(shooter_pct=sub["player_id"].map(shooter_pct))
        g = sub.groupby("def_player_id", sort=False)
        out = g.agg(
            d_fga=("shot_made_flag", "size"),
            d_fgm=("shot_made_flag", "sum"),
            normal_fg_pct=("shooter_pct", "mean"),
            g=("game_id", "nunique"),
        ).reset_index()
        out["defense_category"] = cat
        frames.append(out)
    dd = pd.concat(frames, ignore_index=True).rename(columns={"def_player_id": "player_id"})
    overall = dd[dd.defense_category == "Overall"].set_index("player_id")["d_fga"]
    dd["freq"] = dd["d_fga"] / dd["player_id"].map(overall)
    dd["gp"] = dd["player_id"].map(gp)
    dd["team_id"] = dd["player_id"].map(last_team)
    dd["season"] = season
    dd["season_type"] = REGULAR_SEASON
    dd[["d_fga", "d_fgm", "g", "gp"]] = dd[["d_fga", "d_fgm", "g", "gp"]].astype(float)
    assert set(dd["defense_category"]) == set(DEFENSE_CATEGORIES)
    return dd


def _initial_last(name_row: pd.Series) -> str:
    return f"{name_row['first_name'][0]}. {name_row['last_name']}"


def lineups_synthetic(
    rng: np.random.Generator, season: str, sim: SeasonSim, team_season: pd.DataFrame, league: League
) -> pd.DataFrame:
    logs = sim.player_logs
    names = league.players.set_index("player_id")
    rows = []
    ts = team_season.set_index("team_id")
    for team_id, tl in logs.groupby("team_id"):
        by_min = tl.groupby("player_id")["min"].sum().sort_values(ascending=False)
        order = list(by_min.index)
        if len(order) < 7:
            continue
        starters = order[:5]
        combos: list[list[int]] = [starters]
        for sub in order[5:7]:
            for i in range(5):
                combos.append(starters[:i] + [sub] + starters[i + 1 :])
        if len(order) >= 10:
            combos.append(order[5:10])
        combos = combos[:12]
        shares = (
            0.6
            * np.array([0.5**k for k in range(len(combos))])
            / sum(0.5**k for k in range(len(combos)))
        )
        shares = shares * np.exp(rng.normal(0, 0.15, len(combos)))
        team_row = ts.loc[team_id]
        team_min = float(team_row["min"])
        pace = float(team_row["pace"])
        for combo, share in zip(combos, shares, strict=True):
            minutes = round(team_min * share, 1)
            poss = round(minutes * pace / 48.0, 1)
            impact = league.attrs.loc[combo, "impact_off"].mean() * 0.4
            dimpact = league.attrs.loc[combo, "impact_def"].mean() * 0.4
            off_rating = round(team_row["off_rating"] + impact + rng.normal(0, 4), 1)
            def_rating = round(team_row["def_rating"] - dimpact + rng.normal(0, 4), 1)
            frac = minutes / team_min
            box = {
                c: float(rng.poisson(max(team_row[c] * frac, 0)))
                for c in [
                    "fgm",
                    "fga",
                    "fg3m",
                    "fg3a",
                    "ftm",
                    "fta",
                    "oreb",
                    "dreb",
                    "ast",
                    "tov",
                    "stl",
                    "blk",
                    "pf",
                ]
            }
            box["fgm"] = min(box["fgm"], box["fga"])
            box["fg3m"] = min(box["fg3m"], box["fg3a"], box["fgm"])
            box["ftm"] = min(box["ftm"], box["fta"])
            box["reb"] = box["oreb"] + box["dreb"]
            box["pts"] = 2 * (box["fgm"] - box["fg3m"]) + 3 * box["fg3m"] + box["ftm"]
            gp = int(min(team_row["gp"], max(1, round(team_row["gp"] * min(1.0, share * 3)))))
            net = off_rating - def_rating
            w = int(round(gp * float(np.clip(0.5 + net * 0.02, 0.1, 0.9))))
            sorted_combo = sorted(combo, key=lambda pid: names.loc[pid, "last_name"])
            rows.append(
                {
                    "season": season,
                    "season_type": REGULAR_SEASON,
                    "team_id": team_id,
                    "group_id": "-" + "-".join(str(p) for p in sorted_combo) + "-",
                    "group_name": " - ".join(_initial_last(names.loc[p]) for p in sorted_combo),
                    "player_ids": [int(p) for p in sorted_combo],
                    "gp": float(gp),
                    "w": float(w),
                    "l": float(gp - w),
                    "min": minutes,
                    **box,
                    "blka": np.nan,
                    "pfd": np.nan,
                    "plus_minus": round((off_rating - def_rating) * poss / 100.0, 1),
                    "off_rating": off_rating,
                    "def_rating": def_rating,
                    "net_rating": round(net, 1),
                    "pace": pace,
                    "poss": poss,
                }
            )
    return pd.DataFrame(rows)


def on_off_synthetic(
    rng: np.random.Generator,
    season: str,
    player_season: pd.DataFrame,
    team_season: pd.DataFrame,
    league: League,
) -> pd.DataFrame:
    stints = player_season[~player_season["is_aggregate"]]
    ts = team_season.set_index("team_id")
    rows = []
    for r in stints.itertuples():
        team = ts.loc[r.team_id]
        a = league.attrs.loc[r.player_id]
        team_min = float(team["min"]) * (
            r.gp / float(team["gp"])
        )  # team minutes in this player's games
        on_off = round(team["off_rating"] + 0.7 * a["impact_off"] + rng.normal(0, 1.5), 1)
        on_def = round(team["def_rating"] - 0.7 * a["impact_def"] + rng.normal(0, 1.5), 1)
        share = min(r.min / max(team_min, 1e-9), 0.999)
        off_off = round(
            team["off_rating"]
            - 0.7 * a["impact_off"] * share / max(1 - share, 0.05)
            + rng.normal(0, 1.5),
            1,
        )
        off_def = round(
            team["def_rating"]
            + 0.7 * a["impact_def"] * share / max(1 - share, 0.05)
            + rng.normal(0, 1.5),
            1,
        )
        base = {
            "season": season,
            "season_type": REGULAR_SEASON,
            "team_id": r.team_id,
            "player_id": r.player_id,
            "gp": float(r.gp),
        }
        rows.append(
            {
                **base,
                "court_status": "On",
                "min": float(r.min),
                "plus_minus": float(r.plus_minus),
                "off_rating": on_off,
                "def_rating": on_def,
                "net_rating": round(on_off - on_def, 1),
            }
        )
        rows.append(
            {
                **base,
                "court_status": "Off",
                "min": round(team_min - float(r.min), 1),
                "plus_minus": float(team["plus_minus"] * (r.gp / float(team["gp"])) - r.plus_minus),
                "off_rating": off_off,
                "def_rating": off_def,
                "net_rating": round(off_off - off_def, 1),
            }
        )
    return pd.DataFrame(rows)


def combine_anthro(rng: np.random.Generator, league: League, cfg: DemoConfig) -> pd.DataFrame:
    first_year = season_start_year(cfg.seasons[0])
    a = league.attrs
    eligible = a[a["draft_year"].notna() & (a["draft_year"] >= first_year - 6)]
    eligible = eligible[rng.random(len(eligible)) < 0.8]
    n = len(eligible)

    def maybe_null(values: np.ndarray, p: float) -> np.ndarray:
        out = values.astype(float)
        out[rng.random(n) < p] = np.nan
        return out

    def q(values: np.ndarray) -> np.ndarray:
        return np.round(values * 4) / 4  # quarter-inch resolution like the provider

    h = eligible["true_height_in"].to_numpy()
    return pd.DataFrame(
        {
            "player_id": eligible.index.to_numpy(),
            "combine_season": [f"{int(y)}-{str(int(y) + 1)[-2:]}" for y in eligible["draft_year"]],
            "position": eligible["position"].to_numpy(),
            "height_wo_shoes_in": q(h),
            "height_w_shoes_in": q(h + 1.25 + rng.normal(0, 0.2, n)),
            "weight_lb": np.round(eligible["weight_lb"].to_numpy() - rng.normal(4, 4, n)),
            "wingspan_in": maybe_null(q(eligible["wingspan_in"].to_numpy()), 0.10),
            "standing_reach_in": maybe_null(q(eligible["standing_reach_in"].to_numpy()), 0.10),
            "body_fat_pct": maybe_null(np.round(eligible["body_fat_pct"].to_numpy(), 1), 0.15),
            "hand_length_in": maybe_null(q(eligible["hand_length_in"].to_numpy()), 0.2),
            "hand_width_in": maybe_null(q(eligible["hand_width_in"].to_numpy()), 0.2),
        }
    )


EVENTS_NOTE = "demo events are the shot events only (the demo has no play-by-play)"


def events_from_shots(
    season: str, shots: pd.DataFrame
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Synthetic ``events``/``event_participants``/``event_id_map`` with one event per shot."""
    from app.events.id_map import VERIFIER
    from app.ingestion.normalize.common import cast_to_schema

    if shots.empty:
        return tuple(
            cast_to_schema(pd.DataFrame(), f)
            for f in ("events", "event_participants", "event_id_map")
        )  # type: ignore[return-value]
    ordered = shots.sort_values(["game_id", "game_event_id"], kind="stable")
    order = ordered.groupby("game_id").cumcount()
    made = ordered["shot_made_flag"].fillna(0).astype(int) == 1
    events = pd.DataFrame(
        {
            "game_id": ordered["game_id"].astype(str),
            "season": season,
            "season_type": REGULAR_SEASON,
            "source_event_system": "demo_shots",
            "source_event_id": ordered["game_event_id"].astype(int),
            "source_order": order.to_numpy(),
            "duplicate_of": None,
            "period": ordered["period"],
            "clock_ms": (
                ordered["minutes_remaining"].fillna(0) * 60 + ordered["seconds_remaining"].fillna(0)
            )
            * 1000,
            "wall_clock": None,
            "action_type": np.where(made, "Made Shot", "Missed Shot"),
            "sub_type": ordered["action_type"],
            "description": np.where(made, "Made Shot", "Missed Shot"),
            "team_id": ordered["team_id"],
            "person_id": ordered["player_id"],
            "is_field_goal": True,
            "shot_result": np.where(made, "Made", "Missed"),
            "shot_value": np.where(ordered["shot_type"].astype(str) == "3PT", 3, 2),
            "x_legacy": ordered["loc_x"],
            "y_legacy": ordered["loc_y"],
            "shot_distance": ordered["shot_distance"],
            "score_home": None,
            "score_away": None,
            "video_available": False,
            "action_id": None,
            "raw_json": [
                json.dumps({"demo": True, "game_event_id": int(g)})
                for g in ordered["game_event_id"]
            ],
            "normalizer_version": 1,
        }
    )
    participants = events[
        [
            "game_id",
            "season",
            "season_type",
            "source_event_system",
            "source_event_id",
            "source_order",
            "person_id",
            "team_id",
            "duplicate_of",
        ]
    ].assign(role="actor", source_slot="personId")
    id_map = pd.DataFrame(
        {
            "game_id": events["game_id"],
            "season": season,
            "season_type": REGULAR_SEASON,
            "pbp_v3_action_number": events["source_event_id"],
            "pbp_v2_eventnum": None,
            "shots_game_event_id": events["source_event_id"],
            "method": "equal_ids",
            "confidence": "exact",
            "verified_at": pd.Timestamp.now(tz="UTC"),
            "verifier": VERIFIER,
        }
    )
    return (
        cast_to_schema(events, "events"),
        cast_to_schema(participants, "event_participants"),
        cast_to_schema(id_map, "event_id_map"),
    )
