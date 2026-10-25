"""Claim validation (COPILOT §4): citations must exist and be active, numbers must match, labels never upgrade."""

import pytest

from app.data.paths import DataLayout
from app.evidence.evidence_items import ensure_evidence_item, mark_evidence_status
from app.scouting.claims import (
    Claim,
    NumericRef,
    decimals_for_trait,
    is_unsupported_request,
    validate_claims,
)
from app.state.connection import open_state_db

P = 9_000_001
SCOPE = {"season": "2024-25", "season_type": "Regular Season"}


@pytest.fixture
def state(tmp_path):
    db = open_state_db(DataLayout(tmp_path, "demo"))
    yield db
    db.close()


def _ev(db, ref, cls="reference", review="unreviewed", kind="external_reference"):
    return ensure_evidence_item(
        db,
        kind=kind,
        ref_table="t",
        ref_id=ref,
        evidence_class=cls,
        summary="s",
        player_ids=[P],
        game_id=None,
        season="2024-25",
        season_type="Regular Season",
        review_status=review,
    )["evidence_id"]


NUMBERS = {
    ("ts_pct", P, "2024-25", "Regular Season"): 0.5823,
    ("pts_per36", P, "2024-25", "Regular Season"): 26.51,
}


def test_valid_statistical_claim_passes():
    claim = Claim(
        text="TS% .582",
        claim_type="statistical",
        player_ids=[P],
        time_scope=SCOPE,
        evidence_ids=[],
        numeric_refs=[NumericRef(trait_key="ts_pct", player_id=P, value=0.582)],
    )
    out = validate_claims(None, [claim], NUMBERS)[0]
    assert out.validation_status == "valid" and out.claim_type == "statistical" and out.notes == []


def test_number_off_by_more_than_rounding_is_downgraded():
    claim = Claim(
        text="TS% .59",
        claim_type="statistical",
        player_ids=[P],
        time_scope=SCOPE,
        numeric_refs=[NumericRef(trait_key="ts_pct", player_id=P, value=0.59)],
    )
    out = validate_claims(None, [claim], NUMBERS)[0]
    assert out.validation_status == "dropped"  # no other support
    assert any("0.5823" in n for n in out.notes)
    with_evidence = Claim(
        text="x",
        claim_type="statistical",
        player_ids=[P],
        time_scope=SCOPE,
        evidence_ids=["01HZZZZZZZZZZZZZZZZZZZZZZZ"],
        numeric_refs=[NumericRef(trait_key="ts_pct", player_id=P, value=0.59)],
    )
    assert (
        validate_claims(None, [with_evidence], NUMBERS)[0].validation_status == "dropped"
    )  # unknown evidence + wrong number


def test_rounding_tolerance_follows_the_trait_units():
    assert (
        decimals_for_trait("ts_pct") == 3
        and decimals_for_trait("pts_per36") == 1
        and decimals_for_trait("ast_to") == 2
    )
    ok = Claim(
        text="26.5 per 36",
        claim_type="statistical",
        player_ids=[P],
        time_scope=SCOPE,
        numeric_refs=[NumericRef(trait_key="pts_per36", player_id=P, value=26.5)],
    )
    assert validate_claims(None, [ok], NUMBERS)[0].validation_status == "valid"


def test_unknown_number_reference_is_downgraded():
    claim = Claim(
        text="x",
        claim_type="statistical",
        player_ids=[P],
        time_scope=SCOPE,
        numeric_refs=[NumericRef(trait_key="usg_pct", player_id=P, value=0.3)],
    )
    out = validate_claims(None, [claim], NUMBERS)[0]
    assert out.validation_status == "dropped" and any(
        "not among the tool results" in n for n in out.notes
    )


def test_evidence_must_exist_and_be_active(state):
    live = _ev(state, "live")
    gone = _ev(state, "gone")
    stale = _ev(state, "stale")
    mark_evidence_status(state, gone, "deleted")
    mark_evidence_status(state, stale, "stale")
    claims = [
        Claim(
            text="a",
            claim_type="interpretation",
            player_ids=[P],
            time_scope=SCOPE,
            evidence_ids=[live],
        ),
        Claim(
            text="b",
            claim_type="interpretation",
            player_ids=[P],
            time_scope=SCOPE,
            evidence_ids=[gone],
        ),
        Claim(
            text="c",
            claim_type="interpretation",
            player_ids=[P],
            time_scope=SCOPE,
            evidence_ids=[stale],
        ),
        Claim(
            text="d",
            claim_type="interpretation",
            player_ids=[P],
            time_scope=SCOPE,
            evidence_ids=["01HZZZZZZZZZZZZZZZZZZZZZZZ"],
        ),
    ]
    a, b, c, d = validate_claims(state, claims, {})
    assert a.validation_status == "valid"
    assert b.validation_status == "dropped" and b.evidence_ids == []
    assert (
        c.validation_status == "valid"
        and any("stale" in n for n in c.notes)
        and c.evidence_ids == [stale]
    )
    assert d.validation_status == "dropped"


def test_reviewed_observation_requires_reviewed_observation_evidence(state):
    ref = _ev(state, "ref")  # a clip reference, unreviewed
    obs = _ev(state, "obs", cls="reviewed_observation", review="reviewed_ok", kind="annotation")
    unreviewed_obs = _ev(
        state, "obs2", cls="reviewed_observation", review="unreviewed", kind="annotation"
    )
    c1 = Claim(
        text="closes out hard",
        claim_type="reviewed_observation",
        player_ids=[P],
        time_scope=SCOPE,
        evidence_ids=[ref],
    )
    c2 = Claim(
        text="closes out hard",
        claim_type="reviewed_observation",
        player_ids=[P],
        time_scope=SCOPE,
        evidence_ids=[obs],
    )
    c3 = Claim(
        text="closes out hard",
        claim_type="reviewed_observation",
        player_ids=[P],
        time_scope=SCOPE,
        evidence_ids=[unreviewed_obs],
    )
    r1, r2, r3 = validate_claims(state, [c1, c2, c3], {})
    assert r1.claim_type == "interpretation" and r1.validation_status == "downgraded"
    assert r2.claim_type == "reviewed_observation" and r2.validation_status == "valid"
    assert r3.claim_type == "interpretation" and r3.validation_status == "downgraded"


def test_model_estimates_are_downgraded_until_a_validated_feature_exists():
    claim = Claim(
        text="defender distance 4.1 ft",
        claim_type="model_estimate",
        player_ids=[P],
        time_scope=SCOPE,
    )
    out = validate_claims(None, [claim], {})[0]
    assert (
        out.claim_type == "interpretation"
        and out.validation_status == "downgraded"
        and any("experimental" in n for n in out.notes)
    )


def test_bare_text_becomes_interpretation():
    out = validate_claims(
        None,
        [Claim(text="looks confident", claim_type="statistical", player_ids=[P], time_scope=SCOPE)],
        {},
    )[0]
    assert out.claim_type == "interpretation" and out.validation_status == "downgraded"


def test_limitations_pass_through():
    out = validate_claims(
        None,
        [Claim(text="no contract data", claim_type="limitation", player_ids=[], time_scope={})],
        {},
    )[0]
    assert out.validation_status == "valid" and out.claim_type == "limitation"


@pytest.mark.parametrize(
    "text,expected",
    [
        ("Can we afford him under the tax apron?", True),
        ("Is he available via trade this summer?", True),
        ("How many wins would he add?", True),
        ("Who are the best low-usage shooters?", False),
    ],
)
def test_unsupported_request_classifier(text, expected):
    assert is_unsupported_request(text) is expected
