"""Range-capable playback over managed derivatives; permission-gated; 416 on bad ranges."""

import io

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.data.paths import DataLayout
from app.evidence.playback import RangeError, parse_range
from app.evidence.registry import add_derivative, add_permission, register_managed_asset
from app.evidence.storage import MediaStore
from app.main import create_app
from app.state.connection import open_state_db

BODY = bytes(range(256)) * 40  # 10,240 bytes with a recognisable pattern


@pytest.mark.parametrize(
    "header,expected",
    [
        ("bytes=0-99", (0, 99)),
        ("bytes=100-", (100, 10239)),
        ("bytes=-100", (10140, 10239)),
        ("bytes=0-99999", (0, 10239)),
    ],
)
def test_parse_range(header, expected):
    assert parse_range(header, 10240) == expected


@pytest.mark.parametrize(
    "header", ["bytes=200-100", "bytes=abc", "items=0-1", "bytes=20000-", "bytes=-0"]
)
def test_bad_ranges_raise(header):
    with pytest.raises(RangeError):
        parse_range(header, 10240)


def test_no_header_means_whole_file():
    assert parse_range(None, 10240) is None


@pytest.fixture(scope="module")
def setup(tmp_path_factory):
    root = tmp_path_factory.mktemp("pb")
    layout = DataLayout(root, "nba")
    store = MediaStore(layout)
    state = open_state_db(layout)
    try:
        orig = store.write_atomic("incoming/o.mp4", io.BytesIO(b"orig"))
        key = store.promote_original(orig.path, orig.sha256, "mp4")
        ready = register_managed_asset(
            state,
            sha256=orig.sha256,
            storage_key=key,
            original_filename="o.mp4",
            byte_size=4,
            container="mp4",
        )
        add_permission(
            state,
            asset_id=ready["asset_id"],
            source="user_upload",
            allowed_operations=["view", "playback_derivative"],
            permission_status="known",
        )
        der = store.write_atomic(
            store.derived_key(ready["asset_id"], 1, "playback.mp4"), io.BytesIO(BODY)
        )
        add_derivative(
            state,
            asset_id=ready["asset_id"],
            kind="playback_mp4",
            storage_key=der.key,
            processing_version=1,
            params={"codec": "test"},
            byte_size=der.byte_size,
            width=160,
            height=120,
            duration_ms=1000,
            sha256=der.sha256,
            job_id=None,
        )
        orig2 = store.write_atomic("incoming/p.mp4", io.BytesIO(b"orig2"))
        key2 = store.promote_original(orig2.path, orig2.sha256, "mp4")
        no_perm = register_managed_asset(
            state,
            sha256=orig2.sha256,
            storage_key=key2,
            original_filename="p.mp4",
            byte_size=5,
            container="mp4",
        )
        add_permission(
            state,
            asset_id=no_perm["asset_id"],
            source="unknown",
            allowed_operations=[],
            permission_status="unknown",
        )
        der2 = store.write_atomic(
            store.derived_key(no_perm["asset_id"], 1, "playback.mp4"), io.BytesIO(BODY)
        )
        add_derivative(
            state,
            asset_id=no_perm["asset_id"],
            kind="playback_mp4",
            storage_key=der2.key,
            processing_version=1,
            params={},
            byte_size=der2.byte_size,
            width=None,
            height=None,
            duration_ms=None,
            sha256=der2.sha256,
            job_id=None,
        )
        orig3 = store.write_atomic("incoming/q.mp4", io.BytesIO(b"orig3"))
        key3 = store.promote_original(orig3.path, orig3.sha256, "mp4")
        not_ready = register_managed_asset(
            state,
            sha256=orig3.sha256,
            storage_key=key3,
            original_filename="q.mp4",
            byte_size=5,
            container="mp4",
        )
        add_permission(
            state,
            asset_id=not_ready["asset_id"],
            source="user_upload",
            allowed_operations=["view", "playback_derivative"],
            permission_status="known",
        )
    finally:
        state.close()
    app = create_app(settings=Settings(nba_data_dir=root, nba_namespace="nba"))
    with TestClient(app) as c:
        yield c, ready["asset_id"], no_perm["asset_id"], not_ready["asset_id"]


def test_full_and_partial_playback(setup):
    c, ready, _, _ = setup
    full = c.get(f"/api/media/{ready}/playback")
    assert (
        full.status_code == 200
        and full.headers["accept-ranges"] == "bytes"
        and full.content == BODY
    )
    assert full.headers["content-type"].startswith("video/mp4")
    part = c.get(f"/api/media/{ready}/playback", headers={"Range": "bytes=256-511"})
    assert part.status_code == 206 and part.content == BODY[256:512]
    assert (
        part.headers["content-range"] == f"bytes 256-511/{len(BODY)}"
        and part.headers["content-length"] == "256"
    )
    head = c.head(f"/api/media/{ready}/playback")
    assert (
        head.status_code == 200
        and head.headers["content-length"] == str(len(BODY))
        and head.content == b""
    )
    bad = c.get(f"/api/media/{ready}/playback", headers={"Range": "bytes=99999-"})
    assert bad.status_code == 416 and bad.headers["content-range"] == f"bytes */{len(BODY)}"


def test_playback_is_refused_without_permission_and_before_a_derivative_exists(setup):
    c, _, no_perm, not_ready = setup
    assert c.get(f"/api/media/{no_perm}/playback").status_code == 403
    r = c.get(f"/api/media/{not_ready}/playback")
    assert r.status_code == 404 and "not ready" in r.json()["error"].lower()
    assert c.get("/api/media/01HZZZZZZZZZZZZZZZZZZZZZZZ/playback").status_code == 404
