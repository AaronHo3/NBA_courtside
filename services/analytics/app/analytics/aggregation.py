"""Aggregation that respects additive vs ratio statistics.

Counting stats are summed; percentages are recomputed from the summed totals; rating-type
statistics are weighted by possessions (or minutes when possessions are unavailable).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence

import pandas as pd

from app.analytics.metrics import add_rate_columns, safe_div

PLAYER_SEASON_KEYS: tuple[str, ...] = ("player_id", "season", "season_type")

# Additive columns (summed when combining stints or seasons).
SUM_COLS: tuple[str, ...] = (
    "gp",
    "gs",
    "w",
    "l",
    "min",
    "fgm",
    "fga",
    "fg3m",
    "fg3a",
    "ftm",
    "fta",
    "oreb",
    "dreb",
    "reb",
    "ast",
    "stl",
    "blk",
    "blka",
    "tov",
    "pf",
    "pfd",
    "pts",
    "plus_minus",
    "poss",
    "dd2",
    "td3",
)

# Ratio/rating columns (weighted mean, never summed).
RATE_COLS: tuple[str, ...] = (
    "off_rating",
    "def_rating",
    "net_rating",
    "pace",
    "pie",
    "usg_pct",
    "ast_pct",
    "ast_ratio",
    "oreb_pct",
    "dreb_pct",
    "reb_pct",
    "tm_tov_pct",
    "e_off_rating",
    "e_def_rating",
    "e_net_rating",
    "e_usg_pct",
    "e_pace",
)


def weighted_mean(values: Iterable[float | None], weights: Iterable[float | None]) -> float | None:
    """Weighted mean ignoring missing values; ``None`` when total weight is zero."""
    num = 0.0
    den = 0.0
    for v, w in zip(values, weights, strict=True):
        if v is None or w is None or pd.isna(v) or pd.isna(w):
            continue
        num += float(v) * float(w)
        den += float(w)
    return None if den == 0 else num / den


def sum_then_ratio(
    df: pd.DataFrame,
    sum_cols: Sequence[str],
    ratios: Mapping[str, tuple[str, str]],
) -> dict[str, float | int | None]:
    """Sum ``sum_cols`` across rows, then derive each ratio from the pooled totals."""
    out: dict[str, float | int | None] = {c: df[c].sum(min_count=1) for c in sum_cols}
    out = {k: (None if pd.isna(v) else v) for k, v in out.items()}
    for name, (num, den) in ratios.items():
        out[name] = safe_div(out.get(num), out.get(den))
    return out


def _combine_stints(group: pd.DataFrame) -> pd.Series:
    first = group.iloc[0].copy()
    present_sum = [c for c in SUM_COLS if c in group.columns]
    for c in present_sum:
        first[c] = group[c].sum(min_count=1)
    weight_col = "poss" if "poss" in group.columns else "min"
    weights = group[weight_col].tolist() if weight_col in group.columns else [1.0] * len(group)
    for c in RATE_COLS:
        if c in group.columns:
            first[c] = weighted_mean(group[c].tolist(), weights)
    first["team_id"] = 0
    if "team_abbreviation" in group.columns:
        first["team_abbreviation"] = "TOT"
    first["is_aggregate"] = True
    return first


def one_row_per_player_season(df: pd.DataFrame) -> pd.DataFrame:
    """Collapse traded players to exactly one league-wide row per player-season.

    If the provider supplied an aggregate row (``is_aggregate``), keep it; otherwise build one by
    summing stints and possession-weighting ratings. Single-team players pass through unchanged.
    Percentage columns are recomputed from totals so nothing is double counted.
    """
    if df.empty:
        return df.copy()
    keys = [k for k in PLAYER_SEASON_KEYS if k in df.columns]
    rows: list[pd.Series] = []
    for _, group in df.groupby(keys, sort=False, dropna=False):
        if len(group) == 1:
            rows.append(group.iloc[0])
            continue
        aggregates = group[group["is_aggregate"].astype(bool)]
        if not aggregates.empty:
            rows.append(aggregates.iloc[0])
        else:
            rows.append(_combine_stints(group))
    out = pd.DataFrame(rows).reset_index(drop=True)
    out["is_aggregate"] = out["is_aggregate"].astype(bool)
    return add_rate_columns(out)


def with_aggregate_rows(df: pd.DataFrame) -> pd.DataFrame:
    """Keep every stint row and append one league-wide aggregate row per multi-stint player-season
    (only where the provider did not already supply one). Used when persisting the family."""
    if df.empty:
        return df.copy()
    keys = [k for k in PLAYER_SEASON_KEYS if k in df.columns]
    extra: list[pd.Series] = []
    for _, group in df.groupby(keys, sort=False, dropna=False):
        stints = group[~group["is_aggregate"].astype(bool)]
        if len(stints) > 1 and not group["is_aggregate"].astype(bool).any():
            extra.append(_combine_stints(stints))
    if not extra:
        return add_rate_columns(df.copy())
    out = pd.concat([df, pd.DataFrame(extra)], ignore_index=True)
    out["is_aggregate"] = out["is_aggregate"].astype(bool)
    return add_rate_columns(out)
