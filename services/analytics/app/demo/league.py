"""Fictional league construction: teams, player pool with careers, season rosters and trades."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd

from app.demo.archetypes import ARCHETYPES, BASE_ZONE_PCT, POSITION_GROUP, ZONES
from app.demo.config import DEMO_PLAYER_ID_BASE, DEMO_TEAM_ID_BASE, DemoConfig, season_start_year
from app.demo.names import COUNTRIES, SCHOOLS, player_names, team_rows

CONFERENCES = ("East", "West")
DIVISIONS = ("Atlantic", "Central", "Southeast", "Northwest", "Pacific", "Southwest")
ARCHETYPE_WEIGHTS = np.array([0.10, 0.12, 0.12, 0.12, 0.14, 0.08, 0.10, 0.12, 0.10])


@dataclass
class League:
    teams: pd.DataFrame
    players: pd.DataFrame
    attrs: pd.DataFrame  # indexed by player_id
    rosters: pd.DataFrame  # one row per (season, player, stint)

    def roster_for(self, season: str) -> pd.DataFrame:
        return self.rosters[self.rosters.season == season].reset_index(drop=True)


def build_teams(n: int) -> pd.DataFrame:
    rows = []
    for i, (city, nick) in enumerate(team_rows(n)):
        abbr = (city[:3]).upper()
        rows.append(
            {
                "team_id": DEMO_TEAM_ID_BASE + i,
                "abbreviation": abbr,
                "city": city,
                "name": nick,
                "full_name": f"{city} {nick}",
                "conference": CONFERENCES[i % 2],
                "division": DIVISIONS[i % len(DIVISIONS)],
            }
        )
    df = pd.DataFrame(rows)
    # make abbreviations unique
    seen: dict[str, int] = {}
    abbrs = []
    for a in df["abbreviation"]:
        seen[a] = seen.get(a, 0) + 1
        abbrs.append(a if seen[a] == 1 else f"{a[:2]}{seen[a]}")
    df["abbreviation"] = abbrs
    return df


class _PlayerFactory:
    def __init__(self, rng: np.random.Generator, first_season_year: int) -> None:
        self.rng = rng
        self.next_id = DEMO_PLAYER_ID_BASE
        self.first_season_year = first_season_year
        self.rows: list[dict] = []
        self.names = iter(player_names(rng, 5000))

    def create(self, age_at_season: float, season_year: int) -> dict:
        rng = self.rng
        arch_idx = int(rng.choice(len(ARCHETYPES), p=ARCHETYPE_WEIGHTS / ARCHETYPE_WEIGHTS.sum()))
        arch = ARCHETYPES[arch_idx]
        first, last = next(self.names)
        true_height = float(rng.normal(arch.height_mean, arch.height_sd))
        birth_year = season_year - int(age_at_season)
        birth = date(birth_year, int(rng.integers(1, 13)), int(rng.integers(1, 28)))
        talent = float(np.clip(rng.normal(0, 1), -2.5, 2.5))
        drafted = rng.random() < 0.85
        draft_year = birth_year + int(rng.integers(19, 23)) if drafted else None
        zone_adj = {z: float(rng.normal(0, 0.02)) for z in ZONES}
        row = {
            "player_id": self.next_id,
            "first_name": first,
            "last_name": last,
            "full_name": f"{first} {last}",
            "birthdate": birth,
            "country": str(rng.choice(COUNTRIES)),
            "school": str(rng.choice(SCHOOLS)) if rng.random() < 0.8 else None,
            "position": arch.position,
            "pos_group": POSITION_GROUP[arch.position],
            "archetype": arch_idx,
            "talent": talent,
            "true_height_in": true_height,
            "height_in": float(round(true_height + 1.0)),  # roster-listed, with shoes
            "wingspan_in": float(true_height * (arch.wingspan_ratio + rng.normal(0, 0.015))),
            "standing_reach_in": float(true_height * 1.335 + rng.normal(0, 1.0)),
            "weight_lb": float(round(2.9 * true_height - 10 + rng.normal(0, 12))),
            "body_fat_pct": float(np.clip(rng.normal(7.5, 2.0), 3.5, 15)),
            "hand_length_in": float(np.clip(rng.normal(8.8, 0.5), 7.5, 10.5)),
            "hand_width_in": float(np.clip(rng.normal(9.4, 0.6), 7.8, 11.5)),
            "draft_year": draft_year,
            "draft_round": (1 if rng.random() < 0.55 else 2) if drafted else None,
            "draft_number": int(rng.integers(1, 61)) if drafted else None,
            "ft_pct": float(np.clip(arch.ft_pct + rng.normal(0, 0.05) + 0.02 * talent, 0.4, 0.95)),
            "def_adj": float(arch.def_adj + rng.normal(0, 0.015) - 0.004 * talent),
            "impact_off": float(arch.impact * 0.5 + 1.5 * talent + rng.normal(0, 1.0)),
            "impact_def": float(-arch.def_adj * 60 + rng.normal(0, 1.2) + 0.5 * talent),
            "from_year": season_year,
            "to_year": season_year,
            **{f"zone_adj_{z}": zone_adj[z] for z in ZONES},
            **{
                f"zone_pct_{z}": float(
                    np.clip(
                        BASE_ZONE_PCT[z] + arch.zone_pct_adj[i] + zone_adj[z] + 0.025 * talent,
                        0.05,
                        0.95,
                    )
                )
                for i, z in enumerate(ZONES)
            },
        }
        self.next_id += 1
        self.rows.append(row)
        return row


def _retire_prob(age: float, talent: float) -> float:
    base = 0.04 if age < 30 else 0.15 if age < 33 else 0.38 if age < 36 else 0.7
    return float(np.clip(base - 0.03 * talent, 0.01, 0.95))


def build_league(rng: np.random.Generator, cfg: DemoConfig) -> League:
    teams = build_teams(cfg.n_teams)
    team_ids = teams["team_id"].to_numpy()
    first_year = season_start_year(cfg.seasons[0])
    factory = _PlayerFactory(rng, first_year)
    n_active = cfg.n_teams * cfg.roster_size

    # season 0: full pool with a realistic age spread
    active: dict[int, dict] = {}
    for _ in range(n_active):
        age = float(np.clip(rng.normal(26.5, 4.0), 19, 36))
        row = factory.create(age, first_year)
        active[row["player_id"]] = row
    team_of: dict[int, int] = {}
    shuffled = rng.permutation(list(active))
    for i, pid in enumerate(shuffled):
        team_of[int(pid)] = int(team_ids[i % cfg.n_teams])

    roster_rows: list[dict] = []
    games = cfg.games_per_team
    for season in cfg.seasons:
        year = season_start_year(season)
        if year != first_year:
            # retirements
            for pid in list(active):
                row = active[pid]
                age = year - row["birthdate"].year
                if rng.random() < _retire_prob(age, row["talent"]):
                    del active[pid]
                    del team_of[pid]
            # offseason movement: ~22% of continuing players switch teams
            movers = [pid for pid in active if rng.random() < 0.22]
            for pid in movers:
                del team_of[pid]
            # rookies fill the pool back to size
            while len(active) < n_active:
                age = float(rng.integers(19, 24))
                row = factory.create(age, year)
                active[row["player_id"]] = row
            # fill vacancies, balancing roster sizes
            counts = {int(t): 0 for t in team_ids}
            for t in team_of.values():
                counts[t] += 1
            unassigned = [pid for pid in active if pid not in team_of]
            rng.shuffle(unassigned)
            for pid in unassigned:
                t = min(counts, key=lambda k: (counts[k], rng.random()))
                team_of[pid] = t
                counts[t] += 1
        for pid in active:
            active[pid]["to_year"] = year

        # midseason trades: swap pairs of players on different teams at the same game index
        pids = list(active)
        n_pairs = int(round(cfg.trade_rate * len(pids) / 2))
        traded: dict[int, tuple[int, int, int]] = {}  # pid -> (from_team, to_team, game_idx)
        attempts = 0
        while len(traded) < 2 * n_pairs and attempts < 50 * max(n_pairs, 1):
            attempts += 1
            a, b = (int(x) for x in rng.choice(pids, size=2, replace=False))
            if a in traded or b in traded or team_of[a] == team_of[b]:
                continue
            g = int(rng.integers(int(games * 0.3), int(games * 0.7) + 1)) if games >= 4 else 1
            traded[a] = (team_of[a], team_of[b], g)
            traded[b] = (team_of[b], team_of[a], g)
        for pid in pids:
            row = active[pid]
            age = (date(year + 1, 2, 1) - row["birthdate"]).days / 365.25
            if pid in traded:
                frm, to, g = traded[pid]
                roster_rows.append(
                    {
                        "season": season,
                        "player_id": pid,
                        "team_id": frm,
                        "stint": 0,
                        "game_from": 0,
                        "game_to": g,
                        "age": age,
                    }
                )
                roster_rows.append(
                    {
                        "season": season,
                        "player_id": pid,
                        "team_id": to,
                        "stint": 1,
                        "game_from": g,
                        "game_to": games,
                        "age": age,
                    }
                )
                team_of[pid] = to
            else:
                roster_rows.append(
                    {
                        "season": season,
                        "player_id": pid,
                        "team_id": team_of[pid],
                        "stint": 0,
                        "game_from": 0,
                        "game_to": games,
                        "age": age,
                    }
                )

    all_rows = pd.DataFrame(factory.rows)
    last_year = season_start_year(cfg.seasons[-1])
    all_rows["is_active"] = all_rows["to_year"] == last_year
    all_rows["height_source"] = "roster-listed height, with shoes (synthetic)"
    players = all_rows[
        [
            "player_id",
            "full_name",
            "first_name",
            "last_name",
            "birthdate",
            "country",
            "school",
            "position",
            "height_in",
            "weight_lb",
            "draft_year",
            "draft_round",
            "draft_number",
            "from_year",
            "to_year",
            "is_active",
            "height_source",
        ]
    ].copy()
    attrs = all_rows.set_index("player_id")
    rosters = pd.DataFrame(roster_rows)
    return League(teams=teams, players=players, attrs=attrs, rosters=rosters)
