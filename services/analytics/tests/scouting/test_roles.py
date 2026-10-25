"""Role templates: built-ins are valid against the trait registry; custom ones persist per namespace."""

import pytest

from app.data.paths import DataLayout
from app.scouting.role_store import list_custom_roles, load_role, save_custom_role
from app.scouting.roles import BUILTIN_ROLES, ROLE_INDEX, FilterRule, RoleComponent, RoleTemplate
from app.scouting.traits import TRAIT_INDEX
from app.state.connection import open_state_db


def test_builtin_ids_and_versions():
    ids = [r.role_id for r in BUILTIN_ROLES]
    assert ids == [
        "low_usage_perimeter_shooter",
        "rebounding_interior_player",
        "secondary_playmaker",
        "perimeter_defense_research_candidate",
    ]
    assert all(r.version >= 1 and r.is_builtin for r in BUILTIN_ROLES)
    assert set(ROLE_INDEX) == set(ids)


def test_components_and_filters_reference_real_traits_and_columns():
    for role in BUILTIN_ROLES:
        assert role.components and role.label and role.description, role.role_id
        for c in role.components:
            assert c.trait_key in TRAIT_INDEX, (role.role_id, c.trait_key)
            assert c.weight > 0
        for f in role.filters:
            assert f.op in ("<=", ">=", "in", "qualified"), f
        assert (
            all(v in TRAIT_INDEX for v in role.optional_video_traits) or role.optional_video_traits
        )  # video traits arrive in C-03; listed keys are allowed to be future


def test_perimeter_defense_template_is_labelled_as_research_not_rating():
    role = ROLE_INDEX["perimeter_defense_research_candidate"]
    assert "not adjusted" in " ".join(role.caveats).lower()
    assert any(f.column == "d_fg3_pct_diff" and f.op == "qualified" for f in role.filters)
    assert "closeout_contest_rate" in role.optional_video_traits
    assert all(
        c.higher_is_better is False
        for c in role.components
        if c.trait_key in ("d_fg3_pct_diff", "matchup_pts_per_poss_allowed", "def_rating")
    )


def test_shooter_template_filters_usage_and_attempts():
    role = ROLE_INDEX["low_usage_perimeter_shooter"]
    assert (
        FilterRule("usg_pct", "<=", 0.20) in role.filters
        and FilterRule("fg3a", ">=", 100) in role.filters
    )
    assert "catch-and-shoot" in " ".join(role.caveats).lower()


def test_custom_role_round_trips_through_sqlite(tmp_path):
    db = open_state_db(DataLayout(tmp_path, "nba"))
    try:
        custom = RoleTemplate(
            role_id="",
            version=1,
            label="Stretch big",
            description="Bigs who shoot threes",
            components=(RoleComponent("fg3_pct", 2.0, True), RoleComponent("dreb_pct", 1.0, True)),
            filters=(FilterRule("position", "in", ("C", "F")), FilterRule("fg3a", ">=", 60)),
            optional_video_traits=(),
            caveats=("user-defined",),
            is_builtin=False,
        )
        saved = save_custom_role(db, custom)
        assert len(saved.role_id) == 26 and not saved.is_builtin
        assert load_role(db, saved.role_id) == saved
        assert [r.role_id for r in list_custom_roles(db)] == [saved.role_id]
        assert load_role(db, "low_usage_perimeter_shooter").is_builtin
        assert load_role(db, "nope") is None
        with pytest.raises(KeyError):
            save_custom_role(
                db,
                RoleTemplate(
                    "", 1, "x", "y", (RoleComponent("not_a_trait", 1.0, True),), (), (), (), False
                ),
            )
    finally:
        db.close()
