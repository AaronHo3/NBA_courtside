import pandas as pd
import pytest

from app.analytics import aggregation as agg


def _traded_player_rows():
    # A player who played for two teams; provider also supplies a league-wide aggregate (team_id 0).
    return pd.DataFrame(
        {
            "player_id": [1, 1, 1, 2],
            "season": ["2024-25"] * 4,
            "season_type": ["Regular Season"] * 4,
            "team_id": [100, 200, 0, 300],
            "is_aggregate": [False, False, True, False],
            "gp": [30, 40, 70, 82],
            "min": [600.0, 1000.0, 1600.0, 2000.0],
            "fgm": [100, 200, 300, 500],
            "fga": [250, 400, 650, 1000],
            "fg3m": [20, 40, 60, 100],
            "pts": [250, 500, 750, 1300],
            "off_rating": [110.0, 114.0, 112.5, 108.0],
            "poss": [1200.0, 2000.0, 3200.0, 4000.0],
        }
    )


class TestSumThenRatio:
    def test_percentages_come_from_summed_totals_not_averaged(self):
        df = pd.DataFrame({"fgm": [1, 50], "fga": [1, 100]})
        out = agg.sum_then_ratio(df, sum_cols=["fgm", "fga"], ratios={"fg_pct": ("fgm", "fga")})
        # unweighted average of 100% and 50% would be 75%; correct pooled is 51/101
        assert out["fg_pct"] == pytest.approx(51 / 101)
        assert out["fgm"] == 51

    def test_zero_denominator_is_none(self):
        df = pd.DataFrame({"fgm": [0], "fga": [0]})
        out = agg.sum_then_ratio(df, sum_cols=["fgm", "fga"], ratios={"fg_pct": ("fgm", "fga")})
        assert out["fg_pct"] is None


class TestWeightedMean:
    def test_weights(self):
        assert agg.weighted_mean([110.0, 114.0], [1200.0, 2000.0]) == pytest.approx(
            (110 * 1200 + 114 * 2000) / 3200
        )

    def test_ignores_missing_values(self):
        assert agg.weighted_mean([110.0, None], [1200.0, 2000.0]) == 110.0

    def test_zero_total_weight_is_none(self):
        assert agg.weighted_mean([1.0, 2.0], [0.0, 0.0]) is None


class TestPlayerSeasonDedupe:
    def test_keeps_provider_aggregate_row_when_present(self):
        df = _traded_player_rows()
        out = agg.one_row_per_player_season(df)
        assert len(out) == 2
        p1 = out[out.player_id == 1].iloc[0]
        assert bool(p1.is_aggregate) is True
        assert p1.gp == 70

    def test_builds_aggregate_when_provider_row_missing(self):
        df = _traded_player_rows()
        df = df[~df.is_aggregate]
        out = agg.one_row_per_player_season(df)
        p1 = out[out.player_id == 1].iloc[0]
        assert bool(p1.is_aggregate) is True
        assert p1.gp == 70
        assert p1.fgm == 300 and p1.fga == 650 and p1.pts == 750
        # ratio-type columns are possession-weighted, not summed
        assert p1.off_rating == pytest.approx((110 * 1200 + 114 * 2000) / 3200)
        assert p1.team_id == 0

    def test_single_team_player_unchanged(self):
        df = _traded_player_rows()
        out = agg.one_row_per_player_season(df)
        p2 = out[out.player_id == 2].iloc[0]
        assert p2.team_id == 300
        assert bool(p2.is_aggregate) is False

    def test_totals_never_double_count(self):
        df = _traded_player_rows()
        out = agg.one_row_per_player_season(df)
        assert out["pts"].sum() == 750 + 1300


class TestWithAggregateRows:
    def test_appends_aggregate_and_keeps_stints(self):
        df = _traded_player_rows()
        df = df[~df.is_aggregate]
        out = agg.with_aggregate_rows(df)
        assert len(out) == 4  # 2 stints + 1 aggregate + 1 single-team player
        agg_row = out[(out.player_id == 1) & out.is_aggregate].iloc[0]
        assert agg_row.pts == 750 and agg_row.team_id == 0
        assert (out[(out.player_id == 1) & ~out.is_aggregate].team_id.tolist()) == [100, 200]

    def test_does_not_duplicate_existing_aggregate(self):
        out = agg.with_aggregate_rows(_traded_player_rows())
        assert len(out) == 4
