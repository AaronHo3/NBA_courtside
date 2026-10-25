"""search_candidates: match-to-criteria ranking with a transparent funnel and strict eligibility."""

import pytest

from app.scouting.candidates import CandidateQuery, search_candidates
from app.scouting.compute import Cohort
from app.scouting.roles import ROLE_INDEX, FilterRule, RoleComponent, RoleTemplate

from .conftest import DETAIL, RS

LOOSE = Cohort(min_gp=5, min_minutes=100)


def _run(db, role, **kw):
    q = CandidateQuery(
        role=role, season=DETAIL, season_type=RS, cohort=kw.pop("cohort", LOOSE), **kw
    )
    return search_candidates(db, q)


def test_result_shape_and_meta(demo_db, demo_layout):
    result = _run(demo_db, ROLE_INDEX["rebounding_interior_player"], layout=demo_layout)
    assert result.rows and result.meta["template"]["role_id"] == "rebounding_interior_player"
    row = result.rows[0]
    for k in (
        "player_id",
        "full_name",
        "team_abbreviation",
        "position",
        "score",
        "eligible",
        "missing",
        "contributions",
        "traits",
        "video_coverage",
    ):
        assert k in row, k
    assert result.meta["trait_registry_version"] == 1 and result.meta["data_fingerprint"]
    assert "match to the selected criteria" in result.meta["disclaimer"].lower()
    assert result.meta["funnel"][0]["stage"] == "cohort"


def test_filters_shrink_the_population_and_the_funnel_records_each_step(demo_db):
    result = _run(demo_db, ROLE_INDEX["low_usage_perimeter_shooter"])
    counts = [s["remaining"] for s in result.meta["funnel"]]
    assert counts == sorted(counts, reverse=True) and counts[0] >= counts[-1]
    assert [s["stage"] for s in result.meta["funnel"]][1:] == ["usg_pct <= 0.2", "fg3a >= 100"]
    for row in result.rows:
        assert (
            row["traits"]["usg_pct"]["value"] is None
            or row["traits"]["usg_pct"]["value"] <= 0.2 + 1e-9
        )


def test_missing_component_makes_a_player_ineligible_without_reweighting(demo_db):
    result = _run(demo_db, ROLE_INDEX["low_usage_perimeter_shooter"])
    eligible = [r for r in result.rows if r["eligible"]]
    ineligible = [r for r in result.rows if not r["eligible"]]
    for r in eligible:
        weights = [c["weight"] for c in r["contributions"]]
        assert pytest.approx(sum(weights)) == 1.0 and len(weights) == 4
    for r in ineligible:
        assert r["score"] is None and r["missing"]
    assert all(r["eligible"] for r in result.rows[: len(eligible)])  # eligible first


def test_order_is_deterministic_with_player_id_tiebreak(demo_db):
    a = _run(demo_db, ROLE_INDEX["secondary_playmaker"])
    b = _run(demo_db, ROLE_INDEX["secondary_playmaker"])
    assert [r["player_id"] for r in a.rows] == [r["player_id"] for r in b.rows]
    scores = [
        (r["eligible"], r["score"] if r["score"] is not None else float("-inf"), -r["player_id"])
        for r in a.rows
    ]
    assert scores == sorted(scores, key=lambda t: (t[0], t[1], t[2]), reverse=True)


def test_pagination(demo_db):
    full = _run(demo_db, ROLE_INDEX["rebounding_interior_player"], limit=50)
    page = _run(demo_db, ROLE_INDEX["rebounding_interior_player"], limit=2, offset=1)
    assert [r["player_id"] for r in page.rows] == [r["player_id"] for r in full.rows[1:3]]
    assert page.meta["total"] == full.meta["total"] and page.meta["offset"] == 1


def test_defense_template_without_defense_data_leaves_everyone_ineligible(demo_db):
    q = CandidateQuery(
        role=ROLE_INDEX["perimeter_defense_research_candidate"],
        season="2023-24",
        season_type=RS,
        cohort=LOOSE,
    )
    result = search_candidates(demo_db, q)
    assert result.rows == [] or all(not r["eligible"] for r in result.rows)
    assert any("defense_dash" in n or "d_fg3_pct_diff" in n for n in result.meta["notes"])


def test_optional_video_trait_changes_labels_not_scores(demo_db, demo_layout, tmp_path):
    from app.state.connection import open_state_db

    role = ROLE_INDEX["perimeter_defense_research_candidate"]
    without = _run(demo_db, role)
    state = open_state_db(demo_layout)
    try:
        with_state = _run(demo_db, role, state_db=state)
    finally:
        state.close()
    assert [(r["player_id"], r["score"]) for r in without.rows] == [
        (r["player_id"], r["score"]) for r in with_state.rows
    ]
    assert all(r["video_coverage"] == "unknown" for r in without.rows)
    assert all(
        r["video_coverage"] in ("none", "references_only", "limited", "adequate")
        for r in with_state.rows
    )


def test_custom_template_runs_like_a_builtin(demo_db):
    custom = RoleTemplate(
        "custom",
        1,
        "Shooting bigs",
        "",
        (RoleComponent("fg3_pct", 1.0, True), RoleComponent("reb_per36", 1.0, True)),
        (FilterRule("position", "in", ("C", "F")),),
        (),
        ("user-defined",),
        False,
    )
    result = _run(demo_db, custom)
    assert result.meta["template"]["role_id"] == "custom"
    assert all("C" in str(r["position"]) or "F" in str(r["position"]) for r in result.rows)


def test_unknown_trait_in_component_is_rejected(demo_db):
    bad = RoleTemplate("bad", 1, "x", "", (RoleComponent("nope", 1.0, True),), (), (), (), False)
    with pytest.raises(KeyError):
        _run(demo_db, bad)
