"""A short hash of the manifest entries a computation depended on, so stored results can be marked stale."""

from __future__ import annotations

import hashlib
from collections.abc import Iterable

from app.data.manifest import Manifest
from app.data.paths import DataLayout


def data_fingerprint(
    layout: DataLayout | None, season: str, season_type: str, families: Iterable[str]
) -> str:
    if layout is None:
        return "unknown"
    manifest = Manifest.load(layout)
    wanted = set(families)
    parts = sorted(
        f"{e.family}|{e.season}|{e.season_type}|{e.status}|{e.rows}|{e.fetched_at.isoformat() if e.fetched_at else ''}"
        for e in manifest.entries
        if e.family in wanted
        and (
            e.season is None
            or (e.season == season and (e.season_type or season_type) == season_type)
        )
    )
    return hashlib.sha1("\n".join(parts).encode("utf-8")).hexdigest()[:12]
