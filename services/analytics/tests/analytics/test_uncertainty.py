import pytest

from app.analytics import uncertainty as u


class TestWilson:
    def test_zero_trials_is_none(self):
        assert u.wilson_interval(0, 0) is None

    def test_known_value(self):
        # 50 of 100 at z=1.96 -> (0.4038, 0.5962) per the Wilson score formula
        ci = u.wilson_interval(50, 100)
        assert ci.lower == pytest.approx(0.4038, abs=1e-3)
        assert ci.upper == pytest.approx(0.5962, abs=1e-3)

    def test_bounds_stay_in_unit_interval(self):
        ci = u.wilson_interval(0, 3)
        assert ci.lower == 0.0
        assert 0 < ci.upper < 1
        ci = u.wilson_interval(3, 3)
        assert ci.upper == 1.0

    def test_width_shrinks_with_sample_size(self):
        small = u.wilson_interval(5, 10)
        large = u.wilson_interval(500, 1000)
        assert (large.upper - large.lower) < (small.upper - small.lower)

    def test_rejects_impossible_counts(self):
        with pytest.raises(ValueError):
            u.wilson_interval(5, 3)


class TestBetaShrink:
    def test_zero_trials_is_none(self):
        assert u.beta_shrink(0, 0, prior_mean=0.45, prior_strength=50) is None

    def test_moves_toward_prior(self):
        raw = 10 / 10
        shrunk = u.beta_shrink(10, 10, prior_mean=0.45, prior_strength=50)
        assert 0.45 < shrunk < raw
        # (10 + 0.45*50) / (10 + 50)
        assert shrunk == pytest.approx((10 + 22.5) / 60)

    def test_large_sample_dominates_prior(self):
        shrunk = u.beta_shrink(450, 1000, prior_mean=0.60, prior_strength=20)
        assert shrunk == pytest.approx(0.45, abs=0.005)

    def test_shrinkage_weight(self):
        assert u.shrinkage_weight(trials=50, prior_strength=50) == 0.5
        assert u.shrinkage_weight(trials=0, prior_strength=50) == 0.0
