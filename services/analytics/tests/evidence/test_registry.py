"""Media registry (SQLite): external reference assets, links, permissions, namespace guards."""

import pytest

from app.evidence.models import EventKey
from app.evidence.registry import (
    EvidenceNamespaceError,
    add_permission,
    ensure_link,
    get_asset,
    links_for_event,
    permissions_for_asset,
    upsert_external_asset,
)

GAME = "0022400061"
KEY = EventKey("pbp_v3", GAME, 7)


def test_migration_creates_media_tables(state_db):
    names = {
        r["name"] for r in state_db.query("SELECT name FROM sqlite_master WHERE type = 'table'")
    }
    assert {
        "video_assets",
        "source_permissions",
        "video_derivatives",
        "video_segments",
        "event_video_links",
        "alignment_anchors",
        "evidence_items",
    } <= names
    assert state_db.schema_version >= 2


def test_external_asset_is_created_once_per_reference_key(state_db):
    first = upsert_external_asset(
        state_db,
        provider="nba_stats_events",
        ref_key=f"nba_stats_events:{GAME}:7",
        external_url="https://www.nba.com/stats/events/?GameID=0022400061&GameEventID=7&flag=1",
    )
    second = upsert_external_asset(
        state_db,
        provider="nba_stats_events",
        ref_key=f"nba_stats_events:{GAME}:7",
        external_url="https://www.nba.com/stats/events/?GameID=0022400061&GameEventID=7&flag=1",
    )
    assert first["asset_id"] == second["asset_id"] and len(first["asset_id"]) == 26
    assert first["kind"] == "external_reference" and first["availability"] == "unverified"
    assert first["namespace"] == "nba" and first["sha256"] is None and first["storage_key"] is None
    assert state_db.scalar("SELECT COUNT(*) FROM video_assets") == 1


def test_link_is_unique_per_event_asset_and_segment(state_db):
    asset = upsert_external_asset(
        state_db, provider="p", ref_key="p:x", external_url="https://example.test/x"
    )
    a = ensure_link(state_db, event_key=KEY, asset_id=asset["asset_id"])
    b = ensure_link(state_db, event_key=KEY, asset_id=asset["asset_id"])
    assert a["link_id"] == b["link_id"]
    assert a["alignment_method"] == "none" and a["link_status"] == "unverified"
    assert (
        a["game_id"] == GAME and a["source_event_id"] == 7 and a["source_event_system"] == "pbp_v3"
    )
    assert [row["link_id"] for row in links_for_event(state_db, KEY)] == [a["link_id"]]
    other = ensure_link(state_db, event_key=EventKey("pbp_v3", GAME, 9), asset_id=asset["asset_id"])
    assert other["link_id"] != a["link_id"]


def test_permissions_default_to_view_only_for_external_references(state_db):
    asset = upsert_external_asset(
        state_db, provider="p", ref_key="p:y", external_url="https://example.test/y"
    )
    add_permission(
        state_db,
        asset_id=asset["asset_id"],
        source="external_reference",
        allowed_operations=["view"],
        permission_status="known",
    )
    perms = permissions_for_asset(state_db, asset["asset_id"])
    assert len(perms) == 1 and perms[0]["allowed_operations"] == ["view"]
    assert perms[0]["permission_status"] == "known"


def test_namespace_mismatch_is_refused(state_db):
    with pytest.raises(EvidenceNamespaceError):
        upsert_external_asset(
            state_db,
            provider="p",
            ref_key="p:z",
            external_url="https://example.test/z",
            namespace="demo",
        )
    assert get_asset(state_db, "01DOESNOTEXIST000000000000") is None


def test_count_assets_is_not_capped_by_the_listing_limit(state_db):
    from app.evidence.registry import count_assets, list_assets

    for i in range(7):
        upsert_external_asset(
            state_db, provider="p", ref_key=f"p:c{i}", external_url=f"https://example.test/c{i}"
        )
    assert len(list_assets(state_db, kind="external_reference", limit=3)) == 3
    assert count_assets(state_db, kind="external_reference", availability="unverified") == 7
    assert count_assets(state_db, kind="external_reference", availability="available") == 0
