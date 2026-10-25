import math

import pandas as pd
import pytest

from app.analytics import composite as c


def _pop():
    return pd.DataFrame(
        {
            "player_id": [1, 2, 3, 4],
            "ts_pct": [0.60, 0.55, 0.50, None],
            "tov_per100": [2.0, 4.0, 3.0, 1.0],
            "ast_per100": [10.0, 5.0, 7.5, 2.5],
        }
    )


COMPONENTS = [
    c.ComponentSpec(metric="ts_pct", weight=2.0, higher_is_better=True),
    c.ComponentSpec(metric="tov_per100", weight=1.0, higher_is_better=False),
    c.ComponentSpec(metric="ast_per100", weight=1.0, higher_is_better=True),
]


class TestComposite:
    def test_weights_normalised_and_contributions_sum_to_score(self):
        out = c.compute_composite(_pop(), COMPONENTS, normalization="percentile")
        eligible = out[out.eligible]
        for _, row in eligible.iterrows():
            total = sum(x["contribution"] for x in row["contributions"])
            assert row["score"] == pytest.approx(total)
        weights = [x["weight"] for x in eligible.iloc[0]["contributions"]]
        assert sum(weights) == pytest.approx(1.0)
        assert weights[0] == pytest.approx(0.5)

    def test_missing_component_makes_player_ineligible_by_default(self):
        out = c.compute_composite(_pop(), COMPONENTS)
        row = out[out.player_id == 4].iloc[0]
        assert bool(row.eligible) is False
        assert row.score is None or (isinstance(row.score, float) and math.isnan(row.score))
        assert "ts_pct" in row.missing

    def test_direction_is_respected(self):
        out = c.compute_composite(_pop(), COMPONENTS)
        # player 1: best TS, lowest TOV (good), most AST -> highest score
        best = out[out.eligible].sort_values("score", ascending=False).iloc[0]
        assert best.player_id == 1

    def test_zscore_normalisation(self):
        out = c.compute_composite(_pop(), COMPONENTS, normalization="zscore")
        eligible = out[out.eligible]
        assert len(eligible) == 3
        assert eligible["score"].mean() == pytest.approx(0.0, abs=1e-9)

    def test_normalisation_population_is_the_eligible_cohort(self):
        # percentiles for a metric are computed among players with that metric present
        out = c.compute_composite(_pop(), COMPONENTS)
        p1 = out[out.player_id == 1].iloc[0]
        ts_contrib = [x for x in p1.contributions if x["metric"] == "ts_pct"][0]
        assert ts_contrib["population_size"] == 3
        assert ts_contrib["normalized"] == pytest.approx(83.333, abs=0.01)

    def test_rejects_zero_total_weight(self):
        with pytest.raises(ValueError):
            c.compute_composite(_pop(), [c.ComponentSpec("ts_pct", 0.0)])

    def test_unknown_metric_rejected(self):
        with pytest.raises(KeyError):
            c.compute_composite(_pop(), [c.ComponentSpec("nope", 1.0)])
