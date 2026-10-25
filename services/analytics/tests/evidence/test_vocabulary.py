"""Action vocabulary v1 (VIDEO_PIPELINE §8): observable actions with their outcome keys."""

import pytest

from app.evidence.vocabulary import VOCAB_VERSION, VocabularyError, catalog, validate


def test_version_and_catalog_shape():
    assert VOCAB_VERSION == 1
    entries = catalog()
    keys = {e["action"] for e in entries}
    assert {"catch_and_shoot_3", "drive", "closeout", "unknown", "not_observable"} <= keys
    drive = next(e for e in entries if e["action"] == "drive")
    assert "finish_made" in drive["outcomes"] and drive["definition"]


def test_validate_accepts_known_pairs_and_rejects_the_rest():
    validate("closeout", "late")
    validate("unknown", None)
    validate("drive", None)  # outcome is optional
    with pytest.raises(VocabularyError, match="action"):
        validate("dunk_contest", None)
    with pytest.raises(VocabularyError, match="outcome"):
        validate("closeout", "finish_made")
    with pytest.raises(VocabularyError, match="outcome"):
        validate("unknown", "made")  # unknown / not_observable carry no outcome
