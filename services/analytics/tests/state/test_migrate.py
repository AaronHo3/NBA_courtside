"""Numbered SQL migrations applied in order, once, each in its own transaction."""

import sqlite3

import pytest

from app.state.migrate import MigrationError, apply_migrations, current_version, list_migrations


@pytest.fixture
def migrations(tmp_path):
    d = tmp_path / "migrations"
    d.mkdir()
    (d / "0001_init.sql").write_text("CREATE TABLE a (id INTEGER PRIMARY KEY);")
    (d / "0002_more.sql").write_text(
        "CREATE TABLE b (id INTEGER PRIMARY KEY);\nINSERT INTO a (id) VALUES (1);"
    )
    (d / "README.md").write_text("ignored")
    return d


def test_lists_only_numbered_sql_files_in_order(migrations):
    assert [m.version for m in list_migrations(migrations)] == [1, 2]
    assert [m.name for m in list_migrations(migrations)] == ["0001_init", "0002_more"]


def test_applies_all_pending_in_order_and_records_them(migrations):
    con = sqlite3.connect(":memory:")
    assert current_version(con) == 0
    applied = apply_migrations(con, migrations)
    assert applied == [1, 2]
    assert current_version(con) == 2
    names = [r[0] for r in con.execute("SELECT name FROM schema_migrations ORDER BY version")]
    assert names == ["0001_init", "0002_more"]
    assert con.execute("SELECT COUNT(*) FROM a").fetchone()[0] == 1


def test_second_run_applies_nothing(migrations):
    con = sqlite3.connect(":memory:")
    apply_migrations(con, migrations)
    assert apply_migrations(con, migrations) == []
    assert current_version(con) == 2


def test_failing_migration_is_rolled_back_and_not_recorded(migrations):
    (migrations / "0003_bad.sql").write_text("CREATE TABLE c (id INTEGER);\nTHIS IS NOT SQL;")
    con = sqlite3.connect(":memory:")
    with pytest.raises(MigrationError, match="0003_bad"):
        apply_migrations(con, migrations)
    assert current_version(con) == 2
    tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert "c" not in tables


def test_duplicate_version_numbers_are_rejected(migrations):
    (migrations / "0002_dup.sql").write_text("SELECT 1;")
    with pytest.raises(MigrationError, match="duplicate"):
        list_migrations(migrations)
