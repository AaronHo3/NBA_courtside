"""Raw JSON cache: ``<raw_dir>/<family>/<sha1(endpoint + sorted params)>.json``.

Every provider call in the pipeline goes through :func:`get_or_fetch`, so re-runs are idempotent:
a cached payload is reused unless ``refresh`` is requested or the entry is older than ``max_age``.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from app.data.paths import DataLayout
from app.ingestion.providers.base import SOURCE_NBA_API, RawResponse, StatsProvider


def cache_key(endpoint: str, params: dict[str, Any]) -> str:
    canonical = json.dumps({"endpoint": endpoint, "params": params}, sort_keys=True, default=str)
    return hashlib.sha1(canonical.encode("utf-8")).hexdigest()


def cache_path(layout: DataLayout, family: str, endpoint: str, params: dict[str, Any]) -> Path:
    return layout.raw_dir / family / f"{cache_key(endpoint, params)}.json"


def _load(path: Path, family: str) -> RawResponse | None:
    try:
        doc = json.loads(path.read_text())
    except (OSError, ValueError):
        return None
    try:
        return RawResponse(
            dataset=family,
            params=doc["params"],
            payload=doc["payload"],
            fetched_at=datetime.fromisoformat(doc["fetched_at"]),
            endpoint=doc["endpoint"],
            source=doc.get("source", SOURCE_NBA_API),
            from_cache=True,
        )
    except (KeyError, TypeError, ValueError):
        return None


def _store(path: Path, response: RawResponse) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = {
        "endpoint": response.endpoint,
        "params": response.params,
        "fetched_at": response.fetched_at.isoformat(),
        "source": response.source,
        "payload": response.payload,
    }
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(doc, default=str))
    tmp.replace(path)


def _fresh(response: RawResponse, max_age: timedelta | None, now: datetime) -> bool:
    if max_age is None:
        return True
    return now - response.fetched_at <= max_age


def get_or_fetch(
    provider: StatsProvider,
    layout: DataLayout,
    family: str,
    endpoint: str,
    params: dict[str, Any],
    *,
    max_age: timedelta | None = None,
    refresh: bool = False,
) -> RawResponse:
    """Return the cached payload when present and fresh, otherwise fetch and store it."""
    path = cache_path(layout, family, endpoint, params)
    if not refresh and path.exists():
        cached = _load(path, family)
        if cached is not None and _fresh(cached, max_age, datetime.now(UTC)):
            return cached
    fetched = provider.fetch(endpoint, dict(params))
    stamped = replace(fetched, dataset=family, params=dict(params))
    _store(path, stamped)
    return stamped
