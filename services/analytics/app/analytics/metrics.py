"""Reusable, null-safe basketball metric formulas.

Every function returns ``None`` (scalar) or ``NaN`` (vector) when a denominator is zero or an
input is missing. Missing is never represented as zero.
"""

from __future__ import annotations

import math
from collections.abc import Mapping

import numpy as np
import pandas as pd

# True Shooting uses 0.44 * FTA as an *approximation* of free-throw trips that end a possession
# (and-ones, technicals and the first of two attempts do not). It is the conventional constant,
# not an exact accounting of possessions.
TS_FTA_WEIGHT = 0.44

Number = int | float | None


def _is_missing(value: Number) -> bool:
    return value is None or (isinstance(value, float) and math.isnan(value))


def safe_div(num: Number, den: Number) -> float | None:
    """Divide, returning ``None`` for missing inputs or a zero denominator."""
    if _is_missing(num) or _is_missing(den) or den == 0:
        return None
    return float(num) / float(den)  # type: ignore[arg-type]


def pct(made: Number, attempted: Number) -> float | None:
    return safe_div(made, attempted)


def efg_pct(fgm: Number, fg3m: Number, fga: Number) -> float | None:
    """Effective FG% = (FGM + 0.5 * 3PM) / FGA."""
    if _is_missing(fgm) or _is_missing(fg3m):
        return None
    return safe_div(fgm + 0.5 * fg3m, fga)  # type: ignore[operator]


def ts_pct(
    pts: Number, fga: Number, fta: Number, fta_weight: float = TS_FTA_WEIGHT
) -> float | None:
    """True Shooting% = PTS / (2 * (FGA + 0.44 * FTA)). The 0.44 term is an approximation."""
    if _is_missing(fga) or _is_missing(fta):
        return None
    return safe_div(pts, 2.0 * (fga + fta_weight * fta))  # type: ignore[operator]


def per_minutes(value: Number, minutes: Number, per: float = 36.0) -> float | None:
    """Rate per ``per`` minutes (default per-36)."""
    ratio = safe_div(value, minutes)
    return None if ratio is None else ratio * per


def per_100_poss(value: Number, poss: Number) -> float | None:
    """Rate per 100 possessions. Requires a possessions column from the provider."""
    ratio = safe_div(value, poss)
    return None if ratio is None else ratio * 100.0


def per_game(value: Number, games: Number) -> float | None:
    return safe_div(value, games)


def ast_to_ratio(ast: Number, tov: Number) -> float | None:
    """Assist-to-turnover ratio; undefined (None) with zero turnovers rather than infinite."""
    return safe_div(ast, tov)


def points_per_fga(fg2m: Number, fg3m: Number, fga: Number) -> float | None:
    """Points scored from field goals per attempt: (2*2PM + 3*3PM) / FGA.

    This is *not* points per possession: it ignores free throws and turnovers.
    """
    if _is_missing(fg2m) or _is_missing(fg3m):
        return None
    return safe_div(2 * fg2m + 3 * fg3m, fga)  # type: ignore[operator]


# --- vectorised helpers -----------------------------------------------------------------------


def series_safe_div(num: pd.Series, den: pd.Series) -> pd.Series:
    """Element-wise division returning NaN (never inf) where the denominator is zero/missing."""
    n = pd.to_numeric(num, errors="coerce").astype(float)
    d = pd.to_numeric(den, errors="coerce").astype(float)
    with np.errstate(divide="ignore", invalid="ignore"):
        out = np.where((d == 0) | d.isna() | n.isna(), np.nan, n / d)
    return pd.Series(out, index=num.index, dtype=float)


RATE_DEFINITIONS: Mapping[str, tuple[str, ...]] = {
    "fg_pct": ("fgm", "fga"),
    "fg3_pct": ("fg3m", "fg3a"),
    "ft_pct": ("ftm", "fta"),
    "ast_to": ("ast", "tov"),
}


def add_rate_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Return a copy of ``df`` with percentage columns recomputed from totals.

    Adds fg_pct, fg3_pct, ft_pct, efg_pct, ts_pct, ast_to where the inputs exist. Never mutates.
    """
    out = df.copy()
    for name, (num, den) in RATE_DEFINITIONS.items():
        if num in out and den in out:
            out[name] = series_safe_div(out[num], out[den])
    if {"fgm", "fg3m", "fga"}.issubset(out.columns):
        out["efg_pct"] = series_safe_div(out["fgm"] + 0.5 * out["fg3m"], out["fga"])
    if {"pts", "fga", "fta"}.issubset(out.columns):
        out["ts_pct"] = series_safe_div(out["pts"], 2.0 * (out["fga"] + TS_FTA_WEIGHT * out["fta"]))
    return out
