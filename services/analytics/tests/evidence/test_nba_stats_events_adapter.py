"""External-reference adapter: metadata only, never media URLs; bounded availability checks."""

from datetime import UTC, datetime

from app.evidence.adapters.nba_stats_events import NbaStatsEventsAdapter, metadata_from_payload
from app.evidence.availability import check_availability, mark_stale_references
from app.evidence.registry import get_asset, upsert_external_asset
from app.ingestion.providers.base import ProviderError, RawResponse
from tests.ingestion.fake_provider import load_fixture

GAME = "0022400061"


class ScriptedProvider:
    def __init__(self, payload_by_event: dict, error_events: set | None = None):
        self.payloads = payload_by_event
        self.errors = error_events or set()
        self.calls = []

    def fetch(self, endpoint_name, params):
        self.calls.append((endpoint_name, dict(params)))
        ev = int(params["game_event_id"])
        if ev in self.errors:
            raise ProviderError("HTTP 500")
        return RawResponse(
            dataset=endpoint_name,
            params=dict(params),
            payload=self.payloads.get(
                ev, {"resultSets": {"Meta": {"videoUrls": []}, "playlist": []}}
            ),
            fetched_at=datetime.now(UTC),
            endpoint=endpoint_name,
        )

    def probe(self, timeout=10.0):
        return True


def test_reference_url_and_key():
    adapter = NbaStatsEventsAdapter()
    assert (
        adapter.reference_url(GAME, 7)
        == "https://www.nba.com/stats/events/?GameID=0022400061&GameEventID=7&flag=1"
    )
    assert adapter.ref_key(GAME, 7) == "nba_stats_events:0022400061:7"
    assert adapter.mode == "external_reference"


def test_metadata_keeps_descriptive_fields_and_drops_every_url():
    payload = load_fixture(f"videoeventsasset__game_{GAME}__event_7")
    meta = metadata_from_payload(payload)
    assert meta["description"].startswith("Tatum")
    assert (
        meta["period"] == 1
        and meta["home_team_id"] == 1610612738
        and meta["away_team_id"] == 1610612752
    )
    assert meta["clip_uuid"] and meta["duration_ms"] == 12750
    flat = str(meta).lower()
    assert "redacted-url" not in flat and "http" not in flat and ".mp4" not in flat
    assert (
        metadata_from_payload({"resultSets": {"Meta": {"videoUrls": []}, "playlist": []}}) is None
    )


def test_availability_transitions_are_bounded_and_recorded(state_db, layout):
    ok_payload = load_fixture(f"videoeventsasset__game_{GAME}__event_7")
    adapter = NbaStatsEventsAdapter()
    ids = {}
    for ev in (7, 9, 11, 13):
        ids[ev] = upsert_external_asset(
            state_db,
            provider=adapter.name,
            ref_key=adapter.ref_key(GAME, ev),
            external_url=adapter.reference_url(GAME, ev),
            metadata={"game_id": GAME, "event_id": ev},
        )["asset_id"]
    provider = ScriptedProvider({7: ok_payload}, error_events={11})
    report = check_availability(
        provider, layout, state_db, [ids[7], ids[9], ids[11], ids[13]], max_calls=3
    )
    assert len(provider.calls) == 3 and report.checked == 3
    assert get_asset(state_db, ids[7])["availability"] == "available"
    assert get_asset(state_db, ids[7])["metadata"]["clip_uuid"]
    assert get_asset(state_db, ids[9])["availability"] == "unavailable"  # empty playlist
    assert (
        get_asset(state_db, ids[11])["availability"] == "unverified"
    )  # provider error leaves it unknown
    assert get_asset(state_db, ids[11])["availability_checked_at"] is not None
    assert (
        get_asset(state_db, ids[13])["availability"] == "unverified"
        and get_asset(state_db, ids[13])["availability_checked_at"] is None
    )
    assert report.available == 1 and report.unavailable == 1 and report.errors == 1


def test_available_references_go_stale_after_the_configured_age(state_db, layout):
    adapter = NbaStatsEventsAdapter()
    asset = upsert_external_asset(
        state_db,
        provider=adapter.name,
        ref_key=adapter.ref_key(GAME, 7),
        external_url=adapter.reference_url(GAME, 7),
    )
    provider = ScriptedProvider({7: load_fixture(f"videoeventsasset__game_{GAME}__event_7")})
    check_availability(provider, layout, state_db, [asset["asset_id"]], max_calls=1)
    now = datetime(2027, 1, 1, tzinfo=UTC)
    assert mark_stale_references(state_db, older_than_days=30, now=now) == 1
    assert get_asset(state_db, asset["asset_id"])["availability"] == "stale"
    assert mark_stale_references(state_db, older_than_days=30, now=now) == 0
