"""Transparent, user-defined composite scores.

A composite is an index the user defines, not an established basketball statistic. Every
component's normalisation, direction, weight and contribution is returned so the UI can show them.
Players missing any component are ineligible by default; weights are never renormalised per player.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
import pandas as pd

from app.analytics.percentiles import percentile_ranks

Normalization = Literal["percentile", "zscore"]


@dataclass(frozen=True)
class ComponentSpec:
    metric: str
    weight: float
    higher_is_better: bool = True


def _normalise(values: pd.Series, method: Normalization, higher_is_better: bool) -> pd.Series:
    if method == "percentile":
        return percentile_ranks(values, higher_is_better=higher_is_better)
    numeric = pd.to_numeric(values, errors="coerce").astype(float)
    std = numeric.std(ddof=0)
    if std == 0 or np.isnan(std):
        z = pd.Series(0.0, index=values.index)
    else:
        z = (numeric - numeric.mean()) / std
    return z if higher_is_better else -z


def compute_composite(
    df: pd.DataFrame,
    components: list[ComponentSpec],
    normalization: Normalization = "percentile",
    require_all: bool = True,
) -> pd.DataFrame:
    """Score each row of ``df``.

    Returns a copy with ``score`` (None when ineligible), ``eligible``, ``missing`` (list of
    component metrics absent for the row) and ``contributions`` (list of dicts, one per component:
    metric, raw, normalized, higher_is_better, weight, contribution, population_size).

    The normalisation population is the eligible cohort, so every component is ranked among the
    same players.
    """
    if not components:
        raise ValueError("at least one component is required")
    for comp in components:
        if comp.metric not in df.columns:
            raise KeyError(f"unknown metric {comp.metric!r}")
    total_weight = sum(c.weight for c in components)
    if total_weight <= 0:
        raise ValueError("component weights must sum to a positive number")
    weights = {c.metric: c.weight / total_weight for c in components}

    out = df.copy()
    metric_frame = out[[c.metric for c in components]].apply(pd.to_numeric, errors="coerce")
    missing_lists = metric_frame.isna().apply(lambda row: list(row[row].index), axis=1)
    out["missing"] = missing_lists
    eligible = metric_frame.notna().all(axis=1) if require_all else pd.Series(True, index=out.index)
    out["eligible"] = eligible

    cohort = metric_frame[eligible]
    normalised: dict[str, pd.Series] = {
        c.metric: _normalise(cohort[c.metric], normalization, c.higher_is_better)
        for c in components
    }
    pop_sizes = {c.metric: int(cohort[c.metric].notna().sum()) for c in components}

    scores: list[float | None] = []
    contributions: list[list[dict[str, object]]] = []
    for idx in out.index:
        if not eligible.loc[idx]:
            scores.append(None)
            contributions.append([])
            continue
        parts: list[dict[str, object]] = []
        total = 0.0
        for comp in components:
            norm = float(normalised[comp.metric].loc[idx])
            contrib = weights[comp.metric] * norm
            total += contrib
            parts.append(
                {
                    "metric": comp.metric,
                    "raw": float(metric_frame.loc[idx, comp.metric]),
                    "normalized": norm,
                    "normalization": normalization,
                    "higher_is_better": comp.higher_is_better,
                    "weight": weights[comp.metric],
                    "contribution": contrib,
                    "population_size": pop_sizes[comp.metric],
                }
            )
        scores.append(total)
        contributions.append(parts)
    out["score"] = pd.Series(scores, index=out.index, dtype=object)
    out["contributions"] = pd.Series(contributions, index=out.index, dtype=object)
    return out
