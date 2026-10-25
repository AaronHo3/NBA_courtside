"""Open the namespace's ``scouting.sqlite`` with WAL, foreign keys, migrations and a namespace guard."""

from __future__ import annotations

import sqlite3
import threading
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from app.data.paths import DataLayout
from app.state.migrate import apply_migrations, current_version

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"
BUSY_TIMEOUT_MS = 5000


class StateNamespaceError(RuntimeError):
    """The SQLite file records a different namespace than the layout that opened it."""


class StateDB:
    def __init__(self, con: sqlite3.Connection, namespace: str, path: Path) -> None:
        self._con = con
        self._lock = threading.RLock()
        self.namespace = namespace
        self.path = path
        self.closed = False
        self._depth = 0

    @property
    def schema_version(self) -> int:
        with self._lock:
            return current_version(self._con)

    def execute(self, sql: str, params: Sequence[Any] | None = None) -> sqlite3.Cursor:
        with self._lock:
            return self._con.execute(sql, tuple(params or ()))

    def query(self, sql: str, params: Sequence[Any] | None = None) -> list[dict[str, Any]]:
        with self._lock:
            cur = self._con.execute(sql, tuple(params or ()))
            return [dict(row) for row in cur.fetchall()]

    def scalar(self, sql: str, params: Sequence[Any] | None = None) -> Any:
        rows = self.query(sql, params)
        return next(iter(rows[0].values())) if rows else None

    @contextmanager
    def transaction(self) -> Iterator[None]:
        """Re-entrant: only the outermost call begins and commits; any failure rolls back the whole unit."""
        with self._lock:
            if self._depth > 0:
                self._depth += 1
                try:
                    yield
                finally:
                    self._depth -= 1
                return
            self._depth = 1
            self._con.execute("BEGIN")
            try:
                yield
            except BaseException:
                self._con.execute("ROLLBACK")
                raise
            finally:
                self._depth = 0
            self._con.execute("COMMIT")

    def close(self) -> None:
        with self._lock:
            if not self.closed:
                self._con.close()
                self.closed = True


def open_state_db(layout: DataLayout, migrations_dir: Path = MIGRATIONS_DIR) -> StateDB:
    path = layout.state_db_path
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    con.execute(f"PRAGMA busy_timeout={BUSY_TIMEOUT_MS}")
    try:
        apply_migrations(con, migrations_dir)
        _guard_namespace(con, layout.namespace, path)
    except Exception:
        con.close()
        raise
    return StateDB(con, layout.namespace, path)


def _guard_namespace(con: sqlite3.Connection, namespace: str, path: Path) -> None:
    con.execute("INSERT OR IGNORE INTO meta (key, value) VALUES ('namespace', ?)", (namespace,))
    recorded = con.execute("SELECT value FROM meta WHERE key = 'namespace'").fetchone()[0]
    if recorded != namespace:
        raise StateNamespaceError(
            f"{path} belongs to namespace {recorded!r}, refusing to open it as {namespace!r}"
        )
