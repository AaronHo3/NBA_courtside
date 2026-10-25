"""DuckDB over the Parquet families of one namespace.

Each family becomes a view (``read_parquet`` over the family directory, union_by_name so partial
schemas still read). Families with no files get an empty, correctly typed view so queries never
fail on absence; they just return no rows.
"""

from __future__ import annotations

import threading
from collections.abc import Sequence

import duckdb
import pandas as pd
import pyarrow as pa

from app.data.paths import DataLayout
from app.data.schemas import FAMILIES, schema_for


class Database:
    def __init__(self, layout: DataLayout) -> None:
        self.layout = layout
        self._con = duckdb.connect(database=":memory:")
        self._lock = threading.Lock()
        self.refresh()

    def refresh(self) -> None:
        """(Re)register one view per family; call after ingestion writes new files."""
        with self._lock:
            for family in FAMILIES:
                files = sorted(self.layout.family_dir(family).glob("*.parquet"))
                self._drop(family)
                if files:
                    glob = self.layout.family_glob(family).replace("'", "''")
                    self._con.execute(
                        f"CREATE VIEW \"{family}\" AS SELECT * FROM read_parquet('{glob}', union_by_name=true)"
                    )
                else:
                    empty = pa.Table.from_batches([], schema=schema_for(family))
                    self._con.register(f"__empty_{family}", empty)
                    self._con.execute(
                        f'CREATE TABLE "{family}" AS SELECT * FROM "__empty_{family}"'
                    )

    def _drop(self, family: str) -> None:
        """Drop whichever catalog object currently backs the family (view for files, table for empty)."""
        kind = self._con.execute(
            "SELECT table_type FROM information_schema.tables WHERE table_name = ? AND table_schema = 'main'",
            [family],
        ).fetchone()
        if kind is None:
            return
        if kind[0] == "VIEW":
            self._con.execute(f'DROP VIEW IF EXISTS "{family}"')
        else:
            self._con.execute(f'DROP TABLE IF EXISTS "{family}"')
        self._con.execute(f'DROP VIEW IF EXISTS "__empty_{family}"')

    def query(self, sql: str, params: Sequence[object] | None = None) -> pd.DataFrame:
        with self._lock:
            cur = self._con.cursor()
            try:
                return cur.execute(sql, list(params or [])).df()
            finally:
                cur.close()

    def scalar(self, sql: str, params: Sequence[object] | None = None):
        df = self.query(sql, params)
        return None if df.empty else df.iloc[0, 0]

    def available_families(self) -> list[str]:
        return [f for f in FAMILIES if any(self.layout.family_dir(f).glob("*.parquet"))]
