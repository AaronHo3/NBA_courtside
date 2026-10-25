"""`events` step: explicit per-game play-by-play ingestion, merged per season, never part of `all`."""

from app.data.manifest import Manifest
from app.data.parquet_io import read_family
from app.ingestion import pipeline
from app.ingestion.pipeline import IngestionPlan
from tests.ingestion.conftest import RS, SEASON
from tests.ingestion.fake_provider import FakeProvider

GAME = "0022400061"


def test_events_are_excluded_from_all_and_resolve_explicitly():
    assert "events" not in IngestionPlan((SEASON,), (RS,), ("all",)).resolved_families()
    assert IngestionPlan((SEASON,), (RS,), ("events",)).resolved_families() == ("events",)


def test_explicit_game_ids_fetch_normalize_and_write_three_families(nba_layout, provider):
    report = pipeline.run(
        nba_layout, provider, IngestionPlan((SEASON,), (RS,), ("teams", "events")), game_ids=(GAME,)
    )
    result = [r for r in report.results if r.family == "events"][0]
    assert result.status == "ok" and result.rows == 50
    assert "1 game" in (result.note or "")
    events = read_family(nba_layout, "events")
    assert set(events["game_id"]) == {GAME}
    assert len(read_family(nba_layout, "event_participants")) > 0
    id_map = read_family(nba_layout, "event_id_map")
    assert id_map.empty  # the shots fixture covers a different game; nothing to verify yet
    manifest = Manifest.load(nba_layout)
    assert manifest.find("events", SEASON, RS).status == "ok"
    assert manifest.find("event_participants", SEASON, RS).status == "ok"
    assert manifest.find("event_id_map", SEASON, RS) is not None
    assert len(provider.calls_for("playbyplayv3")) == 1


def test_rerun_is_served_from_cache_and_does_not_duplicate_rows(nba_layout, provider):
    plan = IngestionPlan((SEASON,), (RS,), ("events",))
    pipeline.run(nba_layout, provider, plan, game_ids=(GAME,))
    pipeline.run(nba_layout, provider, plan, game_ids=(GAME,))
    assert len(provider.calls_for("playbyplayv3")) == 1
    events = read_family(nba_layout, "events")
    assert len(events) == 50


def test_failed_game_marks_step_partial(nba_layout):
    failing = FakeProvider(fail_keys={f"playbyplayv3__game_{GAME}"})
    report = pipeline.run(
        nba_layout,
        failing,
        IngestionPlan((SEASON,), (RS,), ("events",)),
        game_ids=(GAME, "0022400062"),
    )
    result = report.results[0]
    assert result.status in ("partial", "missing")
    assert "0022400061" in (result.note or "")


def test_without_game_list_or_games_family_the_step_is_missing_with_note(nba_layout, provider):
    report = pipeline.run(nba_layout, provider, IngestionPlan((SEASON,), (RS,), ("events",)))
    result = report.results[0]
    assert result.status == "missing" and "games" in (result.note or "")
    assert provider.calls_for("playbyplayv3") == []


def test_games_limit_uses_the_games_family(nba_layout, provider):
    pipeline.run(
        nba_layout, provider, IngestionPlan((SEASON,), (RS,), ("teams", "team_game_logs", "games"))
    )
    report = pipeline.run(
        nba_layout, provider, IngestionPlan((SEASON,), (RS,), ("events",)), games_limit=1
    )
    # the games family holds 0022400001 (no fixture) -> the one attempted game fails -> missing/partial, 1 call
    assert len(provider.calls_for("playbyplayv3")) == 1
    assert provider.calls_for("playbyplayv3")[0]["game_id"] == "0022400001"
    assert report.results[0].status in ("partial", "missing")
