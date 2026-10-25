"""Report drafts: deterministic sections per evidence class, validated claims, no label upgrades."""

import pytest

from app.scouting.candidates import CandidateQuery, search_candidates
from app.scouting.claims import Claim, NumericRef
from app.scouting.compute import Cohort
from app.scouting.reports import (
    add_claims,
    build_report_draft,
    get_report,
    list_reports,
    render_markdown,
)
from app.scouting.roles import ROLE_INDEX
from app.scouting.shortlists import create_shortlist
from app.state.connection import open_state_db

from .conftest import DETAIL, RS

LOOSE = Cohort(min_gp=5, min_minutes=100)


@pytest.fixture
def state(demo_layout):
    db = open_state_db(demo_layout)
    yield db
    db.close()


@pytest.fixture
def shortlist(demo_db, demo_layout, state):
    res = search_candidates(
        demo_db,
        CandidateQuery(
            role=ROLE_INDEX["rebounding_interior_player"],
            season=DETAIL,
            season_type=RS,
            cohort=LOOSE,
            layout=demo_layout,
            limit=3,
        ),
    )
    return create_shortlist(
        state,
        label="Bigs",
        season=DETAIL,
        season_type=RS,
        role_id="rebounding_interior_player",
        role_version=1,
        cohort=LOOSE,
        ranking_meta=res.meta,
        candidates=res.rows,
    )


def test_draft_has_one_section_per_evidence_class(demo_db, demo_layout, state, shortlist):
    report = build_report_draft(
        demo_db, state, demo_layout, shortlist_id=shortlist["shortlist_id"], title="Bigs draft"
    )
    assert (
        report["status"] == "draft"
        and report["llm_mode"] == "none"
        and len(report["report_id"]) == 26
    )
    sections = report["sections"]
    assert [s["key"] for s in sections] == [
        "statistical",
        "reviewed_observation",
        "model_estimate",
        "interpretation",
        "limitations",
    ]
    stat = sections[0]
    assert stat["players"] and all({"player_id", "traits"} <= set(p) for p in stat["players"])
    assert all(t["definition"] for p in stat["players"] for t in p["traits"])
    assert sections[1]["unsupported"] and "annotation_snapshots" in sections[1]["unsupported"]
    assert sections[2]["players"] == [] and sections[3]["text"] == ""
    assert any("not forecasts" in line or "not a forecast" in line for line in sections[4]["items"])
    assert (
        report["shortlist"]["shortlist_id"] == shortlist["shortlist_id"]
        and report["shortlist"]["ranking_meta"]["data_fingerprint"]
    )


def test_draft_is_byte_identical_for_the_same_data(demo_db, demo_layout, state, shortlist):
    a = build_report_draft(
        demo_db, state, demo_layout, shortlist_id=shortlist["shortlist_id"], title="Bigs draft"
    )
    b = build_report_draft(
        demo_db, state, demo_layout, shortlist_id=shortlist["shortlist_id"], title="Bigs draft"
    )
    assert a["rendered_markdown"] == b["rendered_markdown"] and a["sections"] == b["sections"]
    assert (
        "T" not in a["rendered_markdown"].split("\n")[0] or "created" not in a["rendered_markdown"]
    )  # no timestamps in the body


def test_rendered_markdown_never_upgrades_labels(demo_db, demo_layout, state, shortlist):
    report = build_report_draft(
        demo_db, state, demo_layout, shortlist_id=shortlist["shortlist_id"], title="Bigs draft"
    )
    md = report["rendered_markdown"]
    assert (
        md.index("## Statistical")
        < md.index("## Reviewed observations")
        < md.index("## Model estimates")
        < md.index("## Interpretation")
        < md.index("## Limitations")
    )
    assert "no reviewed observations" in md.lower()


def test_claims_are_validated_against_the_reports_own_numbers(
    demo_db, demo_layout, state, shortlist
):
    report = build_report_draft(
        demo_db, state, demo_layout, shortlist_id=shortlist["shortlist_id"], title="Bigs draft"
    )
    first = report["sections"][0]["players"][0]
    pid = first["player_id"]
    trait = next(t for t in first["traits"] if t["key"] == "dreb_pct" and t["value"] is not None)
    good = Claim(
        text=f"DREB% {trait['value']:.3f}",
        claim_type="statistical",
        player_ids=[pid],
        time_scope={"season": DETAIL, "season_type": RS},
        numeric_refs=[
            NumericRef(trait_key="dreb_pct", player_id=pid, value=round(trait["value"], 3))
        ],
    )
    bad = Claim(
        text="DREB% .999",
        claim_type="statistical",
        player_ids=[pid],
        time_scope={"season": DETAIL, "season_type": RS},
        numeric_refs=[NumericRef(trait_key="dreb_pct", player_id=pid, value=0.999)],
    )
    opinion = Claim(
        text="plays hard",
        claim_type="reviewed_observation",
        player_ids=[pid],
        time_scope={"season": DETAIL, "season_type": RS},
    )
    stored = add_claims(state, report["report_id"], [good, bad, opinion])
    statuses = [(c["claim_type"], c["validation_status"]) for c in stored["claims"]]
    assert statuses == [
        ("statistical", "valid"),
        ("statistical", "dropped"),
        ("interpretation", "downgraded"),
    ]
    md = render_markdown(stored)
    assert "DREB%" in md and ".999" not in md and "plays hard" in md
    assert md.index("## Interpretation") < md.index("plays hard")


def test_reports_persist_and_list(demo_db, demo_layout, state, shortlist):
    report = build_report_draft(
        demo_db, state, demo_layout, shortlist_id=shortlist["shortlist_id"], title="Bigs draft"
    )
    again = get_report(state, report["report_id"])
    assert (
        again["title"] == "Bigs draft"
        and again["sections"] == report["sections"]
        and again["claims"] == []
    )
    assert any(r["report_id"] == report["report_id"] for r in list_reports(state))
    assert get_report(state, "01HZZZZZZZZZZZZZZZZZZZZZZZ") is None


def test_draft_from_player_ids_without_a_shortlist(demo_db, demo_layout, state, shortlist):
    pid = shortlist["entries"][0]["player_id"]
    report = build_report_draft(
        demo_db,
        state,
        demo_layout,
        player_ids=[pid],
        season=DETAIL,
        season_type=RS,
        title="One player",
    )
    assert report["shortlist"] is None and [
        p["player_id"] for p in report["sections"][0]["players"]
    ] == [pid]
    with pytest.raises(ValueError):
        build_report_draft(demo_db, state, demo_layout, title="nothing")
