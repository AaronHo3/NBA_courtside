import math

import pandas as pd
import pytest

from app.analytics import percentiles as p


class TestPercentileRank:
    def test_midrank_definition(self):
        pop = pd.Series([1, 2, 3, 4, 5])
        # 3 is above two of five, ties count half: (2 + 0.5) / 5 = 50
        assert p.percentile_rank(pop, 3) == pytest.approx(50.0)
        assert p.percentile_rank(pop, 5) == pytest.approx(90.0)
        assert p.percentile_rank(pop, 1) == pytest.approx(10.0)

    def test_ignores_missing(self):
        pop = pd.Series([1, None, 3, float("nan"), 5])
        assert p.population_size(pop) == 3
        assert p.percentile_rank(pop, 3) == pytest.approx(50.0)

    def test_missing_value_is_none(self):
        assert p.percentile_rank(pd.Series([1, 2]), None) is None
        assert p.percentile_rank(pd.Series([1, 2]), float("nan")) is None

    def test_empty_population_is_none(self):
        assert p.percentile_rank(pd.Series([], dtype=float), 3) is None

    def test_lower_is_better_flips(self):
        pop = pd.Series([1, 2, 3, 4, 5])
        assert p.percentile_rank(pop, 1, higher_is_better=False) == pytest.approx(90.0)

    def test_vectorised(self):
        pop = pd.Series([1, 2, 3, 4, None])
        out = p.percentile_ranks(pop)
        assert out.iloc[0] == pytest.approx(12.5)
        assert math.isnan(out.iloc[4])
