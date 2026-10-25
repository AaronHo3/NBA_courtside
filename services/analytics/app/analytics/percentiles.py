"""Percentile ranks within a comparison population (mid-rank convention)."""

from __future__ import annotations

import math

import numpy as np
import pandas as pd


def population_size(values: pd.Series) -> int:
    return int(pd.to_numeric(values, errors="coerce").notna().sum())


def percentile_rank(
    population: pd.Series, value: float | None, higher_is_better: bool = True
) -> float | None:
    """Percent of the population below ``value``, counting ties as half (0-100).

    Returns ``None`` when the value or the population is missing.
    """
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    pop = pd.to_numeric(population, errors="coerce").dropna().to_numpy(dtype=float)
    if pop.size == 0:
        return None
    below = float(np.sum(pop < value))
    equal = float(np.sum(pop == value))
    rank = 100.0 * (below + 0.5 * equal) / pop.size
    return 100.0 - rank if not higher_is_better else rank


def percentile_ranks(values: pd.Series, higher_is_better: bool = True) -> pd.Series:
    """Vectorised mid-rank percentiles of each element against the whole series."""
    numeric = pd.to_numeric(values, errors="coerce").astype(float)
    pop = numeric.dropna().to_numpy(dtype=float)
    if pop.size == 0:
        return pd.Series(np.nan, index=values.index, dtype=float)
    sorted_pop = np.sort(pop)
    arr = numeric.to_numpy(dtype=float)
    below = np.searchsorted(sorted_pop, arr, side="left")
    upto = np.searchsorted(sorted_pop, arr, side="right")
    equal = upto - below
    ranks = 100.0 * (below + 0.5 * equal) / pop.size
    ranks = np.where(np.isnan(arr), np.nan, ranks)
    if not higher_is_better:
        ranks = 100.0 - ranks
    return pd.Series(ranks, index=values.index, dtype=float)
