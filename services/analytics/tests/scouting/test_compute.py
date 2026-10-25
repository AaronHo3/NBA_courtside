"""compute_traits: reproducible trait records over the existing analytics."""

import math

import pandas as pd
import pytest

from app.analytics.percentiles import percentile_rank
from app.analytics.uncertainty import wilson_interval
from app.data.repositories.common import one_row_player_season
from app.scouting.compute import Cohort, compute_traits
from app.scouting.traits import TRAIT_REGISTRY_VERSION

from .conftest import DETAIL, RS


def _by_key(records):
    return {r["key"]: r for r in records}


@pytest.fixture(scope="module")
def pooled(demo_db) -> pd.DataFrame:
    return one_row_player_season(demo_db, DETAIL, RS)


@pytest.fixture(scope="module")
def shooter(pooled) -> int:
    return int(pooled.sort_values("fg3a", ascending=False).iloc[0]["player_id"])


def test_record_shape(demo_db, shooter):
    rec = _by_key(compute_traits(demo_db, [shooter], DETAIL, RS, trait_keys=["fg3_pct"]))["fg3_pct"]
    for field in (
        "key",
        "label",
        "evidence_class",
        "definition",
        "formula",
        "units",
        "higher_is_better",
        "time_window",
        "stint_handling",
        "cohort",
        "qualification",
        "sample",
        "coverage",
        "value",
        "interval",
        "percentile",
        "evidence_ids",
        "version",
        "limitations",
        "player_id",
    ):
        assert field in rec, field
    assert rec["player_id"] == shooter and rec["evidence_class"] == "statistical"
    assert rec["time_window"] == {"season": DETAIL, "season_type": RS}
    assert rec["version"] == TRAIT_REGISTRY_VERSION
    assert rec["cohort"]["size"] > 0 and rec["cohort"]["min_gp"] == Cohort().min_gp


def test_fg3_pct_uses_pooled_totals_and_wilson_interval(demo_db, pooled, shooter):
    row = pooled[pooled.player_id == shooter].iloc[0]
    rec = _by_key(compute_traits(demo_db, [shooter], DETAIL, RS, trait_keys=["fg3_pct"]))["fg3_pct"]
    assert rec["value"] == pytest.approx(row["fg3m"] / row["fg3a"])
    ci = wilson_interval(int(row["fg3m"]), int(row["fg3a"]))
    assert rec["interval"] == {
        "low": pytest.approx(ci.lower),
        "high": pytest.approx(ci.upper),
        "method": "wilson_95",
    }
    assert rec["sample"] == {"n": int(row["fg3a"]), "denominator": "fg3a"}
    assert rec["qualification"]["met"] is True


def test_traded_player_uses_the_aggregate_row(demo_db, pooled):
    traded = pooled[pooled.is_aggregate]
    if traded.empty:
        pytest.skip("small demo has no traded player this seed")
    pid = int(traded.iloc[0]["player_id"])
    rec = _by_key(compute_traits(demo_db, [pid], DETAIL, RS, trait_keys=["pts_per36"]))["pts_per36"]
    row = traded.iloc[0]
    assert rec["stint_handling"] == "pooled_aggregate_row"
    assert rec["value"] == pytest.approx(row["pts"] / row["min"] * 36)


def test_unmet_qualification_gives_null_value_with_reason(demo_db, pooled):
    low = pooled.sort_values("fg3a").iloc[0]
    rec = _by_key(
        compute_traits(demo_db, [int(low["player_id"])], DETAIL, RS, trait_keys=["fg3_pct"])
    )["fg3_pct"]
    if int(low["fg3a"]) >= 100:
        pytest.skip("every demo player clears the threshold this seed")
    assert rec["value"] is None and rec["percentile"] is None
    assert rec["qualification"]["met"] is False and "fg3a" in rec["qualification"]["reason"]
    assert rec["sample"]["n"] == int(low["fg3a"])  # the sample is still reported, never zeroed


def test_percentile_is_within_the_qualified_cohort(demo_db, pooled, shooter):
    rec = _by_key(compute_traits(demo_db, [shooter], DETAIL, RS, trait_keys=["ts_pct"]))["ts_pct"]
    qualified = pooled[(pooled.gp >= 10) & (pooled["min"] >= 100) & (pooled.fga >= 200)]
    expected = percentile_rank(qualified["ts_pct"], rec["value"])
    assert rec["percentile"] == pytest.approx(expected)
    assert rec["cohort"]["qualified"] == len(qualified)


def test_per36_and_per100_are_derived_from_totals(demo_db, pooled, shooter):
    row = pooled[pooled.player_id == shooter].iloc[0]
    recs = _by_key(
        compute_traits(demo_db, [shooter], DETAIL, RS, trait_keys=["ast_per36", "ast_per100"])
    )
    assert recs["ast_per36"]["value"] == pytest.approx(row["ast"] / row["min"] * 36)
    assert recs["ast_per100"]["value"] == pytest.approx(row["ast"] / row["poss"] * 100)
    assert recs["ast_per36"]["units"] == "per 36 min"


def test_defense_dashboard_trait_pools_stints_and_requires_attempts(demo_db, shooter):
    rec = _by_key(compute_traits(demo_db, [shooter], DETAIL, RS, trait_keys=["d_fg3_pct_diff"]))[
        "d_fg3_pct_diff"
    ]
    rows = demo_db.query(
        "SELECT SUM(d_fgm) m, SUM(d_fga) a, SUM(normal_fg_pct * d_fga) / NULLIF(SUM(d_fga), 0) nrm FROM defense_dash "
        "WHERE player_id = ? AND season = ? AND season_type = ? AND defense_category = '3 Pointers'",
        [shooter, DETAIL, RS],
    ).iloc[0]
    assert rec["sample"]["n"] == int(rows["a"] or 0)
    if rows["a"] and rows["a"] >= 75:
        assert rec["value"] == pytest.approx(rows["m"] / rows["a"] - rows["nrm"])
        assert rec["higher_is_better"] is False
    else:
        assert rec["value"] is None and rec["qualification"]["met"] is False


def test_matchup_trait_is_shrunk_toward_the_league_rate(demo_db, pooled):
    defenders = demo_db.query(
        "SELECT def_player_id, SUM(player_pts) pts, SUM(partial_poss) poss FROM matchups WHERE season = ? AND season_type = ? GROUP BY 1 ORDER BY poss DESC",
        [DETAIL, RS],
    )
    league = demo_db.query(
        "SELECT SUM(player_pts) / SUM(partial_poss) r FROM matchups WHERE season = ? AND season_type = ?",
        [DETAIL, RS],
    ).iloc[0]["r"]
    top = defenders.iloc[0]
    rec = _by_key(
        compute_traits(
            demo_db,
            [int(top.def_player_id)],
            DETAIL,
            RS,
            trait_keys=["matchup_pts_per_poss_allowed"],
        )
    )["matchup_pts_per_poss_allowed"]
    raw = top.pts / top.poss
    assert rec["raw_value"] == pytest.approx(raw)
    k = rec["shrinkage"]["prior_strength"]
    assert rec["value"] == pytest.approx((top.pts + league * k) / (top.poss + k))
    assert rec["shrinkage"]["prior_mean"] == pytest.approx(league)
    assert min(raw, league) - 1e-9 <= rec["value"] <= max(raw, league) + 1e-9


def test_missing_family_is_unsupported_not_zero(demo_db, pooled, shooter):
    # 2023-24 has season totals only in the small demo: no defense dashboards, no matchups
    recs = _by_key(
        compute_traits(
            demo_db,
            [shooter],
            "2023-24",
            RS,
            trait_keys=["d_fg3_pct_diff", "matchup_pts_per_poss_allowed", "ts_pct"],
        )
    )
    assert (
        recs["d_fg3_pct_diff"]["value"] is None
        and "defense_dash" in recs["d_fg3_pct_diff"]["unsupported_reason"]
    )
    assert (
        recs["matchup_pts_per_poss_allowed"]["value"] is None
        and recs["matchup_pts_per_poss_allowed"]["unsupported_reason"]
    )
    assert recs["ts_pct"]["unsupported_reason"] is None


def test_unknown_player_and_unknown_trait(demo_db):
    with pytest.raises(KeyError):
        compute_traits(demo_db, [1], DETAIL, RS, trait_keys=["nope"])
    recs = compute_traits(demo_db, [1], DETAIL, RS, trait_keys=["ts_pct"])
    assert recs == []


def test_values_are_never_nan(demo_db, pooled):
    ids = [int(p) for p in pooled.player_id.head(8)]
    for rec in compute_traits(demo_db, ids, DETAIL, RS):
        for k in ("value", "percentile", "raw_value"):
            v = rec.get(k)
            assert v is None or not (isinstance(v, float) and math.isnan(v)), (rec["key"], k)
