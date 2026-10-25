"""Schedule and game simulation producing mutually consistent game logs and shot events."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np
import pandas as pd

from app.demo.archetypes import ARCHETYPES, ZONES, aging_multiplier
from app.demo.config import REGULAR_SEASON, DemoConfig, season_start_year
from app.demo.league import League
from app.demo.shot_sampler import classify_vec, sample_locations

ACTION_TYPES = {
    "RA": (
        "Layup Shot",
        "Driving Layup Shot",
        "Dunk Shot",
        "Cutting Layup Shot",
        "Putback Layup Shot",
        "Alley Oop Dunk Shot",
    ),
    "PAINT": (
        "Floating Jump shot",
        "Hook Shot",
        "Driving Floating Jump Shot",
        "Turnaround Hook Shot",
    ),
    "MID": (
        "Jump Shot",
        "Pullup Jump shot",
        "Fadeaway Jump Shot",
        "Turnaround Jump Shot",
        "Step Back Jump shot",
    ),
    "CORNER3": ("Jump Shot", "Jump Shot", "Running Jump Shot"),
    "ATB3": ("Jump Shot", "Pullup Jump shot", "Step Back Jump shot", "Jump Shot"),
}
PERIOD_WEIGHTS = np.array([0.26, 0.24, 0.26, 0.24])
BOX_COLS = [
    "min",
    "fgm",
    "fga",
    "fg3m",
    "fg3a",
    "ftm",
    "fta",
    "oreb",
    "dreb",
    "reb",
    "ast",
    "tov",
    "stl",
    "blk",
    "blka",
    "pf",
    "pfd",
    "pts",
    "plus_minus",
]


@dataclass
class SeasonSim:
    player_logs: pd.DataFrame
    team_logs: pd.DataFrame
    shots: pd.DataFrame  # includes def_player_id (dropped before persisting the shots family)
    free_throws: pd.DataFrame  # game_id, player_id, def_player_id, fta, ftm


def build_schedule(
    rng: np.random.Generator, season: str, team_ids: np.ndarray, games_per_team: int
) -> pd.DataFrame:
    """Each round is a random perfect matching, so every team plays exactly ``games_per_team``."""
    yy = str(season_start_year(season))[-2:]
    start = date(season_start_year(season), 10, 22)
    rows = []
    seq = 1
    for rnd in range(games_per_team):
        order = rng.permutation(team_ids)
        day = start + timedelta(days=2 * rnd + int(rng.integers(0, 2)))
        for i in range(0, len(order), 2):
            a, b = int(order[i]), int(order[i + 1])
            home, away = (a, b) if rng.random() < 0.5 else (b, a)
            rows.append(
                {
                    "game_id": f"D02{yy}{seq:05d}",
                    "round": rnd,
                    "game_date": day,
                    "home_team_id": home,
                    "away_team_id": away,
                }
            )
            seq += 1
    return pd.DataFrame(rows)


def season_ability(talent: np.ndarray, age: np.ndarray) -> np.ndarray:
    aging = np.vectorize(aging_multiplier)(age)
    return 0.35 * talent + (aging - 1.0) * 1.5


def _minutes(rng: np.random.Generator, ability: np.ndarray) -> np.ndarray:
    order = np.argsort(-ability)
    mins = np.empty(len(ability))
    for rank, i in enumerate(order):
        if rank < 5:
            mins[i] = rng.normal(33, 3)
        elif rank < 9:
            mins[i] = rng.normal(20, 4)
        elif rank < 11:
            mins[i] = rng.normal(9, 3)
        else:
            mins[i] = rng.normal(3, 1.5) if rng.random() < 0.6 else 0.0
    mins = np.clip(mins, 0, 40)
    if mins.sum() <= 0:
        mins[:] = 240 / len(mins)
    return mins * 240 / mins.sum()


def _available(rng: np.random.Generator, n: int, p: float) -> np.ndarray:
    avail = rng.random(n) < p
    if avail.sum() < min(8, n):
        avail[rng.choice(n, size=min(8, n), replace=False)] = True
    return avail


class _TeamGame:
    """Per-team-per-game simulation state (vectorised over players)."""

    def __init__(self, rng, roster: pd.DataFrame, attrs: pd.DataFrame, cfg: DemoConfig):
        self.rng = rng
        self.pids = roster["player_id"].to_numpy()
        self.attrs = attrs.loc[self.pids]
        self.ability = season_ability(self.attrs["talent"].to_numpy(), roster["age"].to_numpy())
        avail = _available(rng, len(self.pids), cfg.availability)
        self.pids = self.pids[avail]
        self.attrs = self.attrs[avail]
        self.ability = self.ability[avail]
        self.minutes = _minutes(rng, self.ability)
        self.pos = self.attrs["pos_group"].to_numpy()
        self.arch = [ARCHETYPES[i] for i in self.attrs["archetype"].to_numpy()]
        self.def_adj = self.attrs["def_adj"].to_numpy()

    def defender_weights(self, shooter_pos: np.ndarray) -> np.ndarray:
        # rows: shooters, cols: defenders on this team
        dist = np.abs(shooter_pos[:, None] - self.pos[None, :])
        w = (self.minutes[None, :] + 0.5) * np.exp(-0.8 * dist)
        return w / w.sum(axis=1, keepdims=True)


def _simulate_team(
    rng, tg: _TeamGame, opp: _TeamGame, home: bool
) -> tuple[dict[str, np.ndarray], pd.DataFrame, pd.DataFrame]:
    n = len(tg.pids)
    m36 = tg.minutes / 36.0
    mult = 1.0 + 0.15 * tg.ability
    fga36 = np.array([a.fga36 for a in tg.arch])
    fga = rng.poisson(np.maximum(fga36 * m36 * mult, 0))
    # zone mix per player
    mix = np.array([a.zone_mix for a in tg.arch])
    zone_counts = np.array(
        [rng.multinomial(int(f), p / p.sum()) for f, p in zip(fga, mix, strict=True)]
    )
    shooter_idx = np.repeat(np.arange(n), fga)
    zone_idx = (
        np.concatenate([np.repeat(np.arange(len(ZONES)), zc) for zc in zone_counts])
        if fga.sum()
        else np.array([], dtype=int)
    )
    zones = np.array(ZONES, dtype=object)[zone_idx]
    # defenders
    w = tg.defender_weights(tg.pos)  # placeholder shape; real weights use opp players
    dist = np.abs(tg.pos[:, None] - opp.pos[None, :])
    w = (opp.minutes[None, :] + 0.5) * np.exp(-0.8 * dist)
    w = w / w.sum(axis=1, keepdims=True)
    cum = np.cumsum(w, axis=1)
    u = rng.random(len(shooter_idx))
    def_idx = np.array(
        [int(np.searchsorted(cum[s], uu)) for s, uu in zip(shooter_idx, u, strict=True)], dtype=int
    )
    def_idx = np.minimum(def_idx, len(opp.pids) - 1)
    # make probability
    zone_pct = np.column_stack([tg.attrs[f"zone_pct_{z}"].to_numpy() for z in ZONES])
    p_make = zone_pct[shooter_idx, zone_idx] + opp.def_adj[def_idx] + (0.01 if home else -0.01)
    p_make = np.clip(p_make + 0.02 * tg.ability[shooter_idx], 0.03, 0.97)
    made = (rng.random(len(shooter_idx)) < p_make).astype(int)
    loc_x, loc_y = sample_locations(rng, zones)
    cls = classify_vec(loc_x, loc_y)
    is3 = cls["shot_type"] == "3PT Field Goal"
    shots = pd.DataFrame(
        {
            "shooter_idx": shooter_idx,
            "player_id": tg.pids[shooter_idx],
            "def_player_id": opp.pids[def_idx],
            "zone_key": zones,
            "loc_x": loc_x,
            "loc_y": loc_y,
            "shot_made_flag": made,
            **cls,
        }
    )
    shots["action_type"] = [
        ACTION_TYPES[z][int(i)]
        for z, i in zip(
            zones,
            rng.integers(0, 6, len(zones))
            % np.array([len(ACTION_TYPES[z]) for z in zones], dtype=int)
            if len(zones)
            else [],
            strict=True,
        )
    ]
    shots["period"] = rng.choice([1, 2, 3, 4], size=len(shots), p=PERIOD_WEIGHTS)
    shots["minutes_remaining"] = rng.integers(0, 12, len(shots))
    shots["seconds_remaining"] = rng.integers(0, 60, len(shots))

    fgm = np.bincount(shooter_idx, weights=made, minlength=n).astype(int)
    fg3a = np.bincount(shooter_idx, weights=is3.astype(int), minlength=n).astype(int)
    fg3m = np.bincount(shooter_idx, weights=(is3 & (made == 1)).astype(int), minlength=n).astype(
        int
    )
    fta_rate = np.array([a.fta_per_fga for a in tg.arch])
    fta = rng.poisson(fta_rate * np.maximum(fga36 * m36 * mult, 0))
    ftm = rng.binomial(fta, tg.attrs["ft_pct"].to_numpy())
    ft_def = np.array(
        [int(np.searchsorted(cum[i], rng.random())) if fta[i] else -1 for i in range(n)]
    )
    ft_def = np.minimum(ft_def, len(opp.pids) - 1)
    free_throws = pd.DataFrame(
        {
            "player_id": tg.pids,
            "def_player_id": np.where(ft_def >= 0, opp.pids[np.maximum(ft_def, 0)], -1),
            "fta": fta,
            "ftm": ftm,
        }
    )
    free_throws = free_throws[free_throws.fta > 0]

    def rate(attr: str, scale: float = 1.0) -> np.ndarray:
        r = np.array([getattr(a, attr) for a in tg.arch])
        return rng.poisson(np.maximum(r * m36 * scale, 0))

    oreb, dreb = rate("oreb36"), rate("dreb36")
    ast = rate("ast36", 1.0 + 0.1 * tg.ability)
    tov, stl, blk, pf = rate("tov36"), rate("stl36"), rate("blk36"), rate("pf36")
    pts = 2 * (fgm - fg3m) + 3 * fg3m + ftm
    box = {
        "min": np.round(tg.minutes, 1),
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
        "blka": np.zeros(n, dtype=int),
        "pf": pf,
        "pfd": np.zeros(n, dtype=int),
        "pts": pts,
    }
    return box, shots, free_throws


def _plus_minus(rng, minutes: np.ndarray, margin: int) -> np.ndarray:
    pm = np.rint(margin * 5 * minutes / 240 + rng.normal(0, 3, len(minutes))).astype(int)
    pm[np.argmax(minutes)] += 5 * margin - pm.sum()
    return pm


def simulate_season(
    rng: np.random.Generator, cfg: DemoConfig, season: str, league: League, schedule: pd.DataFrame
) -> SeasonSim:
    roster = league.roster_for(season)
    team_abbr = league.teams.set_index("team_id")["abbreviation"]
    player_rows: list[pd.DataFrame] = []
    team_rows: list[dict] = []
    shot_frames: list[pd.DataFrame] = []
    ft_frames: list[pd.DataFrame] = []
    event_counter = 0
    for g in schedule.itertuples():
        rnd = g.round
        active = roster[(roster.game_from <= rnd) & (rnd < roster.game_to)]
        home_r = active[active.team_id == g.home_team_id]
        away_r = active[active.team_id == g.away_team_id]
        home_tg = _TeamGame(rng, home_r, league.attrs, cfg)
        away_tg = _TeamGame(rng, away_r, league.attrs, cfg)
        hb, hs, hf = _simulate_team(rng, home_tg, away_tg, home=True)
        ab, as_, af = _simulate_team(rng, away_tg, home_tg, home=False)
        hp, ap = int(hb["pts"].sum()), int(ab["pts"].sum())
        if hp == ap:  # break ties with a late free throw (keeps shots consistent)
            i = int(np.argmax(home_tg.minutes))
            hb["fta"][i] += 1
            hb["ftm"][i] += 1
            hb["pts"][i] += 1
            hf = pd.concat(
                [
                    hf,
                    pd.DataFrame(
                        {
                            "player_id": [home_tg.pids[i]],
                            "def_player_id": [away_tg.pids[int(np.argmax(away_tg.minutes))]],
                            "fta": [1],
                            "ftm": [1],
                        }
                    ),
                ],
                ignore_index=True,
            )
            hp += 1
        margin = hp - ap
        for tg, box, team_id, opp_id, is_home, pts_for, pts_against, shots, fts in (
            (home_tg, hb, g.home_team_id, g.away_team_id, True, hp, ap, hs, hf),
            (away_tg, ab, g.away_team_id, g.home_team_id, False, ap, hp, as_, af),
        ):
            box["plus_minus"] = _plus_minus(rng, tg.minutes, margin if is_home else -margin)
            abbr, oabbr = team_abbr[team_id], team_abbr[opp_id]
            frame = pd.DataFrame(box)
            frame.insert(0, "player_id", tg.pids)
            frame["season"] = season
            frame["season_type"] = REGULAR_SEASON
            frame["team_id"] = team_id
            frame["team_abbreviation"] = abbr
            frame["game_id"] = g.game_id
            frame["game_date"] = g.game_date
            frame["matchup"] = f"{abbr} vs. {oabbr}" if is_home else f"{abbr} @ {oabbr}"
            frame["home"] = is_home
            frame["opponent_team_id"] = opp_id
            frame["wl"] = "W" if pts_for > pts_against else "L"
            player_rows.append(frame)
            team_rows.append(
                {
                    "team_id": team_id,
                    "season": season,
                    "season_type": REGULAR_SEASON,
                    "game_id": g.game_id,
                    "game_date": g.game_date,
                    "matchup": frame["matchup"].iloc[0],
                    "home": is_home,
                    "opponent_team_id": opp_id,
                    "wl": frame["wl"].iloc[0],
                    **{
                        c: (240.0 if c == "min" else float(frame[c].sum()))
                        for c in BOX_COLS
                        if c != "plus_minus"
                    },
                    "plus_minus": float(pts_for - pts_against),
                }
            )
            shots = shots.copy()
            shots["season"] = season
            shots["season_type"] = REGULAR_SEASON
            shots["game_id"] = g.game_id
            shots["game_event_id"] = np.arange(event_counter, event_counter + len(shots))
            event_counter += len(shots)
            shots["team_id"] = team_id
            shots["opponent_team_id"] = opp_id
            shots["game_date"] = g.game_date
            shots["home"] = is_home
            shots["event_type"] = np.where(shots["shot_made_flag"] == 1, "Made Shot", "Missed Shot")
            shot_frames.append(shots.drop(columns=["shooter_idx"]))
            fts = fts.copy()
            fts["game_id"] = g.game_id
            fts["team_id"] = team_id
            ft_frames.append(fts)
    player_logs = pd.concat(player_rows, ignore_index=True)
    team_logs = pd.DataFrame(team_rows)
    shots = pd.concat(shot_frames, ignore_index=True)
    fts = (
        pd.concat(ft_frames, ignore_index=True)
        if ft_frames
        else pd.DataFrame(
            columns=["player_id", "def_player_id", "fta", "ftm", "game_id", "team_id"]
        )
    )
    return SeasonSim(player_logs=player_logs, team_logs=team_logs, shots=shots, free_throws=fts)
