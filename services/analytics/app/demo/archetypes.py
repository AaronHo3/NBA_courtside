"""Player archetypes drive the synthetic rates. Values are plausible, not calibrated to any real
player, and only exist to give the demo realistic-looking structure."""

from __future__ import annotations

from dataclasses import dataclass

ZONES: tuple[str, ...] = ("RA", "PAINT", "MID", "CORNER3", "ATB3")
# Rough league-wide make probabilities per zone in the demo world.
BASE_ZONE_PCT: dict[str, float] = {
    "RA": 0.64,
    "PAINT": 0.42,
    "MID": 0.41,
    "CORNER3": 0.39,
    "ATB3": 0.355,
}
DEFENSE_CATEGORIES: tuple[str, ...] = (
    "Overall",
    "3 Pointers",
    "2 Pointers",
    "Less Than 6Ft",
    "Less Than 10Ft",
    "Greater Than 15Ft",
)


@dataclass(frozen=True)
class Archetype:
    key: str
    position: str
    height_mean: float  # inches, without shoes
    height_sd: float
    wingspan_ratio: float  # wingspan / height
    fga36: float
    fta_per_fga: float
    ft_pct: float
    zone_mix: tuple[float, float, float, float, float]  # RA, PAINT, MID, CORNER3, ATB3
    zone_pct_adj: tuple[float, float, float, float, float]
    ast36: float
    tov36: float
    oreb36: float
    dreb36: float
    stl36: float
    blk36: float
    pf36: float
    def_adj: float  # mean shooting-pct change for shots this archetype defends (negative = good)
    impact: float  # mean synthetic net-rating impact


ARCHETYPES: tuple[Archetype, ...] = (
    Archetype(
        "primary_creator",
        "G",
        75.5,
        1.6,
        1.045,
        18.5,
        0.32,
        0.86,
        (0.22, 0.12, 0.18, 0.08, 0.40),
        (0.02, 0.03, 0.03, 0.01, 0.015),
        8.5,
        3.4,
        0.7,
        3.6,
        1.4,
        0.3,
        2.2,
        0.01,
        2.5,
    ),
    Archetype(
        "combo_guard",
        "G",
        75.0,
        1.5,
        1.04,
        15.0,
        0.22,
        0.82,
        (0.24, 0.12, 0.20, 0.10, 0.34),
        (0.0, 0.0, 0.0, 0.0, 0.0),
        4.5,
        2.2,
        0.8,
        3.0,
        1.2,
        0.3,
        2.4,
        0.0,
        0.0,
    ),
    Archetype(
        "spot_up_guard",
        "G",
        76.0,
        1.4,
        1.05,
        12.0,
        0.14,
        0.84,
        (0.16, 0.06, 0.10, 0.22, 0.46),
        (-0.01, -0.02, 0.0, 0.03, 0.03),
        2.6,
        1.3,
        0.6,
        2.8,
        1.0,
        0.3,
        2.5,
        0.005,
        -0.5,
    ),
    Archetype(
        "slasher_wing",
        "G-F",
        78.0,
        1.5,
        1.06,
        15.5,
        0.34,
        0.74,
        (0.40, 0.18, 0.14, 0.08, 0.20),
        (0.02, 0.02, -0.02, -0.03, -0.04),
        3.6,
        2.4,
        1.3,
        4.4,
        1.3,
        0.6,
        2.6,
        0.0,
        0.5,
    ),
    Archetype(
        "three_and_d_wing",
        "F",
        79.0,
        1.5,
        1.065,
        11.5,
        0.16,
        0.78,
        (0.22, 0.08, 0.08, 0.26, 0.36),
        (0.01, -0.02, -0.02, 0.02, 0.01),
        2.0,
        1.2,
        1.2,
        4.2,
        1.5,
        0.8,
        2.8,
        -0.02,
        1.0,
    ),
    Archetype(
        "point_forward",
        "F",
        80.0,
        1.5,
        1.06,
        16.0,
        0.28,
        0.80,
        (0.30, 0.16, 0.16, 0.08, 0.30),
        (0.03, 0.03, 0.02, 0.0, 0.0),
        6.5,
        3.0,
        1.4,
        6.0,
        1.2,
        0.8,
        2.5,
        -0.005,
        2.0,
    ),
    Archetype(
        "stretch_big",
        "F-C",
        82.5,
        1.4,
        1.07,
        12.5,
        0.20,
        0.76,
        (0.34, 0.14, 0.08, 0.10, 0.34),
        (0.02, 0.0, -0.01, 0.0, 0.0),
        2.4,
        1.6,
        2.4,
        7.0,
        0.7,
        1.2,
        3.0,
        -0.01,
        0.5,
    ),
    Archetype(
        "rim_runner",
        "C",
        83.5,
        1.5,
        1.08,
        10.5,
        0.42,
        0.62,
        (0.72, 0.20, 0.06, 0.01, 0.01),
        (0.06, 0.04, -0.04, -0.08, -0.10),
        1.6,
        1.5,
        3.8,
        7.8,
        0.7,
        1.9,
        3.2,
        -0.03,
        1.0,
    ),
    Archetype(
        "post_scorer",
        "C",
        83.0,
        1.5,
        1.07,
        14.5,
        0.36,
        0.70,
        (0.48, 0.28, 0.14, 0.02, 0.08),
        (0.03, 0.06, 0.02, -0.04, -0.05),
        2.8,
        2.2,
        3.0,
        7.2,
        0.8,
        1.4,
        3.0,
        -0.015,
        1.0,
    ),
)

POSITION_GROUP: dict[str, int] = {"G": 0, "G-F": 1, "F": 2, "F-C": 3, "C": 4}


def aging_multiplier(age: float) -> float:
    """Synthetic aging curve: rises to a peak around 27-29, declines after."""
    if age < 27:
        return 0.80 + 0.20 * (age - 19) / 8
    if age <= 29:
        return 1.0
    return max(0.55, 1.0 - 0.035 * (age - 29))
