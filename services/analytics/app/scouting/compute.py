"""Compute trait records (PROFILES_AND_RANKING §3) for players in a season.

Statistical traits only. Values come from the same population frame the explorer and rankings use
(``league_population``: one pooled row per player), per-36/per-100 from ``normalize_counting``,
percentiles from ``percentile_rank`` over the qualified cohort, intervals from ``wilson_interval``.
Nothing is recomputed here with a second formula.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from dataclasses import asdict, dataclass
from typing import Any

import pandas as pd

from app.analytics.percentiles import percentile_rank
from app.analytics.uncertainty import wilson_interval
from app.data.db import Database
from app.data.repositories.common import normalize_counting
from app.data.repositories.league import PopulationFilters, league_population
from app.scouting.defense_traits import defense_dash_pooled, matchup_points_allowed
from app.scouting.traits import STATISTICAL_TRAITS, TRAIT_INDEX, TRAIT_REGISTRY_VERSION, TraitSpec

DEFENSE_CATEGORY = {"d_fg3_pct_diff": "3 Pointers", "d_fg_pct_diff_lt6": "Less Than 6Ft"}


@dataclass(frozen=True)
class Cohort:
    population: str = "all"
    min_gp: int = 10
    min_minutes: float = 100.0
    position: str | None = None


def _num(v: Any) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) or math.isinf(f) else f


def _position_match(series: pd.Series, position: str | None) -> pd.Series:
    if not position:
        return pd.Series(True, index=series.index)
    return series.astype(str).str.split("-").apply(lambda parts: position in parts)


@dataclass
class _Frames:
    base: pd.DataFrame  # one pooled row per player, totals, no thresholds
    cohort_mask: pd.Series
    per36: pd.DataFrame
    per100: pd.DataFrame
    defense: dict[str, pd.DataFrame]
    matchups: pd.DataFrame | None
    matchup_prior: Any


def _frames(
    db: Database, season: str, season_type: str, cohort: Cohort, specs: Iterable[TraitSpec]
) -> _Frames:
    base = league_population(
        db, season, season_type, "totals", PopulationFilters(min_gp=0, min_minutes=0)
    )
    if base.empty:
        return _Frames(base, pd.Series(dtype=bool), base, base, {}, None, None)
    base = base.set_index("player_id", drop=False)
    mask = (
        (base["gp"].fillna(0) >= cohort.min_gp)
        & (base["min"].fillna(0) >= cohort.min_minutes)
        & _position_match(base["position"], cohort.position)
    )
    wanted = {s.key for s in specs}
    defense = {
        key: defense_dash_pooled(db, season, season_type, cat).set_index("player_id")
        for key, cat in DEFENSE_CATEGORY.items()
        if key in wanted and "defense_dash" in db.available_families()
    }
    matchups, prior = (None, None)
    if "matchup_pts_per_poss_allowed" in wanted and "matchups" in db.available_families():
        per, prior = matchup_points_allowed(db, season, season_type)
        matchups = per.set_index("player_id") if not per.empty else None
    return _Frames(
        base,
        mask,
        normalize_counting(base, "per_36"),
        normalize_counting(base, "per_100"),
        defense,
        matchups,
        prior,
    )


def _source_frame(spec: TraitSpec, fr: _Frames) -> pd.DataFrame | None:
    if spec.source_families[0] == "defense_dash":
        return fr.defense.get(spec.key)
    if spec.source_families[0] == "matchups":
        return fr.matchups
    return (
        fr.per36
        if spec.normalization == "per_36"
        else fr.per100
        if spec.normalization == "per_100"
        else fr.base
    )


def _value_series(spec: TraitSpec, frame: pd.DataFrame, fr: _Frames) -> pd.Series:
    """Raw trait value for every player in ``frame`` (pre-qualification), aligned to its index."""
    if spec.source_families[0] == "defense_dash":
        return (frame["d_fgm"] / frame["d_fga"].where(frame["d_fga"] > 0)) - frame["normal_fg_pct"]
    if spec.source_families[0] == "matchups":
        prior = fr.matchup_prior
        if prior is None or prior.mean is None:
            return pd.Series(float("nan"), index=frame.index)
        return (frame["player_pts"] + prior.mean * prior.strength) / (
            frame["partial_poss"] + prior.strength
        )
    if spec.key == "fg3a_rate":
        return frame["fg3a"] / frame["fga"].where(frame["fga"] > 0)
    col = spec.value_column
    return frame[col] if col in frame.columns else pd.Series(float("nan"), index=frame.index)


def _qualified(spec: TraitSpec, frame: pd.DataFrame, fr: _Frames) -> pd.Series:
    ok = pd.Series(True, index=frame.index)
    for col, minimum in spec.qualification:
        src = frame if col in frame.columns else fr.base.reindex(frame.index)
        ok &= (
            pd.to_numeric(src[col], errors="coerce").fillna(0) >= minimum
            if col in src.columns
            else False
        )
    # every trait is judged among the cohort (gp / minutes / position), whatever its source family
    return ok & fr.cohort_mask.reindex(frame.index).fillna(False).astype(bool)


def _unmet_reason(
    spec: TraitSpec, row: pd.Series, base_row: pd.Series | None, in_cohort: bool
) -> str | None:
    parts = []
    for col, minimum in spec.qualification:
        src = row if col in row.index else base_row
        have = _num(src[col]) if src is not None and col in src.index else None
        if have is None or have < minimum:
            parts.append(f"{col} {have if have is not None else 'missing'} < {minimum:g}")
    if not in_cohort:
        parts.append("outside the cohort thresholds")
    return "; ".join(parts) or None


def _skeleton(
    spec: TraitSpec,
    pid: int,
    season: str,
    season_type: str,
    cohort: Cohort,
    fr: _Frames,
    reason_unsupported: str | None,
) -> dict[str, Any]:
    return {
        "player_id": pid,
        "key": spec.key,
        "label": spec.label,
        "evidence_class": spec.evidence_class,
        "definition": spec.definition,
        "formula": spec.formula,
        "units": spec.units,
        "higher_is_better": spec.higher_is_better,
        "time_window": {"season": season, "season_type": season_type},
        "stint_handling": spec.stint_handling,
        "cohort": {
            **asdict(cohort),
            "size": int(fr.cohort_mask.sum()) if len(fr.cohort_mask) else 0,
            "qualified": 0,
        },
        "qualification": {**dict(spec.qualification), "met": False, "reason": None},
        "sample": {"n": None, "denominator": spec.denominator},
        "coverage": None,
        "value": None,
        "raw_value": None,
        "interval": None,
        "percentile": None,
        "evidence_ids": [],
        "version": TRAIT_REGISTRY_VERSION,
        "trait_version": spec.version,
        "limitations": list(spec.limitations),
        "unsupported_reason": reason_unsupported,
    }


def _record(
    spec: TraitSpec,
    pid: int,
    season: str,
    season_type: str,
    cohort: Cohort,
    fr: _Frames,
    reason_unsupported: str | None,
) -> dict[str, Any]:
    base_row = fr.base.loc[pid] if pid in fr.base.index else None
    frame = _source_frame(spec, fr)
    rec = _skeleton(spec, pid, season, season_type, cohort, fr, reason_unsupported)
    if reason_unsupported or frame is None or pid not in frame.index:
        if frame is None and not reason_unsupported:
            rec["unsupported_reason"] = (
                f"{spec.source_families[0]} is not available for {season} {season_type}"
            )
        elif frame is not None and pid not in frame.index and not reason_unsupported:
            rec["qualification"]["reason"] = f"no {spec.source_families[0]} rows for this player"
        return rec
    row = frame.loc[pid]
    values = _value_series(spec, frame, fr)
    qualified = _qualified(spec, frame, fr)
    rec["cohort"]["qualified"] = int(qualified.sum())
    if spec.denominator and spec.denominator in frame.columns:
        rec["sample"]["n"] = int(_num(row[spec.denominator]) or 0)
    elif spec.denominator and base_row is not None and spec.denominator in base_row.index:
        rec["sample"]["n"] = int(_num(base_row[spec.denominator]) or 0)
    if base_row is not None:
        gp = _num(base_row.get("gp"))
        rec["coverage"] = {"games_played": gp, "games_covered": gp, "fraction": 1.0 if gp else None}
    in_cohort = bool(fr.cohort_mask.get(pid, False))
    if not bool(qualified.loc[pid]):
        rec["qualification"]["reason"] = _unmet_reason(spec, row, base_row, in_cohort)
        return rec
    return _fill_value(spec, rec, row, values, qualified, pid, fr)


def _fill_value(
    spec: TraitSpec,
    rec: dict[str, Any],
    row: pd.Series,
    values: pd.Series,
    qualified: pd.Series,
    pid: int,
    fr: _Frames,
) -> dict[str, Any]:
    value = _num(values.loc[pid])
    if value is None:
        rec["qualification"]["reason"] = "value is missing in the source"
        return rec
    rec["qualification"]["met"] = True
    rec["value"] = value
    if spec.source_families[0] == "matchups":
        rec["raw_value"] = (
            _num(row["player_pts"] / row["partial_poss"]) if row["partial_poss"] else None
        )
        rec["shrinkage"] = {
            "prior_mean": fr.matchup_prior.mean,
            "prior_strength": fr.matchup_prior.strength,
            "method": "beta_shrink_equivalent",
        }
    if spec.interval == "wilson" and spec.numerator and spec.denominator:
        s, n = _num(row.get(spec.numerator)), _num(row.get(spec.denominator))
        ci = wilson_interval(int(s), int(n)) if s is not None and n and n > 0 else None
        rec["interval"] = {"low": ci.lower, "high": ci.upper, "method": "wilson_95"} if ci else None
    rec["percentile"] = percentile_rank(
        values[qualified], value, higher_is_better=spec.higher_is_better is not False
    )
    return rec


def _unsupported_reason(
    spec: TraitSpec, fr: _Frames, families: set[str], season: str, season_type: str
) -> str | None:
    missing = [f for f in spec.source_families if f not in families]
    if missing:
        return f"{', '.join(missing)} not ingested"
    if spec.source_families[0] == "defense_dash":
        frame = fr.defense.get(spec.key)
        if frame is None or frame.empty:
            return f"defense_dash has no rows for {season} {season_type}"
    if spec.source_families[0] == "matchups" and fr.matchups is None:
        return f"matchups has no rows for {season} {season_type}"
    return None


def _statistical_specs(trait_keys: Sequence[str] | None) -> list[TraitSpec]:
    if trait_keys is None:
        return list(STATISTICAL_TRAITS)
    specs = [TRAIT_INDEX[k] for k in trait_keys]  # KeyError on unknown key
    other = [s.key for s in specs if s.evidence_class != "statistical"]
    if other:
        raise ValueError(
            f"not statistical traits: {other}; use reviewed_observation_traits for them"
        )
    return specs


@dataclass
class TraitMatrix:
    """Per-player trait values for a season: null where the trait is unsupported or not qualified."""

    values: pd.DataFrame  # index player_id, one column per trait key
    samples: pd.DataFrame  # same shape: denominator counts (NaN when none)
    qualified: pd.DataFrame  # same shape: booleans
    base: pd.DataFrame  # the pooled population frame (index player_id)
    cohort_mask: pd.Series
    unsupported: dict[str, str]


def trait_matrix(
    db: Database, season: str, season_type: str, cohort: Cohort, trait_keys: Sequence[str]
) -> TraitMatrix:
    specs = _statistical_specs(trait_keys)
    fr = _frames(db, season, season_type, cohort, specs)
    if fr.base.empty:
        empty = pd.DataFrame(columns=list(trait_keys))
        return TraitMatrix(empty, empty.copy(), empty.copy(), fr.base, fr.cohort_mask, {})
    families = set(db.available_families())
    values, samples, qualified, unsupported = {}, {}, {}, {}
    for spec in specs:
        reason = _unsupported_reason(spec, fr, families, season, season_type)
        frame = None if reason else _source_frame(spec, fr)
        if reason or frame is None:
            unsupported[spec.key] = reason or f"{spec.source_families[0]} unavailable"
            values[spec.key] = pd.Series(float("nan"), index=fr.base.index)
            samples[spec.key] = pd.Series(float("nan"), index=fr.base.index)
            qualified[spec.key] = pd.Series(False, index=fr.base.index)
            continue
        vals = _value_series(spec, frame, fr)
        q = _qualified(spec, frame, fr)
        values[spec.key] = pd.to_numeric(vals.where(q), errors="coerce").reindex(fr.base.index)
        den = spec.denominator
        if den and den in frame.columns:
            samples[spec.key] = pd.to_numeric(frame[den], errors="coerce").reindex(fr.base.index)
        elif den and den in fr.base.columns:
            samples[spec.key] = pd.to_numeric(fr.base[den], errors="coerce")
        else:
            samples[spec.key] = pd.Series(float("nan"), index=fr.base.index)
        qualified[spec.key] = q.reindex(fr.base.index).fillna(False).astype(bool)
    return TraitMatrix(
        pd.DataFrame(values),
        pd.DataFrame(samples),
        pd.DataFrame(qualified),
        fr.base,
        fr.cohort_mask,
        unsupported,
    )


def compute_traits(
    db: Database,
    player_ids: Sequence[int],
    season: str,
    season_type: str,
    *,
    cohort: Cohort | None = None,
    trait_keys: Sequence[str] | None = None,
) -> list[dict[str, Any]]:
    cohort = cohort or Cohort()
    specs = _statistical_specs(trait_keys)
    fr = _frames(db, season, season_type, cohort, specs)
    if fr.base.empty:
        return []
    families = set(db.available_families())
    out: list[dict[str, Any]] = []
    for pid in player_ids:
        if pid not in fr.base.index:
            continue
        for spec in specs:
            unsupported = _unsupported_reason(spec, fr, families, season, season_type)
            out.append(_record(spec, int(pid), season, season_type, cohort, fr, unsupported))
    return out


__all__ = ["Cohort", "TraitMatrix", "compute_traits", "trait_matrix"]
