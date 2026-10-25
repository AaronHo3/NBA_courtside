"""Numbered SQL migrations (``NNNN_name.sql``) applied once each, in order, transactionally."""

from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

MIGRATION_NAME = re.compile(r"^(\d{4})_[a-z0-9_]+\.sql$")
TRACKING_TABLE = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
)
"""


class MigrationError(RuntimeError):
    pass


@dataclass(frozen=True)
class Migration:
    version: int
    name: str
    path: Path

    def sql(self) -> str:
        return self.path.read_text(encoding="utf-8")


def list_migrations(directory: Path) -> list[Migration]:
    found: list[Migration] = []
    for path in sorted(directory.iterdir()):
        match = MIGRATION_NAME.match(path.name)
        if match:
            found.append(Migration(int(match.group(1)), path.stem, path))
    versions = [m.version for m in found]
    if len(set(versions)) != len(versions):
        dupes = sorted({v for v in versions if versions.count(v) > 1})
        raise MigrationError(f"duplicate migration version(s) {dupes} in {directory}")
    return found


def current_version(con: sqlite3.Connection) -> int:
    con.execute(TRACKING_TABLE)
    row = con.execute("SELECT MAX(version) FROM schema_migrations").fetchone()
    return int(row[0]) if row and row[0] is not None else 0


def apply_migrations(con: sqlite3.Connection, directory: Path) -> list[int]:
    """Apply every migration newer than the recorded version; return the versions applied."""
    applied_before = current_version(con)
    applied: list[int] = []
    for migration in list_migrations(directory):
        if migration.version <= applied_before:
            continue
        try:
            con.execute("BEGIN")
            for statement in _statements(migration.sql()):
                con.execute(statement)
            con.execute(
                "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
                (migration.version, migration.name, datetime.now(UTC).isoformat()),
            )
            con.execute("COMMIT")
        except sqlite3.Error as exc:
            con.execute("ROLLBACK")
            raise MigrationError(f"migration {migration.name} failed: {exc}") from exc
        applied.append(migration.version)
    return applied


def _statements(sql: str) -> list[str]:
    """Split on ';' outside quotes; good enough for the DDL this project writes."""
    out: list[str] = []
    buf: list[str] = []
    quote: str | None = None
    for ch in sql:
        if quote:
            if ch == quote:
                quote = None
        elif ch in ("'", '"'):
            quote = ch
        elif ch == ";":
            stmt = "".join(buf).strip()
            if stmt:
                out.append(stmt)
            buf = []
            continue
        buf.append(ch)
    tail = "".join(buf).strip()
    if tail:
        out.append(tail)
    return out
