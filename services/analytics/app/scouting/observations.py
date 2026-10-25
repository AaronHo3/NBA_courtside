"""Reviewed-observation traits (PROFILES_AND_RANKING §2.2) from the ``annotation_snapshots`` family.

A rate counts only human labels on verified subjects that passed review and came from a complete
or sampled event set; curated and provider-selected clips are listed as examples and never enter
the rate. Coverage (games covered / games played) travels with every value.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import pandas as pd

from app.analytics.uncertainty import wilson_interval
from app.data.db import Database
from app.scouting.traits import REVIEWED_TRAITS, TRAIT_INDEX, TRAIT_REGISTRY_VERSION, TraitSpec

RATE_SAMPLING = ("complete_event_set", "systematic_sample", "random_sample")
REVIEWED = ("reviewed_ok", "reviewed_corrected")
MAX_EXAMPLES = 5


def _rows(db: Database, player_id: int, season: str, season_type: str) -> pd.DataFrame:
    return db.query(
        """SELECT * FROM annotation_snapshots
           WHERE subject_player_id = ? AND season = ? AND season_type = ?
             AND snapshot_version = (SELECT MAX(snapshot_version) FROM annotation_snapshots WHERE season = ? AND season_type = ?)
           ORDER BY game_id, media_start_ms, annotation_id""",
        [player_id, season, season_type, season, season_type],
    )


def _games_played(db: Database, player_id: int, season: str, season_type: str) -> float | None:
    v = db.scalar(
        "SELECT MAX(gp) FROM player_season WHERE player_id = ? AND season = ? AND season_type = ?",
        [player_id, season, season_type],
    )
    return None if v is None or pd.isna(v) else float(v)


def _skeleton(
    spec: TraitSpec, player_id: int, season: str, season_type: str, unsupported: str | None
) -> dict[str, Any]:
    return {
        "player_id": player_id,
        "key": spec.key,
        "label": spec.label,
        "evidence_class": spec.evidence_class,
        "definition": spec.definition,
        "formula": spec.formula,
        "units": spec.units,
        "higher_is_better": spec.higher_is_better,
        "time_window": {"season": season, "season_type": season_type},
        "stint_handling": spec.stint_handling,
        "cohort": None,
        "qualification": {"opportunities": 1, "met": False, "reason": None},
        "sample": {"n": 0, "denominator": spec.denominator},
        "coverage": None,
        "value": None,
        "raw_value": None,
        "interval": None,
        "percentile": None,
        "sampling_methods": {},
        "disagreement_count": 0,
        "examples": {"annotation_ids": [], "evidence_ids": []},
        "counterexamples": {"annotation_ids": [], "evidence_ids": []},
        "evidence_ids": [],
        "version": TRAIT_REGISTRY_VERSION,
        "trait_version": spec.version,
        "limitations": list(spec.limitations),
        "unsupported_reason": unsupported,
    }


def _eligible(rows: pd.DataFrame) -> pd.DataFrame:
    human = rows["label_source"].astype(str).str.startswith("human")
    verified = rows["subject_identity_status"] == "verified"
    reviewed = rows["review_status"].isin(REVIEWED)
    live = rows["superseded_by"].isna()
    return rows[human & verified & reviewed & live]


def _trait(
    spec: TraitSpec,
    rows: pd.DataFrame,
    games_played: float | None,
    player_id: int,
    season: str,
    season_type: str,
) -> dict[str, Any]:
    rec = _skeleton(spec, player_id, season, season_type, None)
    mine = _eligible(rows[rows["action"] == spec.action])
    rate_rows = mine[mine["sampling_method"].isin(RATE_SAMPLING)]
    successes = mine[mine["outcome"].isin(spec.success_outcomes)]
    failures = mine[mine["outcome"].isin(spec.failure_outcomes)]
    # deterministic example order: annotation id (ULIDs sort by creation time)
    rec["examples"]["annotation_ids"] = sorted(successes["annotation_id"].astype(str))[
        :MAX_EXAMPLES
    ]
    rec["counterexamples"]["annotation_ids"] = sorted(failures["annotation_id"].astype(str))[
        :MAX_EXAMPLES
    ]
    rec["sampling_methods"] = {
        k: int(v) for k, v in rate_rows["sampling_method"].value_counts().items()
    }
    rec["disagreement_count"] = int((rate_rows["review_status"] == "reviewed_corrected").sum())
    n = int(len(rate_rows))
    rec["sample"]["n"] = n
    if n == 0:
        rec["qualification"]["reason"] = (
            "no reviewed opportunities from a complete or sampled event set"
        )
        return rec
    events = int(rate_rows["outcome"].isin(spec.success_outcomes).sum())
    covered = int(rate_rows["game_id"].nunique())
    rec["coverage"] = {
        "games_played": games_played,
        "games_covered": covered,
        "fraction": (covered / games_played) if games_played else None,
    }
    rec["qualification"]["met"] = True
    rec["value"] = events / n
    rec["raw_value"] = rec["value"]
    ci = wilson_interval(events, n)
    rec["interval"] = {"low": ci.lower, "high": ci.upper, "method": "wilson_95"} if ci else None
    return rec


def reviewed_observation_traits(
    db: Database,
    player_id: int,
    season: str,
    season_type: str,
    *,
    trait_keys: Sequence[str] | None = None,
) -> list[dict[str, Any]]:
    specs = [TRAIT_INDEX[k] for k in trait_keys] if trait_keys else list(REVIEWED_TRAITS)
    wrong = [s.key for s in specs if s.evidence_class != "reviewed_observation"]
    if wrong:
        raise KeyError(f"not reviewed-observation traits: {wrong}")
    if "annotation_snapshots" not in db.available_families():
        reason = "annotation_snapshots not exported yet (no reviewed annotations)"
        return [_skeleton(s, player_id, season, season_type, reason) for s in specs]
    rows = _rows(db, player_id, season, season_type)
    gp = _games_played(db, player_id, season, season_type)
    return [_trait(s, rows, gp, player_id, season, season_type) for s in specs]
