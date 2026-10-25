"""Content-addressed media store (DEC-04): managed keys only, atomic writes, nothing outside media/.

Layout under ``data/<namespace>/media/``:
  originals/<sha256[:2]>/<sha256>.<ext>      immutable uploads
  derived/<asset_id>/<processing_version>/…  playback files, thumbnails, tracks
  incoming/<name>                            upload spool, promoted or deleted
Database rows store keys relative to the media root; a key supplied by anything outside this module
is validated before it touches the filesystem.
"""

from __future__ import annotations

import hashlib
import os
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import BinaryIO

from app.data.paths import DataLayout

MANAGED_PREFIXES = ("originals", "derived", "incoming")
CHUNK = 1024 * 1024
_SAFE_SEGMENT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$")


class StorageKeyError(ValueError):
    """A key that is absolute, escapes the media root, or is outside the managed prefixes."""


@dataclass(frozen=True)
class WriteResult:
    key: str
    path: Path
    sha256: str
    byte_size: int


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(CHUNK), b""):
            h.update(chunk)
    return h.hexdigest()


class MediaStore:
    def __init__(self, layout: DataLayout) -> None:
        self.layout = layout
        self.root = layout.media_dir

    # --- keys -----------------------------------------------------------------------------------

    @staticmethod
    def originals_key(sha256: str, ext: str) -> str:
        ext = ext.lower().lstrip(".")
        return f"originals/{sha256[:2]}/{sha256}.{ext}"

    @staticmethod
    def derived_key(asset_id: str, processing_version: int, name: str) -> str:
        return f"derived/{asset_id}/{int(processing_version)}/{name}"

    def resolve(self, key: str) -> Path:
        """Managed key -> absolute path; refuses anything that could leave the media root."""
        if not key or "\x00" in key or "\\" in key:
            raise StorageKeyError(f"invalid storage key {key!r}")
        pure = PurePosixPath(key)
        if pure.is_absolute() or any(part in ("..", ".") for part in pure.parts):
            raise StorageKeyError(f"storage key must be relative and free of '..': {key!r}")
        if pure.parts[0] not in MANAGED_PREFIXES:
            raise StorageKeyError(f"storage key must start with one of {MANAGED_PREFIXES}: {key!r}")
        if not all(_SAFE_SEGMENT.match(part) for part in pure.parts):
            raise StorageKeyError(f"storage key contains an unsafe path segment: {key!r}")
        candidate = (self.root / Path(*pure.parts)).resolve()
        root = self.root.resolve()
        if root != candidate and root not in candidate.parents:
            raise StorageKeyError(f"storage key resolves outside the media root: {key!r}")
        return candidate

    # --- writes ---------------------------------------------------------------------------------

    def write_atomic(
        self, key: str, stream: BinaryIO, *, max_bytes: int | None = None
    ) -> WriteResult:
        """Stream to a temp file next to the target, hashing as it goes, then rename into place."""
        target = self.resolve(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256()
        size = 0
        fd, tmp_name = tempfile.mkstemp(prefix=".write-", suffix=".tmp", dir=target.parent)
        tmp = Path(tmp_name)
        try:
            with os.fdopen(fd, "wb") as out:
                while True:
                    chunk = stream.read(CHUNK)
                    if not chunk:
                        break
                    size += len(chunk)
                    if max_bytes is not None and size > max_bytes:
                        raise ValueError(f"upload exceeds the limit of {max_bytes} bytes")
                    digest.update(chunk)
                    out.write(chunk)
                out.flush()
                os.fsync(out.fileno())
            tmp.replace(target)
        except BaseException:
            tmp.unlink(missing_ok=True)
            raise
        return WriteResult(key=key, path=target, sha256=digest.hexdigest(), byte_size=size)

    def promote_original(self, spooled: Path, sha256: str, ext: str) -> str:
        """Move a spooled upload to its content-addressed home; identical content keeps the first copy."""
        key = self.originals_key(sha256, ext)
        target = self.resolve(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            spooled.unlink(missing_ok=True)
        else:
            spooled.replace(target)
        return key
