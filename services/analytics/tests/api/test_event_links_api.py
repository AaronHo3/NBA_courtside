"""Managed event-video links over the API (scouting B-06); absent in public read-only mode."""

import io

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.data.parquet_io import write_family
from app.data.paths import DataLayout
from app.events.id_map import build_event_id_map
from app.events.normalize_pbp import normalize_pbp_v3
from app.evidence.alignment import add_anchor
from app.evidence.registry import add_permission, register_managed_asset, update_asset_fields
from app.evidence.segments import create_segment
from app.evidence.storage import MediaStore
from app.main import create_app
from app.state.connection import open_state_db
from tests.ingestion.fake_provider import load_fixture

GAME = "0022400061"
RS = "Regular Season"


def _ok(resp, codes=(200, 201)):
    assert resp.status_code in codes, resp.text
    body = resp.json()
    assert body["success"] is True
    return body["data"], body["meta"]


@pytest.fixture(scope="module")
def setup(tmp_path_factory):
    root = tmp_path_factory.mktemp("links")
    layout = DataLayout(root, "nba")
    events, participants = normalize_pbp_v3(
        load_fixture(f"playbyplayv3__game_{GAME}"), game_id=GAME, season="2024-25", season_type=RS
    )
    shots = pd.DataFrame(
        [
            {
                "game_id": GAME,
                "game_event_id": 7,
                "player_id": 1628369,
                "team_id": 1610612738,
                "period": 1,
                "minutes_remaining": 11,
                "seconds_remaining": 48,
                "shot_made_flag": 1,
                "season": "2024-25",
                "season_type": RS,
            }
        ]
    )
    kw = dict(source="test", season="2024-25", season_type=RS)
    write_family(layout, "events", events, **kw)
    write_family(layout, "event_participants", participants, **kw)
    write_family(layout, "event_id_map", build_event_id_map(events, shots), **kw)
    write_family(layout, "shots", shots, **kw)
    store = MediaStore(layout)
    db = open_state_db(layout)
    try:
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
        aid = asset["asset_id"]
        update_asset_fields(db, aid, duration_ms=200_000)
        add_permission(
            db,
            asset_id=aid,
            source="user_upload",
            allowed_operations=["view"],
            permission_status="known",
        )
        seg = create_segment(
            db,
            asset_id=aid,
            media_start_ms=0,
            media_end_ms=99_000,
            classification="live",
            origin="manual",
        )
        add_anchor(
            db,
            asset_id=aid,
            media_pts_ms=12_400,
            period=1,
            clock_ms=711_000,
            method="manual",
            error_ms=120,
        )
        add_anchor(
            db,
            asset_id=aid,
            media_pts_ms=98_900,
            period=1,
            clock_ms=604_000,
            method="manual",
            error_ms=120,
        )
    finally:
        db.close()
    with TestClient(create_app(settings=Settings(nba_data_dir=root, nba_namespace="nba"))) as c:
        yield c, root, aid, seg["segment_id"]


def test_create_review_and_surface_links(setup):
    c, _, aid, sid = setup
    url = f"/api/events/pbp_v3/{GAME}/7/links"
    link, _ = _ok(
        c.post(url, json={"asset_id": aid, "segment_id": sid, "mode": "interpolated"}), codes=(201,)
    )
    assert link["alignment_method"] == "interpolated" and link["timing_error_ms"] == 380
    assert link["media_start_ms"] == 10_825 and link["evidence"]["kind"] == "video_segment"
    # idempotent: the same (event, asset, segment) comes back with 200
    again, _ = _ok(
        c.post(url, json={"asset_id": aid, "segment_id": sid, "mode": "interpolated"}), codes=(200,)
    )
    assert again["link_id"] == link["link_id"]

    detail, _ = _ok(c.get(f"/api/events/pbp_v3/{GAME}/7"))
    ours = [e for e in detail["evidence"] if e["link"]["link_id"] == link["link_id"]]
    assert len(ours) == 1 and ours[0]["segment"]["segment_id"] == sid
    shot, _ = _ok(c.get(f"/api/shots/{GAME}/7/evidence"))
    assert any(e["link"]["link_id"] == link["link_id"] for e in shot["evidence"])

    reviewed, _ = _ok(
        c.patch(
            f"/api/evidence/links/{link['link_id']}",
            json={"review_status": "reviewed_ok", "reviewer": "aaron"},
        )
    )
    assert (
        reviewed["review_status"] == "reviewed_ok"
        and reviewed["evidence"]["review_status"] == "reviewed_ok"
    )
    item, _ = _ok(c.get(f"/api/evidence/{link['evidence']['evidence_id']}"))
    assert (
        item["item"]["review_status"] == "reviewed_ok"
        and item["referent"]["link"]["link_id"] == link["link_id"]
    )


def test_validation_errors(setup):
    c, _, aid, sid = setup
    url = f"/api/events/pbp_v3/{GAME}/7/links"
    r = c.post(url, json={"asset_id": aid, "segment_id": sid, "mode": "manual"})
    assert r.status_code == 422 and "media_start_ms" in r.json()["error"]
    r = c.post(
        url,
        json={
            "asset_id": aid,
            "segment_id": sid,
            "mode": "manual",
            "media_start_ms": 5_000,
            "media_end_ms": 150_000,
        },
    )
    assert r.status_code == 422
    r = c.post(
        f"/api/events/pbp_v3/{GAME}/999999/links",
        json={"asset_id": aid, "segment_id": sid, "mode": "interpolated"},
    )
    assert r.status_code == 404
    r = c.post(
        url,
        json={"asset_id": "01HZZZZZZZZZZZZZZZZZZZZZZZ", "segment_id": sid, "mode": "interpolated"},
    )
    assert r.status_code == 404
    r = c.patch(
        "/api/evidence/links/01HZZZZZZZZZZZZZZZZZZZZZZZ", json={"review_status": "reviewed_ok"}
    )
    assert r.status_code == 404


def test_link_writes_are_absent_in_read_only_mode(setup):
    _, root, aid, sid = setup
    settings = Settings(nba_data_dir=root, nba_namespace="nba", public_read_only=True)
    with TestClient(create_app(settings=settings)) as ro:
        assert ro.post(
            f"/api/events/pbp_v3/{GAME}/7/links",
            json={"asset_id": aid, "segment_id": sid, "mode": "interpolated"},
        ).status_code in (404, 405)
        assert ro.patch(
            "/api/evidence/links/01HZZZZZZZZZZZZZZZZZZZZZZZ", json={"review_status": "reviewed_ok"}
        ).status_code in (404, 405)
        assert ro.get(f"/api/events/pbp_v3/{GAME}/7").status_code == 200
