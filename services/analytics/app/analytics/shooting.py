"""Spatial shot aggregation: hexagonal bins and provider zones.

Frequency and accuracy are returned as separate columns so the UI can encode them separately
(size/opacity for frequency, colour for accuracy). Bins below ``min_attempts`` are flagged rather
than dropped so the user controls the threshold.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

from app.analytics.court import provider_to_feet, zone_basic_ft
from app.analytics.metrics import series_safe_div
from app.analytics.uncertainty import wilson_interval

SQRT3 = math.sqrt(3.0)
THREE_POINT_LABEL = "3PT Field Goal"


# --- hex grid (pointy-top, axial coordinates, ``size`` = circumradius in feet) ----------------


def hex_bin_id(x_ft: float, y_ft: float, size_ft: float) -> tuple[int, int]:
    """Axial (q, r) coordinates of the hexagon containing the point."""
    q = (SQRT3 / 3.0 * x_ft - y_ft / 3.0) / size_ft
    r = (2.0 / 3.0 * y_ft) / size_ft
    return _cube_round(q, r)


def hex_center(q: int, r: int, size_ft: float) -> tuple[float, float]:
    x = size_ft * (SQRT3 * q + SQRT3 / 2.0 * r)
    y = size_ft * (1.5 * r)
    return (x, y)


def _cube_round(q: float, r: float) -> tuple[int, int]:
    s = -q - r
    rq, rr, rs = round(q), round(r), round(s)
    dq, dr, ds = abs(rq - q), abs(rr - r), abs(rs - s)
    if dq > dr and dq > ds:
        rq = -rr - rs
    elif dr > ds:
        rr = -rq - rs
    return int(rq), int(rr)


def _hex_ids_vectorised(
    x_ft: np.ndarray, y_ft: np.ndarray, size_ft: float
) -> tuple[np.ndarray, np.ndarray]:
    q = (SQRT3 / 3.0 * x_ft - y_ft / 3.0) / size_ft
    r = (2.0 / 3.0 * y_ft) / size_ft
    s = -q - r
    rq, rr, rs = np.rint(q), np.rint(r), np.rint(s)
    dq, dr, ds = np.abs(rq - q), np.abs(rr - r), np.abs(rs - s)
    fix_q = (dq > dr) & (dq > ds)
    fix_r = ~fix_q & (dr > ds)
    rq = np.where(fix_q, -rr - rs, rq)
    rr = np.where(fix_r, -rq - rs, rr)
    return rq.astype(int), rr.astype(int)


# --- aggregation ------------------------------------------------------------------------------


def _shot_points(df: pd.DataFrame) -> pd.Series:
    made = df["shot_made_flag"].astype(int)
    value = np.where(df["shot_type"].astype(str) == THREE_POINT_LABEL, 3, 2)
    return pd.Series(made.to_numpy() * value, index=df.index)


def _attach_uncertainty(out: pd.DataFrame, min_attempts: int) -> pd.DataFrame:
    intervals = [
        wilson_interval(int(m), int(a)) for m, a in zip(out["fgm"], out["fga"], strict=True)
    ]
    out = out.copy()
    out["ci_low"] = [None if ci is None else ci.lower for ci in intervals]
    out["ci_high"] = [None if ci is None else ci.upper for ci in intervals]
    out["low_sample"] = out["fga"] < min_attempts
    out["fg_pct"] = series_safe_div(out["fgm"], out["fga"])
    out["pts_per_fga"] = series_safe_div(out["pts"], out["fga"])
    total = out["fga"].sum()
    out["frequency"] = out["fga"] / total if total else np.nan
    return out


def _league_zone_pct(league_zone: pd.DataFrame | None) -> dict[str, float]:
    if league_zone is None or league_zone.empty:
        return {}
    pct = series_safe_div(league_zone["fgm"], league_zone["fga"])
    return {
        z: float(p)
        for z, p in zip(league_zone["shot_zone_basic"], pct, strict=True)
        if not np.isnan(p)
    }


def _ensure_zone(df: pd.DataFrame) -> pd.Series:
    if "shot_zone_basic" in df.columns and df["shot_zone_basic"].notna().all():
        return df["shot_zone_basic"].astype(str)
    return pd.Series(
        [
            zone_basic_ft(*provider_to_feet(x, y))
            for x, y in zip(df["loc_x"], df["loc_y"], strict=True)
        ],
        index=df.index,
    )


HEX_COLUMNS = [
    "q",
    "r",
    "x_ft",
    "y_ft",
    "zone",
    "fga",
    "fgm",
    "pts",
    "fg_pct",
    "ci_low",
    "ci_high",
    "low_sample",
    "pts_per_fga",
    "frequency",
    "league_fg_pct",
    "rel_fg_pct",
]


def aggregate_hex_bins(
    shots: pd.DataFrame,
    size_ft: float = 1.5,
    min_attempts: int = 5,
    league_zone: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Aggregate shots into hexagonal bins.

    ``league_zone`` (columns shot_zone_basic, fga, fgm) supplies the league FG% in each provider
    zone; ``rel_fg_pct`` is the bin FG% minus the league FG% of the bin's dominant zone.
    """
    if shots.empty:
        return pd.DataFrame(columns=HEX_COLUMNS)
    x_ft = shots["loc_x"].to_numpy(dtype=float) / 10.0
    y_ft = shots["loc_y"].to_numpy(dtype=float) / 10.0
    q, r = _hex_ids_vectorised(x_ft, y_ft, size_ft)
    work = pd.DataFrame(
        {
            "q": q,
            "r": r,
            "made": shots["shot_made_flag"].astype(int).to_numpy(),
            "pts": _shot_points(shots).to_numpy(),
            "zone": _ensure_zone(shots).to_numpy(),
        }
    )
    grouped = work.groupby(["q", "r"], sort=False)
    out = grouped.agg(fga=("made", "size"), fgm=("made", "sum"), pts=("pts", "sum")).reset_index()
    dominant_zone = grouped["zone"].agg(lambda s: s.value_counts().index[0]).reset_index(drop=True)
    out["zone"] = dominant_zone.to_numpy()
    centres = [
        hex_center(int(qq), int(rr), size_ft) for qq, rr in zip(out["q"], out["r"], strict=True)
    ]
    out["x_ft"] = [c[0] for c in centres]
    out["y_ft"] = [c[1] for c in centres]
    out = _attach_uncertainty(out, min_attempts)
    league = _league_zone_pct(league_zone)
    out["league_fg_pct"] = out["zone"].map(league).astype(float)
    out["rel_fg_pct"] = out["fg_pct"] - out["league_fg_pct"]
    return out[HEX_COLUMNS]


def aggregate_zones(
    shots: pd.DataFrame,
    min_attempts: int = 10,
    league_zone: pd.DataFrame | None = None,
    zone_col: str = "shot_zone_basic",
) -> pd.DataFrame:
    """Per-zone attempts, makes, FG%, points per FGA, frequency share and uncertainty."""
    cols = [
        "zone",
        "fga",
        "fgm",
        "pts",
        "fg_pct",
        "ci_low",
        "ci_high",
        "low_sample",
        "pts_per_fga",
        "frequency",
        "league_fg_pct",
        "rel_fg_pct",
    ]
    if shots.empty:
        return pd.DataFrame(columns=cols)
    work = pd.DataFrame(
        {
            "zone": shots[zone_col].astype(str).to_numpy(),
            "made": shots["shot_made_flag"].astype(int).to_numpy(),
            "pts": _shot_points(shots).to_numpy(),
        }
    )
    out = (
        work.groupby("zone", sort=False)
        .agg(fga=("made", "size"), fgm=("made", "sum"), pts=("pts", "sum"))
        .reset_index()
    )
    out = _attach_uncertainty(out, min_attempts)
    league = _league_zone_pct(league_zone)
    out["league_fg_pct"] = out["zone"].map(league).astype(float)
    out["rel_fg_pct"] = out["fg_pct"] - out["league_fg_pct"]
    return out[cols]
