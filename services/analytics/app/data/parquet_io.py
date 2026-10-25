"""Write/read a dataset family as Parquet and record it in the manifest."""

from __future__ import annotations

from datetime import UTC, datetime

import pandas as pd
import pyarrow.parquet as pq

from app.data.manifest import Manifest, ManifestEntry
from app.data.paths import DataLayout
from app.data.schemas import schema_for, to_arrow


def write_family(
    layout: DataLayout,
    family: str,
    df: pd.DataFrame,
    *,
    source: str,
    season: str | None = None,
    season_type: str | None = None,
    fetched_at: datetime | None = None,
    note: str | None = None,
    suffix: str | None = None,
) -> ManifestEntry:
    """Write ``df`` (conformed to the family schema) and upsert its manifest entry atomically."""
    path = layout.family_file(family, season=season, season_type=season_type, suffix=suffix)
    path.parent.mkdir(parents=True, exist_ok=True)
    stamp = fetched_at or datetime.now(UTC)
    stamped = df.copy()
    schema_names = schema_for(family).names
    if "source" in schema_names:
        stamped["source"] = source
    if "fetched_at" in schema_names:
        stamped["fetched_at"] = pd.Timestamp(stamp)
    table = to_arrow(stamped, family)
    tmp = path.with_suffix(".parquet.tmp")
    pq.write_table(table, tmp, compression="zstd")
    tmp.replace(path)
    entry = ManifestEntry(
        family=family,
        season=season,
        season_type=season_type,
        status="ok" if table.num_rows > 0 else "missing",
        rows=table.num_rows,
        fetched_at=stamp,
        source=source,
        path=str(path.relative_to(layout.root)),
        note=note,
    )
    Manifest.load(layout).upsert(entry).save(layout)
    return entry


def record_failure(
    layout: DataLayout,
    family: str,
    *,
    source: str,
    error: str,
    season: str | None = None,
    season_type: str | None = None,
) -> ManifestEntry:
    entry = ManifestEntry(
        family=family,
        season=season,
        season_type=season_type,
        status="failed",
        rows=0,
        fetched_at=datetime.now(UTC),
        source=source,
        error=error[:500],
    )
    Manifest.load(layout).upsert(entry).save(layout)
    return entry


def read_family(layout: DataLayout, family: str) -> pd.DataFrame:
    files = sorted(layout.family_dir(family).glob("*.parquet"))
    if not files:
        return pd.DataFrame()
    tables = [pq.read_table(f) for f in files]
    return pd.concat([t.to_pandas() for t in tables], ignore_index=True)
