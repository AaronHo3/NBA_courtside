from datetime import timedelta

import pytest
import requests

from app.config import Settings
from app.ingestion.cache import cache_key, cache_path, get_or_fetch
from app.ingestion.providers.base import ProviderError, RawResponse, TransientProviderError
from app.ingestion.providers.nba_api_provider import NbaApiProvider, endpoint_class
from tests.ingestion.fake_provider import FakeProvider, load_fixture


def _settings(**kw) -> Settings:
    base = {
        "nba_request_delay_seconds": 0.0,
        "nba_max_retries": 3,
        "nba_request_timeout_seconds": 5.0,
    }
    return Settings(**{**base, **kw})


class TestEndpointResolution:
    def test_resolves_class_by_name(self):
        cls = endpoint_class("leaguedashplayerstats")
        assert cls.__name__ == "LeagueDashPlayerStats"

    def test_unknown_endpoint(self):
        with pytest.raises(ProviderError):
            endpoint_class("nosuchendpoint")


class TestRetry:
    def test_fails_twice_then_succeeds(self):
        attempts: list[int] = []
        sleeps: list[float] = []

        def request(endpoint, params, timeout, proxy):
            attempts.append(1)
            if len(attempts) < 3:
                raise requests.exceptions.Timeout("slow")
            return load_fixture("leaguedashteamstats__Base")

        provider = NbaApiProvider(_settings(), request_fn=request, sleep=sleeps.append)
        resp = provider.fetch("leaguedashteamstats", {"season": "2024-25"})
        assert isinstance(resp, RawResponse) and resp.endpoint == "leaguedashteamstats"
        assert len(attempts) == 3 and len(sleeps) == 2
        assert sleeps[1] > sleeps[0] >= 2.0  # exponential backoff with jitter

    def test_transient_failure_resets_the_http_session_before_retrying(self):
        """A session the provider's edge has started holding must not be reused: a fresh session
        is answered immediately while the old one times out on every player (observed 2026-10-08)."""
        attempts: list[int] = []
        resets: list[int] = []

        def request(endpoint, params, timeout, proxy):
            attempts.append(1)
            if len(attempts) < 3:
                raise requests.exceptions.Timeout("held by the edge")
            return {"resultSets": []}

        provider = NbaApiProvider(
            _settings(),
            request_fn=request,
            sleep=lambda s: None,
            reset_session=lambda: resets.append(1),
        )
        provider.fetch("commonplayerinfo", {"player_id": 2})
        assert len(attempts) == 3
        assert len(resets) == 2  # once after each transient failure, never after the success

    def test_default_reset_replaces_nba_api_shared_session(self):
        from nba_api.stats.library.http import NBAStatsHTTP

        from app.ingestion.providers.nba_api_provider import reset_nba_api_session

        before = NBAStatsHTTP.get_session()
        reset_nba_api_session()
        after = NBAStatsHTTP.get_session()
        assert after is not before and isinstance(after, requests.Session)

    def test_gives_up_after_max_retries(self):
        def request(*_):
            raise TransientProviderError("HTTP 503")

        provider = NbaApiProvider(
            _settings(nba_max_retries=2), request_fn=request, sleep=lambda s: None
        )
        with pytest.raises(ProviderError, match="after 3 attempts"):
            provider.fetch("leaguedashteamstats", {})

    def test_non_retryable_error_raises_immediately(self):
        calls: list[int] = []

        def request(*_):
            calls.append(1)
            raise ProviderError("HTTP 404")

        provider = NbaApiProvider(_settings(), request_fn=request, sleep=lambda s: None)
        with pytest.raises(ProviderError):
            provider.fetch("leaguedashteamstats", {})
        assert len(calls) == 1

    def test_connection_error_is_retried(self):
        calls: list[int] = []

        def request(*_):
            calls.append(1)
            if len(calls) == 1:
                raise requests.exceptions.ConnectionError("reset")
            return {"resultSets": []}

        provider = NbaApiProvider(_settings(), request_fn=request, sleep=lambda s: None)
        provider.fetch("commonallplayers", {})
        assert len(calls) == 2


class TestPacing:
    def test_minimum_delay_between_requests(self):
        sleeps: list[float] = []
        clock = iter([0.0, 0.2, 0.2, 10.0, 10.0])
        provider = NbaApiProvider(
            _settings(nba_request_delay_seconds=1.5),
            request_fn=lambda *_: {"resultSets": []},
            sleep=sleeps.append,
            clock=lambda: next(clock),
        )
        provider.fetch("commonallplayers", {})
        provider.fetch("commonallplayers", {})
        assert len(sleeps) == 1 and sleeps[0] == pytest.approx(1.3)

    def test_timeout_and_proxy_passed_through(self):
        seen = {}

        def request(endpoint, params, timeout, proxy):
            seen.update(endpoint=endpoint, timeout=timeout, proxy=proxy, params=params)
            return {"resultSets": []}

        provider = NbaApiProvider(
            _settings(nba_request_timeout_seconds=7.5, nba_proxy="http://proxy:8080"),
            request_fn=request,
        )
        provider.fetch("commonallplayers", {"is_only_current_season": 0})
        assert seen == {
            "endpoint": "commonallplayers",
            "timeout": 7.5,
            "proxy": "http://proxy:8080",
            "params": {"is_only_current_season": 0},
        }


class TestProbe:
    def test_probe_true(self):
        provider = NbaApiProvider(
            _settings(), request_fn=lambda *_: load_fixture("leaguedashteamstats__Base")
        )
        assert provider.probe(timeout=1.0) is True

    def test_probe_never_raises(self):
        def request(*_):
            raise requests.exceptions.ConnectionError("blocked")

        provider = NbaApiProvider(_settings(), request_fn=request)
        assert provider.probe(timeout=1.0) is False


class TestCache:
    def test_key_is_order_independent(self):
        assert cache_key("x", {"a": 1, "b": 2}) == cache_key("x", {"b": 2, "a": 1})
        assert cache_key("x", {"a": 1}) != cache_key("y", {"a": 1})

    def test_cache_hit_calls_provider_once(self, nba_layout):
        provider = FakeProvider()
        params = {"is_only_current_season": 0}
        first = get_or_fetch(provider, nba_layout, "players", "commonallplayers", params)
        second = get_or_fetch(provider, nba_layout, "players", "commonallplayers", params)
        assert len(provider.calls) == 1
        assert first.from_cache is False and second.from_cache is True
        assert second.payload == first.payload and second.fetched_at == first.fetched_at
        assert second.dataset == "players"
        path = cache_path(nba_layout, "players", "commonallplayers", params)
        assert path.exists() and path.parent == nba_layout.raw_dir / "players"

    def test_refresh_and_max_age(self, nba_layout):
        provider = FakeProvider()
        params = {"is_only_current_season": 0}
        get_or_fetch(provider, nba_layout, "players", "commonallplayers", params)
        get_or_fetch(provider, nba_layout, "players", "commonallplayers", params, refresh=True)
        assert len(provider.calls) == 2
        get_or_fetch(
            provider, nba_layout, "players", "commonallplayers", params, max_age=timedelta(hours=1)
        )
        assert len(provider.calls) == 2
        get_or_fetch(
            provider,
            nba_layout,
            "players",
            "commonallplayers",
            params,
            max_age=timedelta(seconds=-1),
        )
        assert len(provider.calls) == 3

    def test_corrupt_cache_file_is_refetched(self, nba_layout):
        provider = FakeProvider()
        params = {"is_only_current_season": 0}
        path = cache_path(nba_layout, "players", "commonallplayers", params)
        path.parent.mkdir(parents=True)
        path.write_text("{not json")
        get_or_fetch(provider, nba_layout, "players", "commonallplayers", params)
        assert len(provider.calls) == 1
