import pytest
from fastapi.testclient import TestClient

from app.data.paths import DataLayout
from app.demo.config import DemoConfig
from app.demo.generate import generate_demo

SMALL = DemoConfig(
    seed=7,
    seasons=("2023-24", "2024-25"),
    detail_seasons=("2024-25",),
    n_teams=4,
    roster_size=9,
    games_per_team=10,
    trade_rate=0.25,
)


@pytest.fixture(scope="session")
def demo_root(tmp_path_factory):
    root = tmp_path_factory.mktemp("demo-data")
    generate_demo(DataLayout(root=root, namespace="demo"), SMALL)
    return root


@pytest.fixture(scope="session")
def demo_layout(demo_root) -> DataLayout:
    return DataLayout(root=demo_root, namespace="demo")


@pytest.fixture(scope="session")
def client(demo_root) -> TestClient:
    from app.config import Settings
    from app.main import create_app

    settings = Settings(nba_data_dir=demo_root, nba_namespace="auto", max_shot_rows=500)
    app = create_app(settings=settings)
    with TestClient(app) as c:
        yield c
