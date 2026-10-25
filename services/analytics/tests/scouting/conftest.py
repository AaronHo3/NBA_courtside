import pytest

from app.data.db import Database

DETAIL = "2024-25"
RS = "Regular Season"


@pytest.fixture(scope="session")
def demo_db(demo_layout) -> Database:
    return Database(demo_layout)
