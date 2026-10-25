"""Stored copy of this season's NBA game logs and actual-vs-projected lines for free agents.

The logs are fetched only by an explicit refresh (``POST .../season/game-logs/refresh`` or the CLI);
request paths read the stored Parquet and never contact the provider. Actual lines are scored on the
snapshot's own per-game z scale (same centers and scales as ``performance.py``), so ``value_delta`` reads
as categories-worth of over/under-performance per game. FG%/FT% are makes ÷ attempts over the window.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Iterable
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Literal

import pandas as pd

from app.engine.categories import PRIM_IDX
from app.league.config import LeagueConfig
from app.projections.snapshot import Snapshot
from app.season.performance import _line_matrix, _per_game_scale, _values, player_week_lines
from app.season.tracker import COLS
from app.season.weeks import current_period, period_window, season_start

Scope = Literal["week", "season"]
LogsFetcher = Callable[[str, str], pd.DataFrame]


@dataclass(frozen=True)
class GameLogsMeta:
    season: str
    fetched_at: str
    rows: int
    max_game_date: str | None


@dataclass(frozen=True)
class ActualLine:
    games: int
    per_game: dict[str, float]  # MIN, PTS, REB, AST, STL, BLK, FG3M, FG3A, FGM, FGA, FTM, FTA, TOV
    fg_pct: float | None
    ft_pct: float | None
    value_actual: float
    value_proj: float
    value_delta: float


def _paths(data_dir: Path, season: str) -> tuple[Path, Path]:
    live = Path(data_dir) / "nba" / "live"
    return live / f"game_logs_{season}.parquet", live / f"game_logs_{season}.json"


def refresh_game_logs(data_dir: Path, season: str, fetch: LogsFetcher | None = None) -> GameLogsMeta:
    """Fetch this season's regular-season game logs (network) and store them atomically."""
    if fetch is None:
        from app.sources.nba_stats import fetch_game_logs

        fetch = fetch_game_logs
    frame = fetch(season, "Regular Season")
    parquet, meta_path = _paths(data_dir, season)
    parquet.parent.mkdir(parents=True, exist_ok=True)
    dates = pd.to_datetime(frame["game_date"]).dt.date if len(frame) else pd.Series([], dtype=object)
    meta = GameLogsMeta(
        season=season,
        fetched_at=datetime.now(UTC).replace(microsecond=0).isoformat(),
        rows=int(len(frame)),
        max_game_date=str(dates.max()) if len(frame) else None,
    )
    tmp = parquet.with_suffix(".parquet.tmp")
    frame.to_parquet(tmp, index=False)
    tmp.replace(parquet)
    tmp_meta = meta_path.with_suffix(".json.tmp")
    tmp_meta.write_text(json.dumps(asdict(meta)))
    tmp_meta.replace(meta_path)
    return meta


def load_game_logs(data_dir: Path, season: str) -> tuple[pd.DataFrame | None, GameLogsMeta | None]:
    """Stored logs and their metadata, or (None, None) when no refresh has run."""
    parquet, meta_path = _paths(data_dir, season)
    if not parquet.exists() or not meta_path.exists():
        return None, None
    meta = GameLogsMeta(**json.loads(meta_path.read_text()))
    return pd.read_parquet(parquet), meta


def today_for_games() -> date:
    """Game dates are US-local; six hours behind UTC keeps a late tip-off on its calendar day."""
    return (datetime.now(UTC) - timedelta(hours=6)).date()


def scope_window(season: str, scope: Scope, today: date) -> tuple[int, tuple[date, date]]:
    """The matchup period and date window an ``actuals`` scope covers."""
    period = current_period(season, today)
    if scope == "week":
        return period, period_window(season, period)
    return period, (season_start(season), today)


def actual_lines(
    snap: Snapshot, league: LeagueConfig, logs: pd.DataFrame, window: tuple[date, date], player_ids: Iterable[str]
) -> dict[str, ActualLine]:
    """Per-game actual lines in the window for the given snapshot players, keyed by player id.

    Players with no game in the window are absent (missing stays missing; never a zero line)."""
    lines = player_week_lines(logs, *window)
    if lines.empty:
        return {}
    wanted = [snap.players[snap.index[pid]] for pid in player_ids if pid in snap.index]
    cands = [p for p in wanted if p.nba_id is not None and p.nba_id in lines.index]
    if not cands:
        return {}
    info = _per_game_scale(snap, league)
    idx = [snap.index[p.player_id] for p in cands]
    actual, games = _line_matrix(lines, [p.nba_id for p in cands])
    proj = snap.per_game[idx].copy()
    proj[:, PRIM_IDX["GP"]] = 1.0
    v_act, v_proj = _values(actual, league, info), _values(proj, league, info)
    out: dict[str, ActualLine] = {}
    for r, p in enumerate(cands):
        per_game = {k: float(actual[r, PRIM_IDX[k]]) for k in COLS}
        fga, fta = per_game.get("FGA", 0.0), per_game.get("FTA", 0.0)
        out[p.player_id] = ActualLine(
            games=int(games[r]),
            per_game=per_game,
            fg_pct=per_game["FGM"] / fga if fga else None,
            ft_pct=per_game["FTM"] / fta if fta else None,
            value_actual=float(v_act[r]),
            value_proj=float(v_proj[r]),
            value_delta=float(v_act[r] - v_proj[r]),
        )
    return out
