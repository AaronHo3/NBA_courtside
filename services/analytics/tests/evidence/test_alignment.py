"""Clock alignment (VIDEO_PIPELINE §6): piecewise anchors per live segment, never one global offset."""

import io

import pytest

from app.data.paths import DataLayout
from app.evidence.alignment import (
    AnchorError,
    add_anchor,
    anchors_for_asset,
    drift_allowance_ms,
    place_event,
    review_anchor,
    validate_asset,
)
from app.evidence.models import EventKey
from app.evidence.registry import (
    add_permission,
    ensure_link,
    register_managed_asset,
    set_link_timing,
)
from app.evidence.segments import create_segment
from app.evidence.storage import MediaStore
from app.state.connection import open_state_db

GAME = "0022400061"


@pytest.fixture
def world(tmp_path):
    layout = DataLayout(tmp_path, "nba")
    store = MediaStore(layout)
    db = open_state_db(layout)
    res = store.write_atomic("incoming/a.mp4", io.BytesIO(b"x" * 10))
    key = store.promote_original(res.path, res.sha256, "mp4")
    asset = register_managed_asset(
        db,
        sha256=res.sha256,
        storage_key=key,
        original_filename="a.mp4",
        byte_size=10,
        container="mp4",
    )
    add_permission(
        db,
        asset_id=asset["asset_id"],
        source="user_upload",
        allowed_operations=["view"],
        permission_status="known",
    )
    aid = asset["asset_id"]
    s1 = create_segment(
        db,
        asset_id=aid,
        media_start_ms=0,
        media_end_ms=99_000,
        classification="live",
        origin="manual",
    )
    s2 = create_segment(
        db,
        asset_id=aid,
        media_start_ms=99_000,
        media_end_ms=118_000,
        classification="replay",
        origin="manual",
    )
    s3 = create_segment(
        db,
        asset_id=aid,
        media_start_ms=118_000,
        media_end_ms=400_000,
        classification="live",
        origin="manual",
    )
    a1 = add_anchor(
        db,
        asset_id=aid,
        media_pts_ms=12_400,
        period=1,
        clock_ms=711_000,
        method="manual",
        error_ms=120,
    )
    a2 = add_anchor(
        db,
        asset_id=aid,
        media_pts_ms=98_900,
        period=1,
        clock_ms=604_000,
        method="manual",
        error_ms=120,
    )
    a3 = add_anchor(
        db,
        asset_id=aid,
        media_pts_ms=118_600,
        period=1,
        clock_ms=601_000,
        method="manual",
        error_ms=120,
    )
    yield db, aid, (s1, s2, s3), (a1, a2, a3)
    db.close()


def test_anchors_are_assigned_to_the_live_segment_containing_them(world):
    db, aid, (s1, s2, s3), (a1, a2, a3) = world
    assert (
        a1["segment_id"] == s1["segment_id"]
        and a2["segment_id"] == s1["segment_id"]
        and a3["segment_id"] == s3["segment_id"]
    )
    with pytest.raises(AnchorError, match="replay"):
        add_anchor(
            db,
            asset_id=aid,
            media_pts_ms=100_000,
            period=1,
            clock_ms=603_000,
            method="manual",
            error_ms=120,
        )
    with pytest.raises(AnchorError, match="no segment"):
        add_anchor(
            db,
            asset_id=aid,
            media_pts_ms=900_000,
            period=1,
            clock_ms=100_000,
            method="manual",
            error_ms=120,
        )
    assert [a["media_pts_ms"] for a in anchors_for_asset(db, aid)] == [12_400, 98_900, 118_600]


def test_worked_example_interpolates_only_within_one_segment(world):
    db, aid, (s1, s2, s3), _ = world
    anchors = anchors_for_asset(db, aid)
    placed = place_event(anchors, segment=s1, period=1, clock_ms=650_000)
    assert placed is not None and placed.method == "interpolated"
    assert placed.media_ms == pytest.approx(12_400 + 61_000 / 107_000 * 86_500, abs=1)
    assert placed.timing_error_ms == pytest.approx(120 + drift_allowance_ms(86_500), abs=1)
    assert len(placed.anchor_ids) == 2
    # 602,000 is after the last anchor of s1 and s3 has only one anchor: nothing extrapolates
    assert place_event(anchors, segment=s1, period=1, clock_ms=602_000) is None
    assert place_event(anchors, segment=s3, period=1, clock_ms=600_000) is None
    # wrong period never matches
    assert place_event(anchors, segment=s1, period=2, clock_ms=650_000) is None
    # an exact anchor hit is a direct placement with the anchor's own error
    hit = place_event(anchors, segment=s1, period=1, clock_ms=711_000)
    assert (
        hit is not None
        and hit.method == "anchor"
        and hit.media_ms == 12_400
        and hit.timing_error_ms == 120
    )


def test_drift_allowance_is_30ms_per_10s():
    assert (
        drift_allowance_ms(10_000) == 30
        and drift_allowance_ms(0) == 0
        and drift_allowance_ms(86_500) == pytest.approx(259.5)
    )


def test_stopped_clock_is_a_dead_zone(world):
    db, aid, (s1, _, _), _ = world
    add_anchor(
        db,
        asset_id=aid,
        media_pts_ms=50_000,
        period=1,
        clock_ms=660_000,
        method="manual",
        error_ms=100,
    )
    add_anchor(
        db,
        asset_id=aid,
        media_pts_ms=60_000,
        period=1,
        clock_ms=660_000,
        method="manual",
        error_ms=100,
    )  # clock stopped
    anchors = anchors_for_asset(db, aid)
    assert (
        place_event(anchors, segment=s1, period=1, clock_ms=660_000) is None
    )  # needs its own anchor
    assert (
        place_event(anchors, segment=s1, period=1, clock_ms=655_000) is not None
    )  # between 60s@660k and 98.9s@604k


def test_validation_report_flags_monotonicity_and_replay_rules(world):
    db, aid, (s1, s2, s3), _ = world
    ok_report = validate_asset(db, aid)
    assert ok_report["ok"] is True and {r["rule"] for r in ok_report["rules"]} >= {
        "monotonic_clock",
        "anchors_in_live_segments",
        "links_within_segments",
        "interpolated_links_have_error",
        "single_period_per_segment",
    }
    # a later media time with a *larger* clock inside s1 breaks monotonicity
    db.execute("UPDATE alignment_anchors SET clock_ms = 720000 WHERE media_pts_ms = 98900")
    broken = validate_asset(db, aid)
    assert broken["ok"] is False
    mono = next(r for r in broken["rules"] if r["rule"] == "monotonic_clock")
    assert mono["passed"] is False and s1["segment_id"] in mono["failing_segments"]
    # a link placed outside its segment and an interpolated link without an error are both reported
    link = ensure_link(
        db, event_key=EventKey("pbp_v3", GAME, 7), asset_id=aid, segment_id=s1["segment_id"]
    )
    set_link_timing(
        db,
        link["link_id"],
        media_start_ms=150_000,
        media_end_ms=151_000,
        alignment_method="interpolated",
        timing_error_ms=None,
        anchor_ids=[],
    )
    report = validate_asset(db, aid)
    assert (
        next(r for r in report["rules"] if r["rule"] == "links_within_segments")["passed"] is False
    )
    assert (
        next(r for r in report["rules"] if r["rule"] == "interpolated_links_have_error")["passed"]
        is False
    )


def test_review_marks_anchor(world):
    db, aid, _, (a1, _, _) = world
    reviewed = review_anchor(db, a1["anchor_id"], status="reviewed_ok", reviewer="aaron")
    assert (
        reviewed["review_status"] == "reviewed_ok"
        and reviewed["reviewed_by"] == "aaron"
        and reviewed["reviewed_at"]
    )
