import json
from datetime import UTC, date, datetime, timedelta

import pytest

from app.data.manifest import Manifest, ManifestEntry
from app.data.parquet_io import read_family
from app.data.schemas import FAMILIES
from app.ingestion import pipeline
from app.ingestion.pipeline import (
    IngestionPlan,
    Step,
    is_in_progress_season,
    run,
    unsupported_reason,
)
from tests.ingestion.conftest import BOS, NYK, RS, SEASON
from tests.ingestion.fake_provider import FakeProvider


def _backdate_cache(layout, *, days: int) -> None:
    stamp = (datetime.now(UTC) - timedelta(days=days)).isoformat()
    for path in layout.raw_dir.rglob("*.json"):
        doc = json.loads(path.read_text())
        path.write_text(json.dumps({**doc, "fetched_at": stamp}))


class TestPlan:
    def test_all_families_in_order(self):
        plan = IngestionPlan((SEASON,), (RS,), ("all",))
        fams = plan.resolved_families()
        assert fams[0] == "teams" and fams[-1] == "shots" and "player_bios" not in fams
        assert fams.index("player_season") < fams.index("player_game_logs") < fams.index("shots")
        assert len(plan.steps()) == len(fams)

    def test_alias_and_unknown(self):
        assert IngestionPlan((SEASON,), families=("shot_league_zone_avg",)).resolved_families() == (
            "shots",
        )
        with pytest.raises(ValueError, match="unknown families"):
            IngestionPlan((SEASON,), families=("nope",)).resolved_families()

    def test_steps_expand_seasons_and_types(self):
        plan = IngestionPlan(
            ("2023-24", SEASON), (RS, "Playoffs"), ("players", "combine_anthro", "shots")
        )
        steps = plan.steps()
        assert steps[0] == Step("players")
        assert [s for s in steps if s.family == "combine_anthro"] == [
            Step("combine_anthro", "2023-24"),
            Step("combine_anthro", SEASON),
        ]
        assert len([s for s in steps if s.family == "shots"]) == 4

    def test_season_support_rules(self):
        assert (
            unsupported_reason("matchups", "2016-17")
            and unsupported_reason("matchups", "2017-18") is None
        )
        assert unsupported_reason("defense_dash", "2012-13") and unsupported_reason(
            "shots", "1995-96"
        )
        assert (
            unsupported_reason("combine_anthro", "1999-00")
            and unsupported_reason("player_season", "1980-81") is None
        )

    def test_in_progress_season(self):
        assert is_in_progress_season("2024-25", date(2025, 3, 1))
        assert is_in_progress_season("2025-26", date(2025, 11, 1))
        assert not is_in_progress_season("2024-25", date(2025, 8, 1))
        assert not is_in_progress_season("2023-24", date(2025, 3, 1))


class TestRun:
    def test_full_run_writes_every_family(self, nba_layout, provider):
        report = run(nba_layout, provider, IngestionPlan((SEASON,), (RS,), ("all",)))
        assert report.failed == 0 and report.ok == len(report.results)
        manifest = Manifest.load(nba_layout)
        for family in FAMILIES:
            if (
                pipeline.ALIASES.get(family, family) in pipeline.ON_DEMAND_FAMILIES
                or family in pipeline.SNAPSHOT_FAMILIES
            ):
                continue  # per-game / per-player families are explicit, snapshots are exports; neither is in `all`
            entries = [e for e in manifest.entries if e.family == family]
            assert entries and all(e.status == "ok" for e in entries), family
        ps = read_family(nba_layout, "player_season")
        assert ps["is_aggregate"].sum() == 1 and (ps["source"] == "nba_api").all()
        shots = read_family(nba_layout, "shots")
        assert len(shots) == 4 and set(shots["opponent_team_id"].dropna()) == {BOS, NYK}
        assert manifest.find("shot_league_zone_avg", SEASON, RS).rows == 3
        assert manifest.find("players").rows == 5 and manifest.find("teams").rows == 30
        assert len(read_family(nba_layout, "defense_dash")) == 12
        assert len(read_family(nba_layout, "on_off")) == 6

    def test_rerun_skips_completed_steps(self, nba_layout, provider):
        run(
            nba_layout,
            provider,
            IngestionPlan((SEASON,), (RS,), ("teams", "players", "team_season")),
        )
        calls_before = len(provider.calls)
        second = run(
            nba_layout,
            provider,
            IngestionPlan((SEASON,), (RS,), ("teams", "players", "team_season")),
        )
        assert all(r.skipped for r in second.results)
        assert len(provider.calls) == calls_before

    def test_refresh_refetches(self, nba_layout, provider):
        run(nba_layout, provider, IngestionPlan((SEASON,), (RS,), ("players",)))
        run(nba_layout, provider, IngestionPlan((SEASON,), (RS,), ("players",)), refresh=True)
        assert len(provider.calls_for("commonallplayers")) == 2

    def test_resume_after_failure(self, nba_layout):
        failing = FakeProvider(fail_keys={"playergamelogs"})
        first = run(
            nba_layout,
            failing,
            IngestionPlan((SEASON,), (RS,), ("teams", "player_game_logs", "team_game_logs")),
        )
        statuses = {r.family: r.status for r in first.results}
        assert statuses == {"teams": "ok", "player_game_logs": "failed", "team_game_logs": "ok"}
        entry = Manifest.load(nba_layout).find("player_game_logs", SEASON, RS)
        assert entry.status == "failed" and "simulated failure" in entry.error
        healthy = FakeProvider()
        second = run(
            nba_layout,
            healthy,
            IngestionPlan((SEASON,), (RS,), ("teams", "player_game_logs", "team_game_logs")),
        )
        by_family = {r.family: r for r in second.results}
        assert by_family["teams"].skipped and by_family["team_game_logs"].skipped
        assert (
            not by_family["player_game_logs"].skipped
            and by_family["player_game_logs"].status == "ok"
        )
        assert healthy.calls_for("playergamelogs") and not healthy.calls_for("teamgamelogs")

    def test_progress_callback_and_checkpoint(self, nba_layout, provider):
        seen = []
        run(
            nba_layout,
            provider,
            IngestionPlan((SEASON,), (RS,), ("teams", "players")),
            progress=seen.append,
        )
        assert [r.family for r in seen] == ["teams", "players"]
        assert nba_layout.manifest_path.exists()

    def test_unsupported_season_marked_missing_without_provider_call(self, nba_layout, provider):
        report = run(
            nba_layout, provider, IngestionPlan(("2010-11",), (RS,), ("matchups", "defense_dash"))
        )
        assert all(r.status == "missing" for r in report.results)
        assert provider.calls == []
        entry = Manifest.load(nba_layout).find("matchups", "2010-11", RS)
        assert entry.status == "missing" and "2017-18" in entry.note
        old = run(
            nba_layout, provider, IngestionPlan(("1990-91",), (RS,), ("shots", "combine_anthro"))
        )
        assert [r.status for r in old.results] == ["missing", "missing"] and provider.calls == []
        assert Manifest.load(nba_layout).find("combine_anthro", "1990-91").note.endswith("2000-01")

    def test_partial_when_some_subrequests_fail(self, nba_layout):
        failing = FakeProvider(fail_keys={"leaguedashptdefend__3_Pointers"})
        report = run(nba_layout, failing, IngestionPlan((SEASON,), (RS,), ("defense_dash",)))
        result = report.results[0]
        assert result.status == "partial" and "3 Pointers" in result.note
        entry = Manifest.load(nba_layout).find("defense_dash", SEASON, RS)
        assert entry.status == "partial" and entry.rows == 10

    def test_rerun_repairs_partial_step_refetching_only_the_failed_subrequest(self, nba_layout):
        failing = FakeProvider(fail_keys={"leaguedashptdefend__3_Pointers"})
        run(nba_layout, failing, IngestionPlan((SEASON,), (RS,), ("defense_dash",)))
        assert Manifest.load(nba_layout).find("defense_dash", SEASON, RS).status == "partial"
        healthy = FakeProvider()
        report = run(nba_layout, healthy, IngestionPlan((SEASON,), (RS,), ("defense_dash",)))
        result = report.results[0]
        assert not result.skipped and result.status == "ok"
        # the five categories that succeeded before come from the raw cache; only 3 Pointers is fetched
        assert [p["defense_category"] for p in healthy.calls_for("leaguedashptdefend")] == [
            "3 Pointers"
        ]
        entry = Manifest.load(nba_layout).find("defense_dash", SEASON, RS)
        assert entry.status == "ok" and entry.rows == 12

    def test_shots_are_fetched_per_team_never_league_wide(self, nba_layout, provider):
        """The league-wide call is capped at 102,400 rows (about half a season), so never use it."""
        report = run(nba_layout, provider, IngestionPlan((SEASON,), (RS,), ("shots",)))
        assert report.results[0].status == "ok" and report.results[0].rows == 4
        calls = provider.calls_for("shotchartdetail")
        assert len(calls) == 30 and all(c["team_id"] != 0 for c in calls)

    def test_matchups_fallback_per_def_team(self, nba_layout):
        failing = FakeProvider(fail_keys={"leagueseasonmatchups"})
        report = run(nba_layout, failing, IngestionPlan((SEASON,), (RS,), ("matchups",)))
        assert report.results[0].status == "ok" and report.results[0].rows == 2

    def test_stale_in_progress_entry_is_refetched(self, nba_layout, provider):
        today = date(2025, 3, 1)
        run(nba_layout, provider, IngestionPlan((SEASON,), (RS,), ("team_season",)), today=today)
        manifest = Manifest.load(nba_layout)
        old = manifest.find("team_season", SEASON, RS).model_copy(
            update={"fetched_at": datetime.now(UTC) - timedelta(days=2)}
        )
        manifest.upsert(old).save(nba_layout)
        before = len(provider.calls)
        report = run(
            nba_layout, provider, IngestionPlan((SEASON,), (RS,), ("team_season",)), today=today
        )
        assert not report.results[0].skipped and report.results[0].status == "ok"
        assert len(provider.calls) == before  # raw cache is still fresh, so it is reused
        _backdate_cache(nba_layout, days=2)
        manifest = Manifest.load(nba_layout)
        manifest.upsert(
            manifest.find("team_season", SEASON, RS).model_copy(
                update={"fetched_at": datetime.now(UTC) - timedelta(days=2)}
            )
        ).save(nba_layout)
        run(nba_layout, provider, IngestionPlan((SEASON,), (RS,), ("team_season",)), today=today)
        assert len(provider.calls) == before + 3  # cache older than 24h is bypassed

    def test_finished_season_not_stale(self, nba_layout, provider):
        today = date(2026, 10, 8)
        run(nba_layout, provider, IngestionPlan((SEASON,), (RS,), ("team_season",)), today=today)
        manifest = Manifest.load(nba_layout)
        old = manifest.find("team_season", SEASON, RS).model_copy(
            update={"fetched_at": datetime.now(UTC) - timedelta(days=30)}
        )
        manifest.upsert(old).save(nba_layout)
        report = run(
            nba_layout, provider, IngestionPlan((SEASON,), (RS,), ("team_season",)), today=today
        )
        assert report.results[0].skipped

    def test_player_bios_step(self, nba_layout, provider):
        run(nba_layout, provider, IngestionPlan((SEASON,), (RS,), ("players",)))
        report = run(
            nba_layout, provider, IngestionPlan((SEASON,), (RS,), ("player_bios",)), players_limit=2
        )
        assert report.results[0].status == "ok" and len(provider.calls_for("commonplayerinfo")) == 2
        players = read_family(nba_layout, "players").set_index("player_id")
        assert (
            players.loc[1001, "height_in"] == 79.0
            and players.loc[1003, "height_in"] != players.loc[1003, "height_in"]
        )

    def test_validation_rejects_null_ids(self, nba_layout):
        import pandas as pd

        with pytest.raises(pipeline.ValidationError):
            pipeline.validate(pd.DataFrame({"team_id": [None], "gp": [1.0]}), "team_season")
        with pytest.raises(pipeline.ValidationError):
            pipeline.validate(pd.DataFrame({"team_id": [1], "gp": [-1.0]}), "team_season")

    def test_manifest_entry_shape(self, nba_layout, provider):
        run(nba_layout, provider, IngestionPlan((SEASON,), (RS,), ("teams",)))
        entry = Manifest.load(nba_layout).find("teams")
        assert (
            isinstance(entry, ManifestEntry)
            and entry.source == "nba_api"
            and entry.path.endswith("teams.parquet")
        )


class TestFetchPlayerShots:
    def test_merges_into_season_file(self, nba_layout, provider):
        run(nba_layout, provider, IngestionPlan((SEASON,), (RS,), ("shots",)))
        result = pipeline.fetch_player_shots(nba_layout, provider, 1001, SEASON, RS)
        assert (
            result["fetched_rows"] == 2 and result["added_rows"] == 1 and result["total_rows"] == 5
        )
        again = pipeline.fetch_player_shots(nba_layout, provider, 1001, SEASON, RS)
        assert again["added_rows"] == 0 and again["from_cache"] is True

    def test_creates_files_when_season_missing(self, nba_layout, provider):
        result = pipeline.fetch_player_shots(nba_layout, provider, 1001, SEASON, RS)
        assert result["total_rows"] == 2
        manifest = Manifest.load(nba_layout)
        assert (
            manifest.find("shots", SEASON, RS).rows == 2
            and manifest.find("shot_league_zone_avg", SEASON, RS).rows == 3
        )

    def test_rejects_bad_season_type(self, nba_layout, provider):
        with pytest.raises(ValueError):
            pipeline.fetch_player_shots(nba_layout, provider, 1001, SEASON, "Summer")


def test_shot_row_cap_detection():
    from app.ingestion.fetchers import PROVIDER_SHOT_ROW_CAP, truncated_payloads

    def payload(n):
        return {
            "resultSets": [
                {"name": "Shot_Chart_Detail", "headers": ["GAME_ID"], "rowSet": [["x"]] * n},
                {"name": "LeagueAverages", "headers": [], "rowSet": []},
            ]
        }

    assert truncated_payloads([payload(10), payload(PROVIDER_SHOT_ROW_CAP)]) == 1
    assert truncated_payloads([payload(0)]) == 0
