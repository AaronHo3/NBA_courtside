"""Vectorised shot-location sampling and zone classification for synthetic shots.

The classifier mirrors ``app.analytics.court`` exactly (same constants and formulas) so synthetic
labels always agree with the tested scalar implementation.
"""

from __future__ import annotations

import numpy as np

from app.analytics import court as c

ZONE_TO_BASIC = {
    "RA": c.ZONE_RESTRICTED,
    "PAINT": c.ZONE_PAINT,
    "MID": c.ZONE_MID,
    "CORNER3": None,  # left or right decided by x
    "ATB3": c.ZONE_ABOVE_BREAK,
}


def is_three_vec(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    corner = y <= c.CORNER_BREAK_Y_FT
    return np.where(
        corner, np.abs(x) >= c.THREE_PT_CORNER_X_FT, np.hypot(x, y) >= c.THREE_PT_RADIUS_FT
    )


def zone_basic_vec(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    out = np.full(x.shape, c.ZONE_MID, dtype=object)
    three = is_three_vec(x, y)
    corner = y <= c.CORNER_BREAK_Y_FT
    d = np.hypot(x, y)
    out[three & corner & (x < 0)] = c.ZONE_LEFT_CORNER
    out[three & corner & (x >= 0)] = c.ZONE_RIGHT_CORNER
    out[three & ~corner] = c.ZONE_ABOVE_BREAK
    paint = ~three & (np.abs(x) <= c.PAINT_WIDTH_FT / 2) & (y <= c.PAINT_TOP_Y_FT)
    out[paint] = c.ZONE_PAINT
    out[~three & (d < c.RESTRICTED_AREA_RADIUS_FT)] = c.ZONE_RESTRICTED
    out[y > c.HALF_COURT_Y_FT] = c.ZONE_BACKCOURT
    return out


def zone_area_vec(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    angle = np.degrees(np.arctan2(np.maximum(y, 0.0), np.abs(x)))
    out = np.where(
        angle >= 70.0,
        c.AREA_CENTER,
        np.where(
            angle >= 30.0,
            np.where(x < 0, c.AREA_LEFT_CENTER, c.AREA_RIGHT_CENTER),
            np.where(x < 0, c.AREA_LEFT, c.AREA_RIGHT),
        ),
    ).astype(object)
    out[(x == 0) & (y == 0)] = c.AREA_CENTER
    out[y > c.HALF_COURT_Y_FT] = c.AREA_BACKCOURT
    return out


def zone_range_vec(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    d = np.hypot(x, y)
    out = np.where(
        d < 8,
        c.RANGE_LT8,
        np.where(d < 16, c.RANGE_8_16, np.where(d < 24, c.RANGE_16_24, c.RANGE_24_PLUS)),
    ).astype(object)
    out[is_three_vec(x, y)] = c.RANGE_24_PLUS
    out[y > c.HALF_COURT_Y_FT] = c.RANGE_BACKCOURT
    return out


def classify_vec(loc_x: np.ndarray, loc_y: np.ndarray) -> dict[str, np.ndarray]:
    x = loc_x.astype(float) / c.PROVIDER_UNITS_PER_FOOT
    y = loc_y.astype(float) / c.PROVIDER_UNITS_PER_FOOT
    three = is_three_vec(x, y)
    return {
        "shot_zone_basic": zone_basic_vec(x, y),
        "shot_zone_area": zone_area_vec(x, y),
        "shot_zone_range": zone_range_vec(x, y),
        "shot_type": np.where(three, "3PT Field Goal", "2PT Field Goal").astype(object),
        "shot_distance": np.floor(np.hypot(loc_x, loc_y) / c.PROVIDER_UNITS_PER_FOOT).astype(int),
    }


def _candidates(rng: np.random.Generator, zone: str, n: int) -> tuple[np.ndarray, np.ndarray]:
    if zone == "RA":
        r = 3.9 * np.sqrt(rng.random(n))
        th = rng.uniform(-0.1, np.pi + 0.1, n)
        return r * np.cos(th), np.maximum(r * np.sin(th), -1.0)
    if zone == "PAINT":
        return rng.uniform(-7.9, 7.9, n), rng.uniform(-2.0, 13.7, n)
    if zone == "MID":
        r = rng.uniform(4.0, 23.6, n)
        th = rng.uniform(-0.05, np.pi + 0.05, n)
        return r * np.cos(th), r * np.sin(th)
    if zone == "CORNER3":
        side = np.where(rng.random(n) < 0.5, -1.0, 1.0)
        return side * rng.uniform(22.05, 24.6, n), rng.uniform(-1.5, 8.9, n)
    if zone == "ATB3":
        r = rng.uniform(23.8, 29.5, n)
        th = rng.uniform(0.0, np.pi, n)
        return r * np.cos(th), r * np.sin(th)
    raise KeyError(zone)


def _accepts(zone: str, basic: np.ndarray) -> np.ndarray:
    if zone == "CORNER3":
        return (basic == c.ZONE_LEFT_CORNER) | (basic == c.ZONE_RIGHT_CORNER)
    return basic == ZONE_TO_BASIC[zone]


def sample_locations(rng: np.random.Generator, zones: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Provider-unit (loc_x, loc_y) integers whose classified basic zone equals the requested zone."""
    n = len(zones)
    loc_x = np.zeros(n, dtype=int)
    loc_y = np.zeros(n, dtype=int)
    for zone in np.unique(zones):
        idx = np.flatnonzero(zones == zone)
        remaining = idx
        while remaining.size:
            xf, yf = _candidates(rng, str(zone), remaining.size)
            lx = np.rint(xf * c.PROVIDER_UNITS_PER_FOOT).astype(int)
            ly = np.rint(yf * c.PROVIDER_UNITS_PER_FOOT).astype(int)
            basic = zone_basic_vec(lx / 10.0, ly / 10.0)
            ok = _accepts(str(zone), basic)
            loc_x[remaining[ok]] = lx[ok]
            loc_y[remaining[ok]] = ly[ok]
            remaining = remaining[~ok]
    return loc_x, loc_y
