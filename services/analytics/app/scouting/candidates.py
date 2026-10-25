"""Candidate search (PROFILES_AND_RANKING §6): filter the cohort, score the template, keep the funnel."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

import pandas as pd

from app.analytics.composite import ComponentSpec, compute_composite
from app.data.db import Database
from app.data.paths import DataLayout
from app.data.repositories.rankings import DISCLAIMER as LENS_DISCLAIMER
from app.scouting.compute import Cohort, TraitMatrix, trait_matrix
from app.scouting.fingerprint import data_fingerprint
from app.scouting.roles import COHORT_DEFAULTS, FilterRule, RoleTemplate, validate_role
from app.scouting.traits import TRAIT_INDEX, TRAIT_REGISTRY_VERSION
from app.state.connection import StateDB

DISCLAIMER = (
    "Scores order players by their match to the selected criteria within one season and cohort; a higher "
    "score is not a forecast of team improvement. " + LENS_DISCLAIMER
)
CONTEXT_COLS = ("player_id", "full_name", "team_abbreviation", "position", "age", "gp", "min")
FAMILIES_FOR_FINGERPRINT = ("player_season", "on_off", "defense_dash", "matchups", "combine_anthro")


@dataclass(frozen=True)
class CandidateQuery:
    role: RoleTemplate
    season: str
    season_type: str
    cohort: Cohort = field(default=COHORT_DEFAULTS)
    limit: int = 50
    offset: int = 0
    normalization: str = "percentile"
    layout: DataLayout | None = None
    state_db: StateDB | None = None


@dataclass
class CandidateResult:
    rows: list[dict[str, Any]]
    meta: dict[str, Any]


def _apply_filter(pop: pd.DataFrame, rule: FilterRule, tm: TraitMatrix) -> pd.DataFrame:
    if rule.op == "qualified":
        ok = tm.qualified[rule.column].reindex(pop.index).fillna(False).astype(bool)
        return pop[ok]
    if rule.column in pop.columns:
        col = pop[rule.column]
    elif rule.column in tm.values.columns:
        col = tm.values[rule.column].reindex(pop.index)
    else:
        raise KeyError(rule.column)
    if rule.op == "in":
        wanted = set(rule.value)
        return pop[col.astype(str).str.split("-").apply(lambda parts: bool(wanted & set(parts)))]
    numeric = pd.to_numeric(col, errors="coerce")
    mask = numeric <= rule.value if rule.op == "<=" else numeric >= rule.value
    return pop[mask.fillna(False)]


def _video_coverage(state_db: StateDB | None, season: str, season_type: str) -> dict[int, str]:
    if state_db is None:
        return {}
    rows = state_db.query(
        """SELECT CAST(je.value AS INTEGER) AS player_id, ei.evidence_class, COUNT(*) AS n
           FROM evidence_items ei, json_each(ei.player_ids_json) je
           WHERE ei.namespace = ? AND ei.season = ? AND ei.season_type = ? AND ei.status = 'active'
           GROUP BY 1, 2""",
        [state_db.namespace, season, season_type],
    )
    out: dict[int, str] = {}
    for r in rows:
        pid = int(r["player_id"])
        if r["evidence_class"] == "reviewed_observation":
            out[pid] = "adequate" if r["n"] >= 20 else "limited"
        elif pid not in out:
            out[pid] = "references_only"
    return out


def _row(
    scored: pd.Series, keys: list[str], tm: TraitMatrix, coverage: dict[int, str], has_state: bool
) -> dict[str, Any]:
    pid = int(scored["player_id"])
    traits = {
        k: {
            "value": None if pd.isna(tm.values.at[pid, k]) else float(tm.values.at[pid, k]),
            "n": None if pd.isna(tm.samples.at[pid, k]) else int(tm.samples.at[pid, k]),
            "qualified": bool(tm.qualified.at[pid, k]),
        }
        for k in keys
    }
    return {
        **{c: (None if pd.isna(scored[c]) else scored[c]) for c in CONTEXT_COLS},
        "player_id": pid,
        "score": None
        if scored["score"] is None or pd.isna(scored["score"])
        else float(scored["score"]),
        "eligible": bool(scored["eligible"]),
        "missing": list(scored["missing"]),
        "contributions": list(scored["contributions"]),
        "traits": traits,
        "video_coverage": (coverage.get(pid, "none") if has_state else "unknown"),
    }


def search_candidates(db: Database, q: CandidateQuery) -> CandidateResult:
    validate_role(q.role)
    comp_keys = [c.trait_key for c in q.role.components]
    filter_trait_keys = [
        f.column for f in q.role.filters if f.op == "qualified" or (f.column in TRAIT_INDEX)
    ]
    keys = list(dict.fromkeys([*comp_keys, *filter_trait_keys]))
    tm = trait_matrix(db, q.season, q.season_type, q.cohort, keys)
    template = q.role.to_dict()
    meta: dict[str, Any] = {
        "template": template,
        "trait_registry_version": TRAIT_REGISTRY_VERSION,
        "data_fingerprint": data_fingerprint(
            q.layout, q.season, q.season_type, FAMILIES_FOR_FINGERPRINT
        ),
        "season": q.season,
        "season_type": q.season_type,
        "cohort": asdict(q.cohort),
        "normalization": q.normalization,
        "disclaimer": DISCLAIMER,
        "notes": [f"{k}: {v}" for k, v in tm.unsupported.items()],
        "funnel": [],
        "total": 0,
        "limit": q.limit,
        "offset": q.offset,
    }
    if tm.base.empty:
        meta["notes"].append(f"no player-season rows for {q.season} {q.season_type}")
        return CandidateResult([], meta)
    pop = tm.base[tm.cohort_mask]
    funnel = [{"stage": "cohort", "remaining": int(len(pop))}]
    for rule in q.role.filters:
        pop = _apply_filter(pop, rule, tm)
        funnel.append({"stage": rule.label(), "remaining": int(len(pop))})
    meta["funnel"] = funnel
    meta["total"] = int(len(pop))
    if pop.empty:
        return CandidateResult([], meta)
    # the population frame is indexed by player_id *and* carries the column; drop the index so pandas
    # sorting is unambiguous (the column remains the key everywhere else)
    frame = pop[list(CONTEXT_COLS)].join(tm.values[comp_keys]).reset_index(drop=True)
    comps = [
        ComponentSpec(
            c.trait_key,
            c.weight,
            (TRAIT_INDEX[c.trait_key].higher_is_better is not False)
            if c.higher_is_better is None
            else c.higher_is_better,
        )
        for c in q.role.components
    ]
    scored = compute_composite(frame, comps, normalization=q.normalization)  # type: ignore[arg-type]
    scored = scored.assign(_score=scored["score"].astype(float).fillna(float("-inf")))
    scored = scored.sort_values(
        ["eligible", "_score", "player_id"], ascending=[False, False, True], kind="stable"
    )
    coverage = _video_coverage(q.state_db, q.season, q.season_type)
    page = scored.iloc[q.offset : q.offset + q.limit]
    rows = [_row(r, keys, tm, coverage, q.state_db is not None) for _, r in page.iterrows()]
    meta["eligible"] = int(scored["eligible"].sum())
    meta["components"] = [
        {
            "trait_key": c.metric,
            "weight": c.weight,
            "higher_is_better": c.higher_is_better,
            "label": TRAIT_INDEX[c.metric].label,
        }
        for c in comps
    ]
    return CandidateResult(rows, meta)
