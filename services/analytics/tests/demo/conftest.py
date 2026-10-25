import pytest

from app.data.manifest import Manifest

from ..conftest import SMALL  # noqa: F401  (re-exported for test_generate)


@pytest.fixture(scope="session")
def demo_manifest(demo_layout) -> Manifest:
    return Manifest.load(demo_layout)
