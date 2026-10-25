"""Configuration for the deterministic synthetic ("demo") dataset.

Demo data is explicitly fictional: fictional teams and players, synthetic box scores. It exists so
the application is fully usable when the NBA provider is unreachable. It is never mixed with real
data and every row carries ``source == SOURCE``.
"""

from __future__ import annotations

from dataclasses import dataclass

SOURCE = "demo-synthetic"
DEMO_PLAYER_ID_BASE = 9_000_001
DEMO_TEAM_ID_BASE = 9_100_001
REGULAR_SEASON = "Regular Season"


def season_label(start_year: int) -> str:
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def season_start_year(season: str) -> int:
    return int(season[:4])


def default_seasons(last_start_year: int = 2025, count: int = 10) -> tuple[str, ...]:
    return tuple(season_label(y) for y in range(last_start_year - count + 1, last_start_year + 1))


@dataclass(frozen=True)
class DemoConfig:
    seed: int = 20261008
    seasons: tuple[str, ...] = default_seasons()
    # Seasons for which game logs, shots, matchups, lineups, on/off and defense dashboards are
    # generated (expensive families). Other seasons get season totals only.
    detail_seasons: tuple[str, ...] = default_seasons()[-3:]
    n_teams: int = 30
    roster_size: int = 15
    games_per_team: int = 82
    trade_rate: float = 0.08
    availability: float = 0.92

    def __post_init__(self) -> None:
        if self.n_teams % 2:
            raise ValueError("n_teams must be even so every round is a perfect matching")
        if not set(self.detail_seasons) <= set(self.seasons):
            raise ValueError("detail_seasons must be a subset of seasons")
        if self.roster_size < 8:
            raise ValueError("roster_size must be at least 8")
