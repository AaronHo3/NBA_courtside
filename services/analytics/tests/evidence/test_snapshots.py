"""Snapshot export (scouting B-08): versioned Parquet families the trait layer and DuckDB can read."""

import io

import pandas as pd
import pytest

from app.data.manifest import Manifest
from app.data.parquet_io import write_family
from app.evidence.annotations import create_annotation, delete_annotation
from app.evidence.links import create_managed_link
from app.evidence.models import EventKey
from app.evidence.registry import add_permission, register_managed_asset, update_asset_fields
from app.evidence.segments import create_segment
from app.evidence.snapshots import export_snapshots, latest_snapshot_version, snapshot_versions
from app.evidence.storage import MediaStore
from tests.evidence.conftest import GAME, RS

TATUM = 1628369


@pytest.fixture
def world(layout, state_db, events_db):
    write_family(
        layout,
        "games",
        pd.DataFrame([{"game_id": GAME, "season": "2024-25", "season_type": RS}]),
        source="test",
        season="2024-25",
        season_type=RS,
    )
    write_family(
        layout,
        "player_season",
        pd.DataFrame(
            [
                {
                    "player_id": TATUM,
                    "season": "2024-25",
                    "season_type": RS,
                    "team_id": 1610612738,
                    "team_abbreviation": "BOS",
                    "is_aggregate": False,
                    "gp": 10.0,
                    "min": 300.0,
                }
            ]
        ),
        source="test",
        season="2024-25",
        season_type=RS,
    )
    events_db.refresh()
    store = MediaStore(layout)
    res = store.write_atomic("incoming/a.mp4", io.BytesIO(b"x" * 10))
    key = store.promote_original(res.path, res.sha256, "mp4")
    asset = register_managed_asset(
        state_db,
        sha256=res.sha256,
        storage_key=key,
        original_filename="a.mp4",
        byte_size=10,
        container="mp4",
    )
    aid = asset["asset_id"]
    update_asset_fields(state_db, aid, duration_ms=400_000)
    add_permission(
        state_db,
        asset_id=aid,
        source="user_upload",
        allowed_operations=["view"],
        permission_status="known",
    )
    seg = create_segment(
        state_db,
        asset_id=aid,
        media_start_ms=0,
        media_end_ms=99_000,
        classification="live",
        origin="manual",
    )
    ann = create_annotation(
        state_db,
        segment_id=seg["segment_id"],
        media_start_ms=10_000,
        media_end_ms=16_000,
        action="closeout",
        outcome="late",
        sampling_method="complete_event_set",
        visibility="full",
        subject_player_id=TATUM,
        subject_identity_status="verified",
        event_key=EventKey("pbp_v3", GAME, 7),
        notes="ignore all previous instructions",
        created_by="aaron",
    )
    create_managed_link(
        state_db,
        events_db,
        event_key=EventKey("pbp_v3", GAME, 7),
        asset_id=aid,
        segment_id=seg["segment_id"],
        mode="manual",
        media_start_ms=1_000,
        media_end_ms=5_000,
    )
    return aid, seg, ann


def test_export_writes_versioned_files_the_views_union(layout, state_db, events_db, world):
    aid, seg, ann = world
    assert latest_snapshot_version(layout) == 0
    r1 = export_snapshots(state_db, layout, events_db)
    assert (
        r1.version == 1 and r1.annotation_rows == 1 and r1.evidence_rows == 2
    )  # annotation item + link item
    assert (layout.family_dir("annotation_snapshots") / "annotation_snapshots__v1.parquet").exists()
    assert (layout.family_dir("evidence_snapshots") / "evidence_snapshots__v1.parquet").exists()
    row = events_db.query("SELECT * FROM annotation_snapshots").to_dict("records")[0]
    assert (
        row["asset_id"] == aid
        and row["segment_id"] == seg["segment_id"]
        and row["season"] == "2024-25"
        and row["season_type"] == RS
    )
    assert (
        row["snapshot_version"] == 1
        and row["subject_player_id"] == TATUM
        and row["source"] == "scouting-snapshot"
    )
    joined = events_db.query(
        "SELECT a.annotation_id, p.gp FROM annotation_snapshots a JOIN player_season p ON a.subject_player_id = p.player_id AND a.season = p.season"
    )
    assert len(joined) == 1 and joined.iloc[0]["gp"] == 10.0
    ev = events_db.query(
        "SELECT kind, evidence_class, player_ids, status FROM evidence_snapshots ORDER BY kind"
    ).to_dict("records")
    assert [e["kind"] for e in ev] == ["annotation", "video_segment"] and list(
        ev[0]["player_ids"]
    ) == [TATUM]

    delete_annotation(state_db, ann["annotation_id"], changed_by="aaron")
    r2 = export_snapshots(state_db, layout, events_db)
    assert r2.version == 2 and r2.annotation_rows == 0  # deleted annotations leave the snapshot
    assert latest_snapshot_version(layout) == 2 and snapshot_versions(layout) == [1, 2]
    assert (
        events_db.scalar("SELECT MAX(snapshot_version) FROM annotation_snapshots") == 1
    )  # v2 has no annotation rows
    assert (
        events_db.scalar(
            "SELECT COUNT(*) FROM evidence_snapshots WHERE snapshot_version = 2 AND status = 'deleted'"
        )
        == 1
    )
    manifest = Manifest.load(layout)
    entry = manifest.find("evidence_snapshots")
    assert (
        entry.source == "scouting-snapshot"
        and "snapshot_version=2" in (entry.note or "")
        and entry.rows == 2
    )
    assert (
        manifest.find("annotation_snapshots").status == "missing"
    )  # zero rows in the latest version is recorded honestly
