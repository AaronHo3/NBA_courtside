"""Bounded capability probe: records what candidate endpoints actually return (DECISIONS DEC-07)."""

import json
from datetime import UTC, datetime

import pytest

from app.ingestion.capabilities import (
    CAPABILITY_LOG_NAME,
    CapabilityRecord,
    plan_probe_calls,
    probe_capabilities,
    scrub_payload,
)
from app.ingestion.providers.base import ProviderError, RawResponse, TransientProviderError

GAME = "0022400061"


class ScriptedProvider:
    """Answers each endpoint from a dict; missing -> ProviderError; reachable flag for probe()."""

    def __init__(self, payloads: dict, reachable: bool = True):
        self.payloads = payloads
        self.reachable = reachable
        self.calls: list[tuple[str, dict]] = []

    def fetch(self, endpoint_name, params):
        self.calls.append((endpoint_name, dict(params)))
        if endpoint_name not in self.payloads:
            raise ProviderError(f"{endpoint_name}: HTTP 404")
        payload = self.payloads[endpoint_name]
        if isinstance(payload, Exception):
            raise payload
        return RawResponse(
            dataset=endpoint_name,
            params=dict(params),
            payload=payload,
            fetched_at=datetime.now(UTC),
            endpoint=endpoint_name,
        )

    def probe(self, timeout=10.0):
        return self.reachable


def _pbp(rows):
    return {
        "resource": "playbyplay",
        "resultSets": [
            {"name": "PlayByPlay", "headers": ["gameId", "actionNumber", "clock"], "rowSet": rows},
            {
                "name": "AvailableVideo",
                "headers": ["videoAvailable"],
                "rowSet": [[1]] if rows else [],
            },
        ],
    }


def test_plan_covers_candidate_endpoints_and_events_within_cap():
    calls = plan_probe_calls(
        GAME, event_ids=[7, 9, 11], shooter=(1610612738, 1628369), max_calls=10
    )
    endpoints = [c.endpoint for c in calls]
    assert endpoints[:4] == [
        "playbyplayv3",
        "playbyplayv2",
        "gamerotation",
        "boxscoretraditionalv3",
    ]
    assert endpoints.count("videoeventsasset") == 3
    assert endpoints.count("videodetailsasset") == 1
    assert len(calls) == 8
    assert all(c.params.get("game_id", c.params.get("game_id_nullable")) == GAME for c in calls)
    assert plan_probe_calls(GAME, event_ids=[7, 9, 11], shooter=None, max_calls=5).__len__() == 5


def test_records_shape_row_counts_and_fields(nba_layout):
    provider = ScriptedProvider(
        {"playbyplayv3": _pbp([[GAME, 7, "PT11M48.00S"], [GAME, 9, "PT11M27.00S"]])}
    )
    records = probe_capabilities(
        provider, nba_layout, GAME, event_ids=[7], shooter=None, max_calls=10
    )
    by = {r.endpoint: r for r in records}
    ok = by["playbyplayv3"]
    assert ok.status == "ok" and ok.row_count == 3  # 2 play-by-play rows + 1 AvailableVideo row
    assert ok.result_set_names == ["PlayByPlay", "AvailableVideo"]
    assert ok.fields_seen["PlayByPlay"] == ["gameId", "actionNumber", "clock"]
    assert by["playbyplayv2"].status == "error" and "404" in by["playbyplayv2"].error
    log_path = nba_layout.namespace_dir / CAPABILITY_LOG_NAME
    lines = [json.loads(line) for line in log_path.read_text().splitlines()]
    assert len(lines) == len(records) and lines[0]["endpoint"] == "playbyplayv3"
    assert {
        "endpoint",
        "params",
        "status",
        "result_set_names",
        "row_count",
        "fields_seen",
        "fetched_at",
        "error",
    } <= set(lines[0])


def test_never_exceeds_max_calls(nba_layout):
    provider = ScriptedProvider({})
    records = probe_capabilities(
        provider, nba_layout, GAME, event_ids=[7, 9, 11, 13], shooter=(1, 2), max_calls=3
    )
    assert len(records) == 3 and len(provider.calls) == 3


def test_unreachable_provider_records_one_row_and_makes_no_calls(nba_layout):
    provider = ScriptedProvider({"playbyplayv3": _pbp([])}, reachable=False)
    records = probe_capabilities(
        provider, nba_layout, GAME, event_ids=[7], shooter=None, max_calls=10
    )
    assert [r.status for r in records] == ["unreachable"] and provider.calls == []


def test_empty_result_sets_are_recorded_as_empty(nba_layout):
    provider = ScriptedProvider({"playbyplayv3": _pbp([])})
    records = probe_capabilities(
        provider, nba_layout, GAME, event_ids=[], shooter=None, max_calls=1
    )
    assert records[0].status == "empty" and records[0].row_count == 0


def test_transient_failure_is_recorded_not_raised(nba_layout):
    provider = ScriptedProvider({"playbyplayv3": TransientProviderError("timeout")})
    records = probe_capabilities(
        provider, nba_layout, GAME, event_ids=[], shooter=None, max_calls=1
    )
    assert records[0].status == "error" and "timeout" in records[0].error


def test_rerun_uses_the_raw_cache(nba_layout):
    provider = ScriptedProvider({"playbyplayv3": _pbp([[GAME, 7, "x"]])})
    probe_capabilities(provider, nba_layout, GAME, event_ids=[], shooter=None, max_calls=1)
    probe_capabilities(provider, nba_layout, GAME, event_ids=[], shooter=None, max_calls=1)
    assert len(provider.calls) == 1


def test_scrub_keeps_headers_and_truncates_rows():
    payload = _pbp([[GAME, i, "c"] for i in range(120)])
    scrubbed = scrub_payload(payload, max_rows=50)
    assert scrubbed["resultSets"][0]["headers"] == ["gameId", "actionNumber", "clock"]
    assert len(scrubbed["resultSets"][0]["rowSet"]) == 50
    assert scrubbed["resultSets"][1]["rowSet"] == [[1]]
    assert len(payload["resultSets"][0]["rowSet"]) == 120  # input untouched


def test_record_fixtures_writes_named_files(nba_layout, tmp_path):
    provider = ScriptedProvider({"playbyplayv3": _pbp([[GAME, 7, "x"]])})
    out = tmp_path / "fixtures"
    probe_capabilities(
        provider, nba_layout, GAME, event_ids=[], shooter=None, max_calls=1, fixtures_dir=out
    )
    assert (out / f"playbyplayv3__game_{GAME}.json").exists()
    assert not (out / f"playbyplayv2__game_{GAME}.json").exists()  # failed calls record no fixture


def test_record_is_frozen():
    r = CapabilityRecord(
        endpoint="x",
        params={},
        status="ok",
        result_set_names=[],
        row_count=0,
        fields_seen={},
        fetched_at="t",
        error=None,
    )
    with pytest.raises(AttributeError):
        r.status = "error"  # type: ignore[misc]


def test_summarises_deeply_nested_v3_shapes():
    from app.ingestion.capabilities import summarise_payload

    payload = {
        "meta": {"version": 1},
        "boxScoreTraditional": {
            "gameId": GAME,
            "homeTeam": {
                "teamId": 1,
                "players": [{"personId": 1, "position": "F"}, {"personId": 2, "position": ""}],
            },
            "awayTeam": {"teamId": 2, "players": [{"personId": 3, "position": "C"}]},
        },
    }
    names, rows, fields = summarise_payload(payload)
    assert names == ["boxScoreTraditional.homeTeam.players", "boxScoreTraditional.awayTeam.players"]
    assert rows == 3 and fields["boxScoreTraditional.homeTeam.players"] == ["personId", "position"]


def test_scrub_redacts_urls_but_keeps_keys():
    payload = {
        "resultSets": {
            "Meta": {
                "videoUrls": [
                    {"uuid": "abc", "murl": "https://videos.example/x.mp4", "sdur": 12750}
                ]
            },
            "playlist": [{"gi": GAME, "dsc": "Tatum 27' 3PT", "ha": "BOS"}],
        }
    }
    scrubbed = scrub_payload(payload)
    url_row = scrubbed["resultSets"]["Meta"]["videoUrls"][0]
    assert (
        url_row["murl"] == "<redacted-url>"
        and url_row["uuid"] == "abc"
        and url_row["sdur"] == 12750
    )
    assert scrubbed["resultSets"]["playlist"][0]["dsc"] == "Tatum 27' 3PT"
    assert payload["resultSets"]["Meta"]["videoUrls"][0]["murl"].startswith("https://")


def test_empty_response_records_no_fixture(nba_layout, tmp_path):
    provider = ScriptedProvider({"playbyplayv3": {}})
    out = tmp_path / "fixtures"
    records = probe_capabilities(
        provider, nba_layout, GAME, event_ids=[], shooter=None, max_calls=1, fixtures_dir=out
    )
    assert records[0].status == "empty" and not list(out.glob("*.json")) if out.exists() else True
