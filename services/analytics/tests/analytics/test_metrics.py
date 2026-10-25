import math

import pandas as pd
import pytest

from app.analytics import metrics as m


class TestSafeDiv:
    def test_normal(self):
        assert m.safe_div(1, 4) == 0.25

    @pytest.mark.parametrize("den", [0, 0.0, None])
    def test_zero_or_missing_denominator_is_none(self, den):
        assert m.safe_div(10, den) is None

    def test_missing_numerator_is_none(self):
        assert m.safe_div(None, 5) is None

    def test_nan_inputs_are_none(self):
        assert m.safe_div(float("nan"), 5) is None
        assert m.safe_div(5, float("nan")) is None


class TestEfg:
    def test_formula(self):
        # (FGM + 0.5 * 3PM) / FGA
        assert m.efg_pct(fgm=10, fg3m=4, fga=20) == pytest.approx(0.6)

    def test_zero_attempts(self):
        assert m.efg_pct(fgm=0, fg3m=0, fga=0) is None


class TestTs:
    def test_formula_uses_point_44_approximation(self):
        # PTS / (2 * (FGA + 0.44 * FTA))
        assert m.TS_FTA_WEIGHT == 0.44
        assert m.ts_pct(pts=30, fga=20, fta=10) == pytest.approx(30 / (2 * (20 + 4.4)))

    def test_zero_denominator(self):
        assert m.ts_pct(pts=0, fga=0, fta=0) is None


class TestRates:
    def test_per_36(self):
        assert m.per_minutes(value=20, minutes=30, per=36) == pytest.approx(24.0)

    def test_per_36_zero_minutes(self):
        assert m.per_minutes(value=20, minutes=0) is None

    def test_per_100_poss(self):
        assert m.per_100_poss(value=25, poss=50) == pytest.approx(50.0)

    def test_per_100_missing_poss(self):
        assert m.per_100_poss(value=25, poss=None) is None

    def test_ast_to(self):
        assert m.ast_to_ratio(ast=8, tov=2) == 4.0
        assert m.ast_to_ratio(ast=8, tov=0) is None

    def test_points_per_fga(self):
        # (2*2PM + 3*3PM) / FGA ; 5 twos + 2 threes of 14 attempts
        assert m.points_per_fga(fg2m=5, fg3m=2, fga=14) == pytest.approx(16 / 14)
        assert m.points_per_fga(fg2m=0, fg3m=0, fga=0) is None

    def test_per_game(self):
        assert m.per_game(value=820, games=82) == 10.0
        assert m.per_game(value=820, games=0) is None


class TestVectorised:
    def test_series_safe_div_yields_nan_not_inf(self):
        num = pd.Series([1.0, 2.0, None, 4.0])
        den = pd.Series([2.0, 0.0, 1.0, None])
        out = m.series_safe_div(num, den)
        assert out.iloc[0] == 0.5
        assert math.isnan(out.iloc[1])
        assert math.isnan(out.iloc[2])
        assert math.isnan(out.iloc[3])

    def test_add_rate_columns_from_totals(self):
        df = pd.DataFrame(
            {
                "fgm": [10, 0],
                "fga": [20, 0],
                "fg3m": [4, 0],
                "fg3a": [8, 0],
                "ftm": [5, 0],
                "fta": [6, 0],
                "pts": [29, 0],
                "ast": [6, 0],
                "tov": [3, 0],
                "min": [30.0, 0.0],
            }
        )
        out = m.add_rate_columns(df)
        assert out["fg_pct"].iloc[0] == 0.5
        assert out["efg_pct"].iloc[0] == pytest.approx(0.6)
        assert out["ts_pct"].iloc[0] == pytest.approx(29 / (2 * (20 + 0.44 * 6)))
        assert out["ast_to"].iloc[0] == 2.0
        assert all(math.isnan(out[c].iloc[1]) for c in ["fg_pct", "efg_pct", "ts_pct", "ast_to"])
        # input must not be mutated
        assert "efg_pct" not in df.columns
