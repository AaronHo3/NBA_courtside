"""In-season minutes for season screens: recent minutes from stored game logs blended into the
projected minutes, or a manual per-player override, with counting stats rescaled per minute.

The preseason baseline knows nothing about depth charts: a player benched in October keeps his
starter projection and a new starter keeps his bench one (DEC-34). This module adjusts only minutes.
Per-minute rates stay the projection's, so a hot shooting week does not leak into value; a role
change does. Pure functions: no I/O, the input snapshot is never mutated.
"""

from __future__ import annotations

import hashlib
from collections.abc import Mapping
from dataclasses import dataclass, replace
from typing import Literal

import pandas as pd

from app.engine.categories import PRIM_IDX
from app.projections.snapshot import Snapshot

MinutesSource = Literal["blend", "override"]
_SCALED = [i for k, i in PRIM_IDX.items() if k not in ("MIN", "GP")]


@dataclass(frozen=True)
class MinutesBlendConfig:
    k_games: float = 4.0  # games-equivalent weight on the projection: w_recent = n / (n + k)
    window_games: int = 10  # most recent games per player that count
    max_scale: float = 2.0  # cap on used/projected for counting stats (garbage-time rates are noisy)
    min_projected: float = 1.0  # below this projected MIN there are no rates worth scaling


DEFAULT_BLEND = MinutesBlendConfig()


@dataclass(frozen=True)
class MinutesAdjustment:
    projected: float
    recent: float | None  # mean minutes over the window, None without a game
    games: int
    used: float
    source: MinutesSource


def recent_minutes(logs: pd.DataFrame, window_games: int) -> pd.DataFrame:
    """Per nba_id: mean minutes over the player's last ``window_games`` games and how many that is."""
    if logs.empty:
        return pd.DataFrame(columns=["minutes", "games"]).rename_axis("nba_id")
    ordered = logs.assign(_d=pd.to_datetime(logs["game_date"])).sort_values(["nba_id", "_d"])
    last = ordered.groupby("nba_id", sort=False).tail(window_games)
    agg = last.groupby("nba_id")["min"].agg(minutes="mean", games="count")
    return agg.astype({"minutes": float, "games": int})


def blend_weight(games: int, k_games: float) -> float:
    return games / (games + k_games) if games > 0 else 0.0


def _adjustment_id(base: str, used: Mapping[str, float]) -> str:
    digest = hashlib.sha1("|".join(f"{pid}={m:.2f}" for pid, m in sorted(used.items())).encode()).hexdigest()[:10]
    return f"{base}+min:{digest}"


def adjust_minutes(
    snap: Snapshot,
    logs: pd.DataFrame | None,
    overrides: Mapping[str, float],
    cfg: MinutesBlendConfig | None = None,
    blend: bool = True,
) -> tuple[Snapshot, dict[str, MinutesAdjustment]]:
    """A snapshot whose MIN (and per-minute-scaled counting stats) reflect in-season minutes.

    Overrides win; otherwise players with at least one stored game are blended toward their recent
    mean with weight n/(n+k). Everyone else keeps the projection and is absent from the returned map.
    Returns the input snapshot itself when nothing changes."""
    cfg = cfg or DEFAULT_BLEND
    recent = recent_minutes(logs, cfg.window_games) if (blend and logs is not None and len(logs)) else None
    by_nba = {p.nba_id: p.player_id for p in snap.players if p.nba_id is not None}
    info: dict[str, MinutesAdjustment] = {}
    minutes = snap.per_game[:, PRIM_IDX["MIN"]]

    def recent_for(pid: str) -> tuple[float | None, int]:
        p = snap.players[snap.index[pid]]
        if recent is None or p.nba_id is None or p.nba_id not in recent.index:
            return None, 0
        row = recent.loc[p.nba_id]
        return float(row["minutes"]), int(row["games"])

    for pid, target in overrides.items():
        if pid in snap.index:
            rec, n = recent_for(pid)
            info[pid] = MinutesAdjustment(float(minutes[snap.index[pid]]), rec, n, float(target), "override")
    if recent is not None:
        for nba_id in recent.index:
            pid = by_nba.get(int(nba_id))
            if pid is None or pid in info:
                continue
            rec, n = recent_for(pid)
            proj = float(minutes[snap.index[pid]])
            w = blend_weight(n, cfg.k_games)
            info[pid] = MinutesAdjustment(proj, rec, n, (1 - w) * proj + w * (rec or 0.0), "blend")
    if not info:
        return snap, {}

    per_game = snap.per_game.copy()
    per_game_sd = snap.per_game_sd.copy()
    for pid, a in info.items():
        i = snap.index[pid]
        if a.projected >= cfg.min_projected:
            factor = min(a.used / a.projected, cfg.max_scale)
            per_game[i, _SCALED] *= factor
            per_game_sd[i, _SCALED] *= factor
        elif a.used == 0.0:
            per_game[i, _SCALED] = 0.0
            per_game_sd[i, _SCALED] = 0.0
        per_game[i, PRIM_IDX["MIN"]] = a.used
    adjusted = replace(
        snap,
        snapshot_id=_adjustment_id(snap.snapshot_id, {pid: a.used for pid, a in info.items()}),
        per_game=per_game,
        per_game_sd=per_game_sd,
    )
    return adjusted, info
