import math

import pytest

from app.analytics import court


class TestConstants:
    def test_regulation_dimensions(self):
        assert court.COURT_LENGTH_FT == 94
        assert court.COURT_WIDTH_FT == 50
        assert court.HOOP_CENTER_FROM_BASELINE_FT == pytest.approx(5.25)
        assert court.THREE_PT_RADIUS_FT == pytest.approx(23.75)
        assert court.THREE_PT_CORNER_X_FT == pytest.approx(22.0)
        assert court.RESTRICTED_AREA_RADIUS_FT == 4.0

    def test_corner_break_matches_arc_geometry(self):
        # the straight corner line meets the arc where sqrt(23.75^2 - 22^2) ~= 8.95 ft above the hoop
        assert court.CORNER_BREAK_Y_FT == pytest.approx(math.sqrt(23.75**2 - 22**2), abs=1e-6)
        # which is ~14.2 ft from the baseline, matching the painted 14 ft corner line
        assert court.CORNER_BREAK_Y_FT + court.HOOP_CENTER_FROM_BASELINE_FT == pytest.approx(
            14.2, abs=0.05
        )


class TestConversion:
    def test_provider_units_are_tenths_of_feet_from_hoop_center(self):
        assert court.provider_to_feet(237, 0) == (23.7, 0.0)
        assert court.provider_to_feet(-220, 89) == (-22.0, 8.9)

    def test_round_trip(self):
        x, y = court.provider_to_feet(-123, 45)
        assert court.feet_to_provider(x, y) == (-123, 45)

    def test_distance(self):
        assert court.shot_distance_ft(30, 40) == 5.0  # 3-4-5 triangle in tenths
        assert court.shot_distance_ft(0, 0) == 0.0

    def test_provider_integer_distance_floors(self):
        # provider SHOT_DISTANCE is an integer number of feet (floor)
        assert court.provider_shot_distance(237, 10) == 23


class TestThreePointLine:
    @pytest.mark.parametrize(
        "x,y,expected",
        [
            (0.0, 23.75, True),  # top of the arc
            (0.0, 23.7, False),  # just inside the arc
            (22.5, 0.0, True),  # right corner beyond the line
            (21.5, 0.0, False),  # right corner inside the line
            (-22.1, 5.0, True),  # left corner
            (0.0, 0.0, False),  # at the rim
            (16.8, 16.8, True),  # 45 degrees, distance 23.76
            (16.7, 16.7, False),  # 45 degrees, distance 23.62
        ],
    )
    def test_is_three(self, x, y, expected):
        assert court.is_three_point_ft(x, y) is expected


class TestZones:
    @pytest.mark.parametrize(
        "x,y,zone",
        [
            (0.0, 1.0, "Restricted Area"),
            (6.0, 5.0, "In The Paint (Non-RA)"),
            (0.0, 18.0, "Mid-Range"),
            (-23.0, 2.0, "Left Corner 3"),
            (23.0, 2.0, "Right Corner 3"),
            (0.0, 26.0, "Above the Break 3"),
            (0.0, 45.0, "Backcourt"),
        ],
    )
    def test_zone_basic(self, x, y, zone):
        assert court.zone_basic_ft(x, y) == zone

    def test_paint_bounds(self):
        # paint is 16 ft wide and extends 19 ft from baseline (13.75 ft above the hoop center)
        assert court.zone_basic_ft(7.9, 13.7) == "In The Paint (Non-RA)"
        assert court.zone_basic_ft(8.1, 13.7) == "Mid-Range"
        assert court.zone_basic_ft(7.9, 13.8) == "Mid-Range"

    def test_svg_outline_has_expected_shapes(self):
        geo = court.half_court_geometry()
        assert geo["hoop"]["r"] == pytest.approx(0.75)
        assert geo["three_point"]["radius"] == pytest.approx(23.75)
        assert geo["paint"]["width"] == 16 and geo["paint"]["height"] == 19


class TestZoneAreaAndRange:
    @pytest.mark.parametrize(
        "x,y,area",
        [
            (0.0, 10.0, "Center(C)"),
            (-20.0, 2.0, "Left Side(L)"),
            (20.0, 2.0, "Right Side(R)"),
            (-15.0, 18.0, "Left Side Center(LC)"),
            (15.0, 18.0, "Right Side Center(RC)"),
            (0.0, 45.0, "Back Court(BC)"),
        ],
    )
    def test_zone_area(self, x, y, area):
        assert court.zone_area_ft(x, y) == area

    @pytest.mark.parametrize(
        "x,y,rng",
        [
            (0.0, 3.0, "Less Than 8 ft."),
            (0.0, 10.0, "8-16 ft."),
            (0.0, 20.0, "16-24 ft."),
            (0.0, 26.0, "24+ ft."),
            (0.0, 45.0, "Back Court Shot"),
        ],
    )
    def test_zone_range(self, x, y, rng):
        assert court.zone_range_ft(x, y) == rng

    def test_classify_provider_point(self):
        z = court.classify_provider(230, 20)
        assert z == {
            "shot_zone_basic": "Right Corner 3",
            "shot_zone_area": "Right Side(R)",
            "shot_zone_range": "24+ ft.",
            "shot_type": "3PT Field Goal",
            "shot_distance": 23,
        }
