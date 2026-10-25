"""Segments: bounded to the asset, classified, reviewable, listed in media order."""

import io

import pytest

from app.data.paths import DataLayout
from app.evidence.registry import register_managed_asset, update_asset_fields
from app.evidence.segments import (
    SegmentError,
    create_segment,
    get_segment,
    list_segments,
    update_segment,
)
from app.evidence.storage import MediaStore
from app.state.connection import open_state_db


@pytest.fixture
def db_asset(tmp_path):
    layout = DataLayout(tmp_path, "nba")
    store = MediaStore(layout)
    db = open_state_db(layout)
    res = store.write_atomic("incoming/a.mp4", io.BytesIO(b"x"))
    key = store.promote_original(res.path, res.sha256, "mp4")
    asset = register_managed_asset(
        db,
        sha256=res.sha256,
        storage_key=key,
        original_filename="a.mp4",
        byte_size=1,
        container="mp4",
    )
    update_asset_fields(db, asset["asset_id"], duration_ms=10_000)
    yield db, asset["asset_id"]
    db.close()


def test_create_validates_bounds_and_classification(db_asset):
    db, aid = db_asset
    seg = create_segment(
        db,
        asset_id=aid,
        media_start_ms=1_000,
        media_end_ms=4_000,
        classification="unknown",
        origin="manual",
        view="broadcast",
    )
    assert (
        len(seg["segment_id"]) == 26
        and seg["review_status"] == "unreviewed"
        and seg["view"] == "broadcast"
    )
    with pytest.raises(SegmentError):
        create_segment(
            db,
            asset_id=aid,
            media_start_ms=4_000,
            media_end_ms=4_000,
            classification="live",
            origin="manual",
        )
    with pytest.raises(SegmentError, match="duration"):
        create_segment(
            db,
            asset_id=aid,
            media_start_ms=9_000,
            media_end_ms=12_000,
            classification="live",
            origin="manual",
        )
    with pytest.raises(SegmentError, match="classification"):
        create_segment(
            db,
            asset_id=aid,
            media_start_ms=0,
            media_end_ms=10,
            classification="highlight",
            origin="manual",
        )
    with pytest.raises(KeyError):
        create_segment(
            db,
            asset_id="01HZZZZZZZZZZZZZZZZZZZZZZZ",
            media_start_ms=0,
            media_end_ms=10,
            classification="live",
            origin="manual",
        )


def test_update_and_listing(db_asset):
    db, aid = db_asset
    b = create_segment(
        db,
        asset_id=aid,
        media_start_ms=5_000,
        media_end_ms=9_000,
        classification="unknown",
        origin="shot_boundary_model",
        model_version="ffmpeg-scene@0.4",
    )
    a = create_segment(
        db,
        asset_id=aid,
        media_start_ms=0,
        media_end_ms=5_000,
        classification="unknown",
        origin="shot_boundary_model",
        model_version="ffmpeg-scene@0.4",
    )
    assert [s["segment_id"] for s in list_segments(db, aid)] == [a["segment_id"], b["segment_id"]]
    updated = update_segment(
        db,
        b["segment_id"],
        classification="replay",
        notes="slow-mo of the dunk",
        review_status="reviewed_corrected",
        reviewer="aaron",
    )
    assert (
        updated["classification"] == "replay"
        and updated["review_status"] == "reviewed_corrected"
        and updated["reviewed_by"] == "aaron"
    )
    assert get_segment(db, b["segment_id"])["notes"] == "slow-mo of the dunk"
    with pytest.raises(SegmentError):
        update_segment(db, b["segment_id"], classification="bogus")
    assert get_segment(db, "01HZZZZZZZZZZZZZZZZZZZZZZZ") is None
