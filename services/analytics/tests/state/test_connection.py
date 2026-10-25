"""Per-namespace SQLite state database: pragmas, migrations on open, namespace guard, transactions."""

import shutil

import pytest

from app.data.paths import DataLayout
from app.state.connection import StateDB, StateNamespaceError, open_state_db


@pytest.fixture
def layout(tmp_path) -> DataLayout:
    return DataLayout(root=tmp_path, namespace="nba")


def test_open_creates_file_with_wal_and_foreign_keys(layout):
    db = open_state_db(layout)
    try:
        assert layout.state_db_path.exists()
        assert layout.state_db_path == layout.namespace_dir / "scouting.sqlite"
        assert db.query("PRAGMA journal_mode")[0]["journal_mode"] == "wal"
        assert db.query("PRAGMA foreign_keys")[0]["foreign_keys"] == 1
        assert db.namespace == "nba"
    finally:
        db.close()


def test_reopen_keeps_schema_version_and_does_not_reapply(layout):
    first = open_state_db(layout)
    version = first.schema_version
    applied = first.query("SELECT COUNT(*) AS n FROM schema_migrations")[0]["n"]
    first.close()
    second = open_state_db(layout)
    try:
        assert second.schema_version == version >= 1
        assert second.query("SELECT COUNT(*) AS n FROM schema_migrations")[0]["n"] == applied
    finally:
        second.close()


def test_file_from_another_namespace_is_refused(tmp_path, layout):
    open_state_db(layout).close()
    demo = DataLayout(root=tmp_path, namespace="demo")
    demo.state_db_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(layout.state_db_path, demo.state_db_path)
    with pytest.raises(StateNamespaceError, match="nba"):
        open_state_db(demo)


def test_transaction_rolls_back_on_error(layout):
    db = open_state_db(layout)
    try:
        db.execute("CREATE TABLE t (x INTEGER PRIMARY KEY)")
        with pytest.raises(RuntimeError):
            with db.transaction():
                db.execute("INSERT INTO t (x) VALUES (1)")
                raise RuntimeError("boom")
        assert db.query("SELECT COUNT(*) AS n FROM t")[0]["n"] == 0
        with db.transaction():
            db.execute("INSERT INTO t (x) VALUES (2)")
        assert db.query("SELECT x FROM t")[0]["x"] == 2
    finally:
        db.close()


def test_query_returns_plain_dicts_with_parameters(layout):
    db: StateDB = open_state_db(layout)
    try:
        rows = db.query("SELECT ? AS a, ? AS b", [1, "two"])
        assert rows == [{"a": 1, "b": "two"}]
        assert db.scalar("SELECT 41 + 1") == 42
        assert db.scalar("SELECT 1 WHERE 0 = 1") is None
    finally:
        db.close()


def test_close_is_idempotent(layout):
    db = open_state_db(layout)
    db.close()
    db.close()


def test_transactions_nest_as_one_unit(layout):
    """Composite operations (publish -> add rows -> update status) call transaction() inside transaction()."""
    db = open_state_db(layout)
    try:
        db.execute("CREATE TABLE n (x INTEGER PRIMARY KEY)")
        with db.transaction():
            db.execute("INSERT INTO n (x) VALUES (1)")
            with db.transaction():
                db.execute("INSERT INTO n (x) VALUES (2)")
        assert db.scalar("SELECT COUNT(*) FROM n") == 2
        with pytest.raises(RuntimeError):
            with db.transaction():
                db.execute("INSERT INTO n (x) VALUES (3)")
                with db.transaction():
                    db.execute("INSERT INTO n (x) VALUES (4)")
                    raise RuntimeError("inner failure")
        assert db.scalar("SELECT COUNT(*) FROM n") == 2  # the whole outer unit rolled back
    finally:
        db.close()
