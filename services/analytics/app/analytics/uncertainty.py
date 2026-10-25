"""Uncertainty helpers for shooting-style proportions."""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class Interval:
    lower: float
    upper: float

    @property
    def width(self) -> float:
        return self.upper - self.lower


def wilson_interval(successes: int, trials: int, z: float = 1.96) -> Interval | None:
    """Wilson score interval for a binomial proportion.

    Returns ``None`` for zero trials. Treats attempts as independent, which is an approximation
    for shots taken by the same player in the same games.
    """
    if trials <= 0:
        return None
    if successes < 0 or successes > trials:
        raise ValueError(f"successes ({successes}) must be within [0, trials={trials}]")
    n = float(trials)
    p_hat = successes / n
    z2 = z * z
    denom = 1.0 + z2 / n
    centre = (p_hat + z2 / (2.0 * n)) / denom
    half = (z * math.sqrt(p_hat * (1.0 - p_hat) / n + z2 / (4.0 * n * n))) / denom
    return Interval(lower=max(0.0, centre - half), upper=min(1.0, centre + half))


def beta_shrink(
    successes: int, trials: int, prior_mean: float, prior_strength: float
) -> float | None:
    """Empirical-Bayes shrinkage of a proportion toward a Beta prior.

    The prior is Beta(prior_mean * k, (1 - prior_mean) * k) where ``k = prior_strength`` is
    expressed in pseudo-attempts; the posterior mean is (successes + prior_mean*k)/(trials + k).
    Returns ``None`` for zero trials so missing data stays missing.
    """
    if trials <= 0:
        return None
    if prior_strength < 0:
        raise ValueError("prior_strength must be non-negative")
    return (successes + prior_mean * prior_strength) / (trials + prior_strength)


def shrinkage_weight(trials: int, prior_strength: float) -> float:
    """Share of the shrunk estimate that comes from the observed data: n / (n + k)."""
    if trials <= 0:
        return 0.0
    return trials / (trials + prior_strength)
