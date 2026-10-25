"""Snapshot export (DATA_MODEL §12, DEC-03): SQLite is authoritative, Parquet snapshots are the read
model the trait layer and DuckDB joins consume. One file per version; views union them and readers
filter on ``MAX(snapshot_version)``."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime

import pandas as pd

from app.data.db import Database
from app.data.parquet_io import write_family
from app.data.paths import DataLayout
from app.data.schemas import SNAPSHOT_FAMILIES
from app.evidence.registry import decode_row
from app.state.connection import StateDB

SOURCE = "scouting-snapshot"
_VERSION_FILE = re.compile(r"__v(\d+)\.parquet$")


@dataclass(frozen=True)
class SnapshotReport:
    version: int
    evidence_rows: int
    annotation_rows: int
    files: tuple[str, ...]
    exported_at: str


def snapshot_versions(layout: DataLayout) -> list[int]:
    versions: set[int] = set()
    for family in SNAPSHOT_FAMILIES:
        for path in layout.family_dir(family).glob("*.parquet"):
            m = _VERSION_FILE.search(path.name)
            if m:
                versions.add(int(m.group(1)))
    return sorted(versions)


def latest_snapshot_version(layout: DataLayout) -> int:
    versions = snapshot_versions(layout)
    return versions[-1] if versions else 0


def _seasons_for_games(
    analytics: Database, game_ids: list[str]
) -> dict[str, tuple[str | None, str | None]]:
    if not game_ids:
        return {}
    marks = ", ".join("?" * len(game_ids))
    out: dict[str, tuple[str | None, str | None]] = {}
    for family in ("games", "events"):
        if family not in analytics.available_families():
            continue
        df = analytics.query(
            f"SELECT DISTINCT game_id, season, season_type FROM {family} WHERE game_id IN ({marks})",
            game_ids,
        )
        for r in df.to_dict("records"):
            out.setdefault(str(r["game_id"]), (r.get("season"), r.get("season_type")))
    return out


def _evidence_frame(
    db: StateDB, seasons: dict[str, tuple[str | None, str | None]], version: int
) -> pd.DataFrame:
    rows = [
        decode_row(r)
        for r in db.query(
            "SELECT * FROM evidence_items WHERE namespace = ? ORDER BY created_at, evidence_id",
            [db.namespace],
        )
    ]
    out = []
    for r in rows:
        season, season_type = (r.get("season"), r.get("season_type"))
        if (season is None or season_type is None) and r.get("game_id") in seasons:
            season, season_type = seasons[r["game_id"]]
        out.append(
            {
                "evidence_id": r["evidence_id"],
                "kind": r["kind"],
                "evidence_class": r["evidence_class"],
                "ref_table": r["ref_table"],
                "ref_id": r["ref_id"],
                "player_ids": [int(p) for p in (r.get("player_ids") or [])],
                "game_id": r.get("game_id"),
                "season": season,
                "season_type": season_type,
                "review_status": r["review_status"],
                "status": r["status"],
                "superseded_by": r.get("superseded_by"),
                "summary": r["summary"],
                "snapshot_version": version,
            }
        )
    return pd.DataFrame(out)


def _annotation_frame(
    db: StateDB, seasons: dict[str, tuple[str | None, str | None]], version: int
) -> pd.DataFrame:
    rows = db.query(
        """SELECT a.*, s.asset_id FROM annotations a JOIN video_segments s ON s.segment_id = a.segment_id AND s.namespace = a.namespace
           WHERE a.namespace = ? AND a.deleted_at IS NULL ORDER BY a.created_at, a.annotation_id""",
        [db.namespace],
    )
    out = []
    for r in rows:
        season, season_type = seasons.get(r.get("game_id") or "", (None, None))
        out.append(
            {
                "annotation_id": r["annotation_id"],
                "segment_id": r["segment_id"],
                "asset_id": r["asset_id"],
                "game_id": r.get("game_id"),
                "season": season,
                "season_type": season_type,
                "media_start_ms": r["media_start_ms"],
                "media_end_ms": r["media_end_ms"],
                "subject_player_id": r.get("subject_player_id"),
                "subject_identity_status": r["subject_identity_status"],
                "action": r["action"],
                "vocab_version": r["vocab_version"],
                "outcome": r.get("outcome"),
                "participants_json": r.get("participants_json"),
                "visibility": r["visibility"],
                "label_source": r["label_source"],
                "confidence_raw": r.get("confidence_raw"),
                "sampling_method": r["sampling_method"],
                "event_key_json": r.get("event_key_json"),
                "notes": r.get("notes"),
                "review_status": r["review_status"],
                "revision": r["revision"],
                "superseded_by": r.get("superseded_by"),
                "snapshot_version": version,
            }
        )
    return pd.DataFrame(out)


def export_snapshots(db: StateDB, layout: DataLayout, analytics: Database) -> SnapshotReport:
    version = latest_snapshot_version(layout) + 1
    game_ids = sorted(
        {
            r["game_id"]
            for r in db.query(
                "SELECT DISTINCT game_id FROM evidence_items WHERE namespace = ? AND game_id IS NOT NULL",
                [db.namespace],
            )
        }
        | {
            r["game_id"]
            for r in db.query(
                "SELECT DISTINCT game_id FROM annotations WHERE namespace = ? AND game_id IS NOT NULL",
                [db.namespace],
            )
        }
    )
    seasons = _seasons_for_games(analytics, game_ids)
    stamp = datetime.now(UTC)
    note = f"snapshot_version={version}"
    ev = write_family(
        layout,
        "evidence_snapshots",
        _evidence_frame(db, seasons, version),
        source=SOURCE,
        fetched_at=stamp,
        note=note,
        suffix=f"v{version}",
    )
    ann = write_family(
        layout,
        "annotation_snapshots",
        _annotation_frame(db, seasons, version),
        source=SOURCE,
        fetched_at=stamp,
        note=note,
        suffix=f"v{version}",
    )
    analytics.refresh()
    return SnapshotReport(
        version, ev.rows, ann.rows, (ev.path or "", ann.path or ""), stamp.isoformat()
    )


def describe_snapshots(layout: DataLayout) -> list[dict]:
    """Per version: rows and relative path of each family's file."""
    import pyarrow.parquet as pq

    out: dict[int, dict] = {}
    for family in SNAPSHOT_FAMILIES:
        for path in sorted(layout.family_dir(family).glob("*.parquet")):
            m = _VERSION_FILE.search(path.name)
            if not m:
                continue
            entry = out.setdefault(int(m.group(1)), {"version": int(m.group(1)), "families": {}})
            entry["families"][family] = {
                "rows": int(pq.read_metadata(path).num_rows),
                "path": str(path.relative_to(layout.root)),
            }
    return [out[v] for v in sorted(out)]
