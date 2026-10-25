import math

import numpy as np
import pandas as pd
import pytest

from app.analytics import shooting as sh


def _shots():
    rng = np.random.default_rng(0)
    n = 400
    x = rng.normal(0, 60, n).round()
    y = rng.normal(100, 60, n).round()
    made = rng.random(n) < 0.45
    df = pd.DataFrame(
        {
            "loc_x": x,
            "loc_y": y,
            "shot_made_flag": made.astype(int),
            "shot_type": np.where(np.hypot(x, y) / 10 >= 23.75, "3PT Field Goal", "2PT Field Goal"),
            "shot_zone_basic": ["Mid-Range"] * n,
        }
    )
    return df


class TestHexGrid:
    def test_center_is_within_one_size_of_every_member(self):
        size = 1.5
        pts = [(0.3, 0.2), (10.0, 12.0), (-21.0, 3.0), (5.1, 25.4)]
        for x, y in pts:
            q, r = sh.hex_bin_id(x, y, size)
            cx, cy = sh.hex_center(q, r, size)
            assert math.hypot(cx - x, cy - y) <= size + 1e-9

    def test_same_point_same_bin(self):
        assert sh.hex_bin_id(3.0, 4.0, 1.5) == sh.hex_bin_id(3.0, 4.0, 1.5)

    def test_center_round_trips(self):
        q, r = 3, -2
        cx, cy = sh.hex_center(q, r, 2.0)
        assert sh.hex_bin_id(cx, cy, 2.0) == (q, r)


class TestHexAggregation:
    def test_counts_and_flags(self):
        df = _shots()
        out = sh.aggregate_hex_bins(df, size_ft=2.0, min_attempts=5)
        assert out["fga"].sum() == len(df)
        assert out["fgm"].sum() == df["shot_made_flag"].sum()
        assert set(
            [
                "q",
                "r",
                "x_ft",
                "y_ft",
                "fga",
                "fgm",
                "fg_pct",
                "ci_low",
                "ci_high",
                "low_sample",
                "pts",
                "pts_per_fga",
            ]
        ).issubset(out.columns)
        assert (out.loc[out.fga < 5, "low_sample"]).all()
        assert (~out.loc[out.fga >= 5, "low_sample"]).all()

    def test_points_weight_threes(self):
        df = pd.DataFrame(
            {
                "loc_x": [0, 0, 0],
                "loc_y": [250, 250, 250],
                "shot_made_flag": [1, 1, 0],
                "shot_type": ["3PT Field Goal"] * 3,
                "shot_zone_basic": ["Above the Break 3"] * 3,
            }
        )
        out = sh.aggregate_hex_bins(df, size_ft=2.0, min_attempts=1)
        assert len(out) == 1
        assert out["pts"].iloc[0] == 6
        assert out["pts_per_fga"].iloc[0] == pytest.approx(2.0)

    def test_relative_fg_uses_league_zone_baseline(self):
        df = pd.DataFrame(
            {
                "loc_x": [0, 0, 0, 0],
                "loc_y": [150] * 4,
                "shot_made_flag": [1, 1, 1, 0],
                "shot_type": ["2PT Field Goal"] * 4,
                "shot_zone_basic": ["Mid-Range"] * 4,
            }
        )
        league = pd.DataFrame({"shot_zone_basic": ["Mid-Range"], "fga": [1000], "fgm": [400]})
        out = sh.aggregate_hex_bins(df, size_ft=2.0, min_attempts=1, league_zone=league)
        assert out["rel_fg_pct"].iloc[0] == pytest.approx(0.75 - 0.40)

    def test_empty_input(self):
        out = sh.aggregate_hex_bins(_shots().iloc[0:0], size_ft=2.0, min_attempts=5)
        assert out.empty


class TestZoneSummary:
    def test_zone_summary(self):
        df = _shots()
        df["shot_zone_basic"] = np.where(
            df.shot_type.str.startswith("3"), "Above the Break 3", "Mid-Range"
        )
        out = sh.aggregate_zones(df, min_attempts=10)
        assert out["fga"].sum() == len(df)
        row = out[out.zone == "Mid-Range"].iloc[0]
        assert row["fg_pct"] == pytest.approx(row["fgm"] / row["fga"])
        assert "frequency" in out.columns
        assert out["frequency"].sum() == pytest.approx(1.0)


class TestFrequencyDensity:
    def test_frequency_shares_sum_to_one(self):
        out = sh.aggregate_hex_bins(_shots(), size_ft=2.0, min_attempts=5)
        assert out["frequency"].sum() == pytest.approx(1.0)
