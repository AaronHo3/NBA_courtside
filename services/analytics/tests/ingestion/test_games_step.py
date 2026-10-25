"""The `games` pipeline step derives from the season's team_game_logs file; no provider call."""

from app.data.manifest import Manifest
from app.data.parquet_io import read_family
from app.ingestion import pipeline
from app.ingestion.pipeline import IngestionPlan
from tests.ingestion.conftest import RS, SEASON


def test_games_follows_team_game_logs_in_step_order():
    fams = IngestionPlan((SEASON,), (RS,), ("all",)).resolved_families()
    assert fams.index("team_game_logs") < fams.index("games") < fams.index("lineups")


def test_games_derived_without_provider_calls(nba_layout, provider):
    pipeline.run(nba_layout, provider, IngestionPlan((SEASON,), (RS,), ("teams", "team_game_logs")))
    calls_before = len(provider.calls)
    report = pipeline.run(nba_layout, provider, IngestionPlan((SEASON,), (RS,), ("games",)))
    assert len(provider.calls) == calls_before
    result = [r for r in report.results if r.family == "games"][0]
    assert result.status == "ok"
    games = read_family(nba_layout, "games")
    logs = read_family(nba_layout, "team_game_logs")
    assert len(games) == logs["game_id"].nunique() == 1
    assert games.iloc[0]["game_id"] == "0022400001"
    assert games.iloc[0]["source_endpoint"] == "derived:team_game_logs"
    assert Manifest.load(nba_layout).find("games", SEASON, RS).status == "ok"


def test_games_missing_when_team_logs_not_ingested(nba_layout, provider):
    report = pipeline.run(nba_layout, provider, IngestionPlan((SEASON,), (RS,), ("games",)))
    result = report.results[0]
    assert result.status == "missing"
    assert "team_game_logs" in (result.note or "")
    assert provider.calls == []
    entry = Manifest.load(nba_layout).find("games", SEASON, RS)
    assert (
        entry is not None and entry.status == "missing" and "team_game_logs" in (entry.note or "")
    )
