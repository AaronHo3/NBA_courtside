"""Event-video links for managed media (scouting B-06): manual or interpolated, one evidence item each."""

import io

import pytest

from app.evidence.alignment import add_anchor
from app.evidence.links import LinkError, create_managed_link, review_link
from app.evidence.models import EventKey
from app.evidence.read import evidence_for_event
from app.evidence.registry import (
    add_permission,
    register_managed_asset,
    update_asset_fields,
    upsert_external_asset,
)
from app.evidence.segments import create_segment
from app.evidence.storage import MediaStore
from tests.evidence.conftest import GAME

TATUM = 1628369
EVENT7 = EventKey("pbp_v3", GAME, 7)  # Tatum 3PT, period 1, clock 708_000 ms


@pytest.fixture
def world(layout, state_db):
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
    s1 = create_segment(
        state_db,
        asset_id=aid,
        media_start_ms=0,
        media_end_ms=99_000,
        classification="live",
        origin="manual",
    )
    s2 = create_segment(
        state_db,
        asset_id=aid,
        media_start_ms=99_000,
        media_end_ms=118_000,
        classification="replay",
        origin="manual",
    )
    a1 = add_anchor(
        state_db,
        asset_id=aid,
        media_pts_ms=12_400,
        period=1,
        clock_ms=711_000,
        method="manual",
        error_ms=120,
    )
    a2 = add_anchor(
        state_db,
        asset_id=aid,
        media_pts_ms=98_900,
        period=1,
        clock_ms=604_000,
        method="manual",
        error_ms=120,
    )
    return aid, s1, s2, (a1, a2)


def test_interpolated_link_stores_window_error_anchors_and_evidence(events_db, state_db, world):
    aid, s1, _, (a1, a2) = world
    link = create_managed_link(
        state_db,
        events_db,
        event_key=EVENT7,
        asset_id=aid,
        segment_id=s1["segment_id"],
        mode="interpolated",
    )
    assert link["created"] is True
    assert link["alignment_method"] == "interpolated"
    # 12_400 + (711_000 - 708_000) / 107_000 * 86_500 = 14_825 ms, window 4 s before / 3 s after
    assert link["media_start_ms"] == 10_825 and link["media_end_ms"] == 17_825
    assert link["timing_error_ms"] == 380  # ceil(120 + 30 ms per 10 s over an 86.5 s gap)
    assert link["supporting_anchor_ids"] == [a1["anchor_id"], a2["anchor_id"]]
    assert link["game_id"] == GAME and GAME.startswith("00")  # ids keep their leading zeros
    item = link["evidence"]
    assert item["kind"] == "video_segment" and item["ref_id"] == link["link_id"]
    assert item["player_ids"] == [TATUM] and item["game_id"] == GAME and item["season"] == "2024-25"
    assert (
        item["evidence_class"] == "reviewed_observation" and item["review_status"] == "unreviewed"
    )
    assert "Tatum" in item["summary"] and "interpolated" in item["summary"]
    # same (event, asset, segment) is one link
    again = create_managed_link(
        state_db,
        events_db,
        event_key=EVENT7,
        asset_id=aid,
        segment_id=s1["segment_id"],
        mode="interpolated",
    )
    assert again["created"] is False and again["link_id"] == link["link_id"]


def test_manual_link_in_a_replay_segment_needs_bounds_inside_it(events_db, state_db, world):
    aid, _, s2, _ = world
    with pytest.raises(LinkError, match="segment"):
        create_managed_link(
            state_db,
            events_db,
            event_key=EVENT7,
            asset_id=aid,
            segment_id=s2["segment_id"],
            mode="manual",
            media_start_ms=90_000,
            media_end_ms=105_000,
        )
    with pytest.raises(LinkError, match="media_start_ms"):
        create_managed_link(
            state_db,
            events_db,
            event_key=EVENT7,
            asset_id=aid,
            segment_id=s2["segment_id"],
            mode="manual",
        )
    link = create_managed_link(
        state_db,
        events_db,
        event_key=EVENT7,
        asset_id=aid,
        segment_id=s2["segment_id"],
        mode="manual",
        media_start_ms=100_000,
        media_end_ms=106_000,
        timing_error_ms=500,
    )
    assert link["alignment_method"] == "manual" and link["timing_error_ms"] == 500
    assert link["supporting_anchor_ids"] == []
    # a replay segment cannot host an interpolated placement
    with pytest.raises(LinkError, match="place"):
        create_managed_link(
            state_db,
            events_db,
            event_key=EVENT7,
            asset_id=aid,
            segment_id=s2["segment_id"],
            mode="interpolated",
        )


def test_refuses_unknown_events_foreign_segments_and_external_assets(events_db, state_db, world):
    aid, s1, _, _ = world
    with pytest.raises(LinkError, match="event"):
        create_managed_link(
            state_db,
            events_db,
            event_key=EventKey("pbp_v3", GAME, 999_999),
            asset_id=aid,
            segment_id=s1["segment_id"],
            mode="interpolated",
        )
    # the opening jump ball (clock 720_000) lies before the first anchor: no extrapolation
    key = EventKey("pbp_v3", GAME, 4)
    with pytest.raises(LinkError, match="place"):
        create_managed_link(
            state_db,
            events_db,
            event_key=key,
            asset_id=aid,
            segment_id=s1["segment_id"],
            mode="interpolated",
        )
    ext = upsert_external_asset(
        state_db,
        provider="nba_stats_events",
        ref_key="x",
        external_url="https://example.invalid/x",
        metadata={},
    )
    with pytest.raises(LinkError, match="managed"):
        create_managed_link(
            state_db,
            events_db,
            event_key=EVENT7,
            asset_id=ext["asset_id"],
            segment_id=s1["segment_id"],
            mode="interpolated",
        )
    with pytest.raises(LinkError, match="segment"):
        create_managed_link(
            state_db,
            events_db,
            event_key=EVENT7,
            asset_id=aid,
            segment_id="01HZZZZZZZZZZZZZZZZZZZZZZZ",
            mode="interpolated",
        )


def test_evidence_for_event_groups_views_and_review_propagates(events_db, state_db, world):
    aid, s1, s2, _ = world
    first = create_managed_link(
        state_db,
        events_db,
        event_key=EVENT7,
        asset_id=aid,
        segment_id=s1["segment_id"],
        mode="interpolated",
    )
    create_managed_link(
        state_db,
        events_db,
        event_key=EVENT7,
        asset_id=aid,
        segment_id=s2["segment_id"],
        mode="manual",
        media_start_ms=100_000,
        media_end_ms=106_000,
    )
    items = evidence_for_event(state_db, EVENT7)
    assert len(items) == 2 and {i["kind"] for i in items} == {"video_segment"}
    assert {i["segment"]["classification"] for i in items} == {"live", "replay"}
    assert all(i["link"]["media_start_ms"] is not None for i in items)

    reviewed = review_link(
        state_db, first["link_id"], review_status="reviewed_ok", reviewer="aaron"
    )
    assert reviewed["review_status"] == "reviewed_ok" and reviewed["reviewed_by"] == "aaron"
    assert reviewed["evidence"]["review_status"] == "reviewed_ok"
    with pytest.raises(LinkError, match="review_status"):
        review_link(state_db, first["link_id"], review_status="bogus", reviewer=None)
