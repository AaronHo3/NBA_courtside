"""Trait registry: every trait is defined, versioned, typed and tied to real inputs."""

import pytest

from app.analytics.catalog import METRIC_INDEX
from app.scouting.traits import TRAIT_INDEX, TRAIT_REGISTRY_VERSION, TRAITS, registry


def test_registry_is_versioned_and_keys_are_unique():
    assert TRAIT_REGISTRY_VERSION == 1
    keys = [t.key for t in TRAITS]
    assert len(keys) == len(set(keys)) and set(TRAIT_INDEX) == set(keys)


def test_every_trait_is_fully_described():
    for t in TRAITS:
        assert t.label and t.definition and t.units and t.version >= 1, t.key
        assert t.evidence_class in ("statistical", "reviewed_observation")
        if t.evidence_class == "reviewed_observation":
            assert (
                t.action and t.success_outcomes and t.source_families == ("annotation_snapshots",)
            ), t.key
        assert t.source_families, t.key
        assert t.stint_handling in ("pooled_aggregate_row", "per_stint", "n/a")
        assert isinstance(t.limitations, tuple)


def test_catalog_backed_traits_point_at_real_metrics():
    for t in TRAITS:
        if t.catalog_metric is not None:
            assert t.catalog_metric in METRIC_INDEX, t.key


def test_rate_traits_declare_numerator_and_denominator():
    for key in ("fg3_pct", "ft_pct", "fg3a_rate", "d_fg3_pct_diff", "matchup_pts_per_poss_allowed"):
        t = TRAIT_INDEX[key]
        assert t.denominator, key
    assert (
        TRAIT_INDEX["fg3_pct"].numerator == "fg3m" and TRAIT_INDEX["fg3_pct"].denominator == "fg3a"
    )
    assert TRAIT_INDEX["fg3_pct"].interval == "wilson"


def test_no_catch_and_shoot_or_adjusted_impact_trait_exists():
    joined = " ".join(f"{t.key} {t.label} {t.definition}".lower() for t in TRAITS)
    assert "catch-and-shoot" not in joined and "catch and shoot" not in joined
    assert "rapm" not in joined and "epm" not in joined.split()


def test_registry_payload_is_json_friendly():
    rows = registry()
    assert rows and all(isinstance(r["qualification"], dict) for r in rows)
    assert {
        "key",
        "label",
        "evidence_class",
        "definition",
        "units",
        "higher_is_better",
        "qualification",
        "limitations",
        "version",
    } <= set(rows[0])


def test_reviewed_traits_cannot_be_ranking_components():
    from app.scouting.roles import RoleComponent, RoleTemplate, validate_role

    bad = RoleTemplate(
        "x", 1, "x", "", (RoleComponent("closeout_contest_rate", 1.0, True),), (), (), (), False
    )
    with pytest.raises(ValueError, match="reviewed"):
        validate_role(bad)
    wrong_optional = RoleTemplate(
        "y", 1, "y", "", (RoleComponent("ts_pct", 1.0, True),), (), ("ts_pct",), (), False
    )
    with pytest.raises(ValueError, match="optional_video_traits"):
        validate_role(wrong_optional)
