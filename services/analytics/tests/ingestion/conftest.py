import pytest

from app.data.paths import REAL_NAMESPACE, DataLayout
from app.ingestion.normalize.teams import normalize_teams
from tests.ingestion.fake_provider import FakeProvider, load_fixture

SEASON = "2024-25"
RS = "Regular Season"
BOS, NYK, LAL = 1610612738, 1610612752, 1610612747


@pytest.fixture
def provider() -> FakeProvider:
    return FakeProvider()


@pytest.fixture
def nba_layout(tmp_path) -> DataLayout:
    return DataLayout(root=tmp_path / "data", namespace=REAL_NAMESPACE)


@pytest.fixture(scope="session")
def teams_df():
    return normalize_teams()


@pytest.fixture
def fx():
    return load_fixture
