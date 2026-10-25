"""Content-addressed media store: keys are managed, paths never escape media/, writes are atomic."""

import hashlib
import io

import pytest

from app.data.paths import DataLayout
from app.evidence.storage import MediaStore, StorageKeyError, sha256_of


@pytest.fixture
def store(tmp_path) -> MediaStore:
    return MediaStore(DataLayout(tmp_path, "nba"))


def test_layout_and_keys(store, tmp_path):
    assert store.root == tmp_path / "nba" / "media"
    assert (
        store.originals_key("abcdef0123456789" * 4, "mp4")
        == f"originals/ab/{'abcdef0123456789' * 4}.mp4"
    )
    assert store.derived_key("01ASSET", 2, "playback.mp4") == "derived/01ASSET/2/playback.mp4"
    assert (
        store.derived_key("01ASSET", 1, "thumbs/sheet.jpg") == "derived/01ASSET/1/thumbs/sheet.jpg"
    )


@pytest.mark.parametrize(
    "bad",
    [
        "../x.mp4",
        "originals/../../etc/passwd",
        "/etc/passwd",
        "originals/ab/../../x",
        "",
        "originals/ab/x\x00y",
        "C:\\x",
    ],
)
def test_unsafe_keys_are_refused(store, bad):
    with pytest.raises(StorageKeyError):
        store.resolve(bad)


def test_keys_resolve_inside_the_media_root_only(store):
    p = store.resolve("originals/ab/abc.mp4")
    assert p == store.root / "originals" / "ab" / "abc.mp4"
    with pytest.raises(StorageKeyError):
        store.resolve(
            "other/abc.mp4"
        )  # only originals/, derived/ and incoming/ are managed prefixes


def test_atomic_write_streams_hashes_and_cleans_up(store):
    payload = b"not really video" * 1000
    result = store.write_atomic("incoming/upload.bin", io.BytesIO(payload), max_bytes=1_000_000)
    assert result.path.exists() and result.byte_size == len(payload)
    assert result.sha256 == hashlib.sha256(payload).hexdigest()
    assert not list(result.path.parent.glob("*.tmp"))


def test_atomic_write_enforces_the_size_cap_and_leaves_nothing_behind(store):
    with pytest.raises(ValueError, match="exceeds"):
        store.write_atomic("incoming/big.bin", io.BytesIO(b"x" * 2048), max_bytes=1024)
    assert not store.resolve("incoming/big.bin").exists()
    assert (
        not list((store.root / "incoming").glob("*"))
        if (store.root / "incoming").exists()
        else True
    )


def test_promote_moves_incoming_to_a_content_addressed_original(store):
    payload = b"abc" * 100
    res = store.write_atomic("incoming/u.bin", io.BytesIO(payload))
    key = store.promote_original(res.path, res.sha256, "mp4")
    assert key == store.originals_key(res.sha256, "mp4")
    assert store.resolve(key).exists() and not res.path.exists()
    assert sha256_of(store.resolve(key)) == res.sha256
    # a second promotion of identical content is a no-op that keeps the existing file
    res2 = store.write_atomic("incoming/u2.bin", io.BytesIO(payload))
    assert store.promote_original(res2.path, res2.sha256, "mp4") == key and not res2.path.exists()
