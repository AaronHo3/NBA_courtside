import pytest

from app.config import Settings
from app.data.paths import DataLayout
from app.jobs.handlers import HANDLERS, register_handler
from app.state.connection import open_state_db


@pytest.fixture
def layout(tmp_path) -> DataLayout:
    return DataLayout(tmp_path / "data", "nba")


@pytest.fixture
def state(layout):
    db = open_state_db(layout)
    yield db
    db.close()


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        nba_data_dir=tmp_path / "data",
        nba_namespace="nba",
        jobs_lease_seconds=5,
        jobs_poll_seconds=0.01,
    )


@pytest.fixture
def handlers():
    """Temporary handler registrations, removed after the test."""
    added: list[str] = []

    def add(kind, fn):
        register_handler(kind, fn)
        added.append(kind)

    yield add
    for k in added:
        HANDLERS.pop(k, None)
