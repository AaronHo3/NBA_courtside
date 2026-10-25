"""NBA court geometry and provider coordinate conversion.

Provider (stats.nba.com shotchartdetail) coordinates: ``LOC_X`` and ``LOC_Y`` are in tenths of a
foot with the origin at the centre of the basket. ``LOC_Y`` increases toward half court; ``LOC_X``
increases to the right as seen from behind the basket (so the left corner has negative x). The
left/right convention is the one the provider's SHOT_ZONE_AREA labels follow in our fixtures and is
only used to classify synthetic shots; real shots keep the provider's own zone labels.
"""

from __future__ import annotations

import math

COURT_LENGTH_FT = 94
COURT_WIDTH_FT = 50
HALF_COURT_FT = COURT_LENGTH_FT / 2
HOOP_RADIUS_FT = 0.75  # 18-inch diameter rim
BACKBOARD_FROM_BASELINE_FT = 4.0
HOOP_CENTER_FROM_BASELINE_FT = 5.25  # 4 ft to the backboard + 15 in to the rim centre
BACKBOARD_WIDTH_FT = 6.0
PAINT_WIDTH_FT = 16.0
INNER_PAINT_WIDTH_FT = 12.0
PAINT_LENGTH_FROM_BASELINE_FT = 19.0
FREE_THROW_CIRCLE_RADIUS_FT = 6.0
RESTRICTED_AREA_RADIUS_FT = 4.0
THREE_PT_RADIUS_FT = 23.75
THREE_PT_CORNER_X_FT = 22.0
CENTER_CIRCLE_RADIUS_FT = 6.0

# y (above the hoop centre) where the straight corner line meets the arc.
CORNER_BREAK_Y_FT = math.sqrt(THREE_PT_RADIUS_FT**2 - THREE_PT_CORNER_X_FT**2)
# Paint top and half-court line expressed relative to the hoop centre.
PAINT_TOP_Y_FT = PAINT_LENGTH_FROM_BASELINE_FT - HOOP_CENTER_FROM_BASELINE_FT
HALF_COURT_Y_FT = HALF_COURT_FT - HOOP_CENTER_FROM_BASELINE_FT
BASELINE_Y_FT = -HOOP_CENTER_FROM_BASELINE_FT

PROVIDER_UNITS_PER_FOOT = 10

ZONE_RESTRICTED = "Restricted Area"
ZONE_PAINT = "In The Paint (Non-RA)"
ZONE_MID = "Mid-Range"
ZONE_LEFT_CORNER = "Left Corner 3"
ZONE_RIGHT_CORNER = "Right Corner 3"
ZONE_ABOVE_BREAK = "Above the Break 3"
ZONE_BACKCOURT = "Backcourt"
ZONES_BASIC: tuple[str, ...] = (
    ZONE_RESTRICTED,
    ZONE_PAINT,
    ZONE_MID,
    ZONE_LEFT_CORNER,
    ZONE_RIGHT_CORNER,
    ZONE_ABOVE_BREAK,
    ZONE_BACKCOURT,
)


def provider_to_feet(loc_x: float, loc_y: float) -> tuple[float, float]:
    return (loc_x / PROVIDER_UNITS_PER_FOOT, loc_y / PROVIDER_UNITS_PER_FOOT)


def feet_to_provider(x_ft: float, y_ft: float) -> tuple[int, int]:
    return (round(x_ft * PROVIDER_UNITS_PER_FOOT), round(y_ft * PROVIDER_UNITS_PER_FOOT))


def shot_distance_ft(loc_x: float, loc_y: float) -> float:
    """Euclidean distance from the hoop centre, in feet, from provider units."""
    return math.hypot(loc_x, loc_y) / PROVIDER_UNITS_PER_FOOT


def provider_shot_distance(loc_x: float, loc_y: float) -> int:
    """The provider reports SHOT_DISTANCE as whole feet (floored)."""
    return int(math.floor(shot_distance_ft(loc_x, loc_y)))


def is_three_point_ft(x_ft: float, y_ft: float) -> bool:
    """True if the location is on or beyond the three-point line."""
    if y_ft <= CORNER_BREAK_Y_FT:
        return abs(x_ft) >= THREE_PT_CORNER_X_FT
    return math.hypot(x_ft, y_ft) >= THREE_PT_RADIUS_FT


def zone_basic_ft(x_ft: float, y_ft: float) -> str:
    """Classify a location into the provider's SHOT_ZONE_BASIC vocabulary."""
    if y_ft > HALF_COURT_Y_FT:
        return ZONE_BACKCOURT
    if is_three_point_ft(x_ft, y_ft):
        if y_ft <= CORNER_BREAK_Y_FT:
            return ZONE_LEFT_CORNER if x_ft < 0 else ZONE_RIGHT_CORNER
        return ZONE_ABOVE_BREAK
    if math.hypot(x_ft, y_ft) < RESTRICTED_AREA_RADIUS_FT:
        return ZONE_RESTRICTED
    if abs(x_ft) <= PAINT_WIDTH_FT / 2 and y_ft <= PAINT_TOP_Y_FT:
        return ZONE_PAINT
    return ZONE_MID


def half_court_geometry() -> dict[str, dict[str, float]]:
    """Shapes (in feet, hoop centre at the origin, y toward half court) for drawing the court.

    Served to the frontend so the rendered court shares these tested constants.
    """
    return {
        "bounds": {
            "x_min": -COURT_WIDTH_FT / 2,
            "x_max": COURT_WIDTH_FT / 2,
            "y_min": BASELINE_Y_FT,
            "y_max": HALF_COURT_Y_FT,
        },
        "hoop": {"cx": 0.0, "cy": 0.0, "r": HOOP_RADIUS_FT},
        "backboard": {
            "x1": -BACKBOARD_WIDTH_FT / 2,
            "x2": BACKBOARD_WIDTH_FT / 2,
            "y": BACKBOARD_FROM_BASELINE_FT - HOOP_CENTER_FROM_BASELINE_FT,
        },
        "paint": {
            "x": -PAINT_WIDTH_FT / 2,
            "y": BASELINE_Y_FT,
            "width": PAINT_WIDTH_FT,
            "height": PAINT_LENGTH_FROM_BASELINE_FT,
        },
        "inner_paint": {
            "x": -INNER_PAINT_WIDTH_FT / 2,
            "y": BASELINE_Y_FT,
            "width": INNER_PAINT_WIDTH_FT,
            "height": PAINT_LENGTH_FROM_BASELINE_FT,
        },
        "free_throw_circle": {"cx": 0.0, "cy": PAINT_TOP_Y_FT, "r": FREE_THROW_CIRCLE_RADIUS_FT},
        "restricted_area": {"cx": 0.0, "cy": 0.0, "r": RESTRICTED_AREA_RADIUS_FT},
        "three_point": {
            "radius": THREE_PT_RADIUS_FT,
            "corner_x": THREE_PT_CORNER_X_FT,
            "corner_break_y": CORNER_BREAK_Y_FT,
            "baseline_y": BASELINE_Y_FT,
        },
        "half_court": {"y": HALF_COURT_Y_FT},
        "center_circle": {"cx": 0.0, "cy": HALF_COURT_Y_FT, "r": CENTER_CIRCLE_RADIUS_FT},
    }


AREA_CENTER = "Center(C)"
AREA_LEFT = "Left Side(L)"
AREA_RIGHT = "Right Side(R)"
AREA_LEFT_CENTER = "Left Side Center(LC)"
AREA_RIGHT_CENTER = "Right Side Center(RC)"
AREA_BACKCOURT = "Back Court(BC)"

RANGE_LT8 = "Less Than 8 ft."
RANGE_8_16 = "8-16 ft."
RANGE_16_24 = "16-24 ft."
RANGE_24_PLUS = "24+ ft."
RANGE_BACKCOURT = "Back Court Shot"

# Angle (degrees from the baseline) separating side / side-centre / centre sectors.
_SIDE_ANGLE_DEG = 30.0
_CENTER_ANGLE_DEG = 70.0


def zone_area_ft(x_ft: float, y_ft: float) -> str:
    """Approximate the provider's SHOT_ZONE_AREA sectors from the shot angle."""
    if y_ft > HALF_COURT_Y_FT:
        return AREA_BACKCOURT
    if x_ft == 0 and y_ft == 0:
        return AREA_CENTER
    angle = math.degrees(math.atan2(max(y_ft, 0.0), abs(x_ft)))
    if angle >= _CENTER_ANGLE_DEG:
        return AREA_CENTER
    if angle >= _SIDE_ANGLE_DEG:
        return AREA_LEFT_CENTER if x_ft < 0 else AREA_RIGHT_CENTER
    return AREA_LEFT if x_ft < 0 else AREA_RIGHT


def zone_range_ft(x_ft: float, y_ft: float) -> str:
    """Provider range buckets. Any three-point attempt (including 22-ft corner threes) is
    labelled "24+ ft." by the provider, so the line, not raw distance, decides that bucket."""
    if y_ft > HALF_COURT_Y_FT:
        return RANGE_BACKCOURT
    if is_three_point_ft(x_ft, y_ft):
        return RANGE_24_PLUS
    d = math.hypot(x_ft, y_ft)
    if d < 8:
        return RANGE_LT8
    if d < 16:
        return RANGE_8_16
    if d < 24:
        return RANGE_16_24
    return RANGE_24_PLUS


def classify_provider(loc_x: float, loc_y: float) -> dict[str, str | int]:
    """Full zone vocabulary for a provider-unit location (used for synthetic data + validation)."""
    x_ft, y_ft = provider_to_feet(loc_x, loc_y)
    three = is_three_point_ft(x_ft, y_ft)
    return {
        "shot_zone_basic": zone_basic_ft(x_ft, y_ft),
        "shot_zone_area": zone_area_ft(x_ft, y_ft),
        "shot_zone_range": zone_range_ft(x_ft, y_ft),
        "shot_type": "3PT Field Goal" if three else "2PT Field Goal",
        "shot_distance": provider_shot_distance(loc_x, loc_y),
    }
