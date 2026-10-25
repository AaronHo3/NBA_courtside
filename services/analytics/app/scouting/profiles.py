"""Scouting profiles (PROFILES_AND_RANKING §1, §3): four evidence classes, never merged, with snapshots.

``build_profile`` is a pure function of (data fingerprint, trait registry version, cohort, time
window) apart from timestamps; the snapshot row records those inputs so a later data change marks
the stored profile stale instead of silently changing it.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict
from typing import Any

from app.data.db import Database
from app.data.paths import DataLayout
from app.data.repositories import players as players_repo
from app.evidence.evidence_items import list_evidence
from app.evidence.registry import now_iso
from app.scouting.candidates import FAMILIES_FOR_FINGERPRINT
from app.scouting.compute import Cohort, compute_traits
from app.scouting.fingerprint import data_fingerprint
from app.scouting.observations import reviewed_observation_traits
from app.scouting.traits import TRAIT_REGISTRY_VERSION
from app.state.connection import StateDB
from app.state.ids import new_ulid

PROFILE_FAMILIES = (*FAMILIES_FOR_FINGERPRINT, "annotation_snapshots", "players")
SNAPSHOT_VERSION = 1


def _cohort_hash(cohort: Cohort) -> str:
    return hashlib.sha1(json.dumps(asdict(cohort), sort_keys=True).encode()).hexdigest()[:12]


def _measurements(bio: dict, comb: dict | None) -> dict[str, Any]:
    roster = {
        "height_in": bio.get("height_in"),
        "weight_lb": bio.get("weight_lb"),
        "source": bio.get("height_source") or "roster-listed",
        "note": "Roster heights are usually listed with shoes; combine heights are measured without shoes. Never mixed.",
    }
    combine = None
    if comb:
        ratio = (
            (comb["wingspan_in"] / comb["height_wo_shoes_in"])
            if comb.get("wingspan_in") and comb.get("height_wo_shoes_in")
            else None
        )
        combine = {
            **comb,
            "wingspan_height_ratio": ratio,
            "source": f"draft combine {comb.get('combine_season')}",
        }
    return {"roster": roster, "combine": combine}


def _stints(db: Database, player_id: int, season: str, season_type: str) -> list[dict[str, Any]]:
    seasons = players_repo.seasons(db, player_id)
    if seasons.empty:
        return []
    rows = seasons[(seasons["season"] == season) & (seasons["season_type"] == season_type)]
    out = []
    for r in rows.itertuples():
        out.append(
            {
                "team_id": int(r.team_id),
                "team_abbreviation": r.team_abbreviation,
                "is_aggregate": bool(r.is_aggregate),
                "gp": r.gp,
                "min": r.min,
            }
        )
    return out


def _store_snapshot(
    state_db: StateDB,
    player_id: int,
    season: str,
    season_type: str,
    cohort: Cohort,
    traits: dict,
    evidence_ids: list[str],
    fingerprint: str,
) -> dict[str, Any]:
    chash = _cohort_hash(cohort)
    existing = state_db.query(
        """SELECT * FROM scouting_profile_snapshots WHERE namespace = ? AND player_id = ? AND season = ? AND season_type = ?
           AND cohort_hash = ? AND trait_registry_version = ? AND data_fingerprint = ?""",
        [
            state_db.namespace,
            player_id,
            season,
            season_type,
            chash,
            TRAIT_REGISTRY_VERSION,
            fingerprint,
        ],
    )
    superseded: list[str] = []
    if existing:
        row = existing[0]
        return {
            "snapshot_id": row["snapshot_id"],
            "created_at": row["created_at"],
            "data_fingerprint": fingerprint,
            "trait_registry_version": TRAIT_REGISTRY_VERSION,
            "snapshot_version": row["snapshot_version"],
            "superseded": superseded,
            "reused": True,
        }
    snapshot_id = new_ulid()
    stamp = now_iso()
    with state_db.transaction():
        cur = state_db.execute(
            """UPDATE scouting_profile_snapshots SET stale = 1, updated_at = ? WHERE namespace = ? AND player_id = ? AND season = ?
               AND season_type = ? AND cohort_hash = ? AND stale = 0 AND (data_fingerprint != ? OR trait_registry_version != ?)
               RETURNING snapshot_id""",
            [
                stamp,
                state_db.namespace,
                player_id,
                season,
                season_type,
                chash,
                fingerprint,
                TRAIT_REGISTRY_VERSION,
            ],
        )
        superseded = [r[0] for r in cur.fetchall()]
        state_db.execute(
            """INSERT INTO scouting_profile_snapshots (snapshot_id, namespace, player_id, season, season_type, cohort_json, cohort_hash,
                   traits_json, evidence_ids_json, trait_registry_version, snapshot_version, data_fingerprint, stale, created_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'system', ?, ?)""",
            [
                snapshot_id,
                state_db.namespace,
                player_id,
                season,
                season_type,
                json.dumps(asdict(cohort)),
                chash,
                json.dumps(traits, default=str),
                json.dumps(evidence_ids),
                TRAIT_REGISTRY_VERSION,
                SNAPSHOT_VERSION,
                fingerprint,
                stamp,
                stamp,
            ],
        )
    return {
        "snapshot_id": snapshot_id,
        "created_at": stamp,
        "data_fingerprint": fingerprint,
        "trait_registry_version": TRAIT_REGISTRY_VERSION,
        "snapshot_version": SNAPSHOT_VERSION,
        "superseded": superseded,
        "reused": False,
    }


def build_profile(
    db: Database,
    state_db: StateDB,
    layout: DataLayout | None,
    player_id: int,
    season: str,
    season_type: str,
    *,
    cohort: Cohort | None = None,
) -> dict[str, Any] | None:
    cohort = cohort or Cohort()
    bio = players_repo.bio(db, player_id)
    if bio is None:
        return None
    statistical = compute_traits(db, [player_id], season, season_type, cohort=cohort)
    reviewed = reviewed_observation_traits(db, player_id, season, season_type)
    evidence, _ = list_evidence(state_db, player_id=player_id, limit=200)
    evidence_ids = [e["evidence_id"] for e in evidence if e.get("season") in (None, season)]
    traits = {
        "statistical": statistical,
        "reviewed_observation": reviewed,
        "model_estimate": [],
        "interpretation": [],
    }
    fingerprint = data_fingerprint(layout, season, season_type, PROFILE_FAMILIES)
    snapshot = _store_snapshot(
        state_db, player_id, season, season_type, cohort, traits, evidence_ids, fingerprint
    )
    return {
        "player": {
            "player_id": player_id,
            "full_name": bio.get("full_name"),
            "position": bio.get("position"),
        },
        "time_window": {"season": season, "season_type": season_type},
        "cohort": asdict(cohort),
        "traits": traits,
        "measurements": _measurements(bio, players_repo.combine(db, player_id)),
        "stints": _stints(db, player_id, season, season_type),
        "evidence_ids": evidence_ids,
        "snapshot": snapshot,
        "limits": [
            "Scores and percentiles describe production in a context (team, role, opponents) the data does not control for.",
            "Reviewed observations describe covered games only; coverage is part of the claim.",
            "Model estimates appear only once validated; interpretations are written by people, not derived here.",
        ],
    }


def _snapshot_row(r: dict) -> dict[str, Any]:
    return {
        k: r[k]
        for k in (
            "snapshot_id",
            "player_id",
            "season",
            "season_type",
            "data_fingerprint",
            "trait_registry_version",
            "snapshot_version",
            "created_at",
        )
    } | {"stale": bool(r["stale"]), "cohort": json.loads(r["cohort_json"])}


def list_snapshots(
    state_db: StateDB, player_id: int, season: str, season_type: str
) -> list[dict[str, Any]]:
    rows = state_db.query(
        "SELECT * FROM scouting_profile_snapshots WHERE namespace = ? AND player_id = ? AND season = ? AND season_type = ? ORDER BY created_at, snapshot_id",
        [state_db.namespace, player_id, season, season_type],
    )
    return [_snapshot_row(r) for r in rows]


def latest_snapshot(
    state_db: StateDB, player_id: int, season: str, season_type: str
) -> dict[str, Any] | None:
    rows = list_snapshots(state_db, player_id, season, season_type)
    return rows[-1] if rows else None
