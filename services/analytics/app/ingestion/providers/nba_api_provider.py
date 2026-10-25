"""nba_api-backed provider: pacing, timeouts, proxy, bounded retry with backoff + jitter."""

from __future__ import annotations

import importlib
import inspect
import logging
import random
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import requests

from app.config import Settings
from app.ingestion.providers.base import (
    SOURCE_NBA_API,
    ProviderError,
    RawResponse,
    TransientProviderError,
)

log = logging.getLogger("nba.ingestion.provider")

RequestFn = Callable[[str, dict[str, Any], float, str | None], dict[str, Any]]
RETRYABLE_STATUS = frozenset({408, 425, 429, 500, 502, 503, 504})
BACKOFF_BASE_SECONDS = 2.0
BACKOFF_CAP_SECONDS = 60.0


def endpoint_class(endpoint_name: str) -> type:
    """Resolve ``"leaguedashplayerstats"`` -> ``nba_api.stats.endpoints.LeagueDashPlayerStats``."""
    try:
        module = importlib.import_module(f"nba_api.stats.endpoints.{endpoint_name.lower()}")
    except ModuleNotFoundError as exc:
        raise ProviderError(f"unknown nba_api endpoint {endpoint_name!r}") from exc
    for _, cls in inspect.getmembers(module, inspect.isclass):
        if getattr(cls, "endpoint", "").lower() == endpoint_name.lower():
            return cls
    raise ProviderError(f"no endpoint class found in nba_api for {endpoint_name!r}")


def reset_nba_api_session() -> None:
    """Replace nba_api's process-wide ``requests.Session``.

    The provider's edge can start holding every request on a session it has flagged (its cookies
    and keep-alive connection) while a fresh session is answered at once; observed 2026-10-08 after
    ~600 rapid ``commonplayerinfo`` calls. Dropping the session is cheap (one TLS handshake).
    """
    from nba_api.stats.library.http import NBAStatsHTTP

    NBAStatsHTTP.set_session(requests.Session())


def _status_code(response: Any) -> int | None:
    """nba_api's NBAResponse keeps the HTTP status in a private attribute with no accessor."""
    for attr in ("status_code", "_status_code"):
        value = getattr(response, attr, None)
        if value is not None:
            return int(value)
    return None


def nba_api_request(
    endpoint_name: str, params: dict[str, Any], timeout: float, proxy: str | None
) -> dict[str, Any]:
    """Build the request with the nba_api endpoint class (keyword params) and return raw JSON."""
    from nba_api.stats.library.http import NBAStatsHTTP

    cls = endpoint_class(endpoint_name)
    pending = cls(get_request=False, timeout=timeout, proxy=proxy, **params)
    response = NBAStatsHTTP().send_api_request(
        endpoint=cls.endpoint,
        parameters=pending.parameters,
        proxy=proxy if proxy else None,
        timeout=timeout,
    )
    status = _status_code(response)
    if status in RETRYABLE_STATUS:
        raise TransientProviderError(f"{endpoint_name}: HTTP {status}")
    if status is not None and status >= 400:
        raise ProviderError(f"{endpoint_name}: HTTP {status}")
    if not response.valid_json():
        raise TransientProviderError(f"{endpoint_name}: response is not valid JSON")
    return response.get_dict()


class NbaApiProvider:
    """Serialises requests to stats.nba.com with a minimum inter-request delay."""

    def __init__(
        self,
        settings: Settings,
        *,
        request_fn: RequestFn = nba_api_request,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
        rng: random.Random | None = None,
        reset_session: Callable[[], None] = reset_nba_api_session,
    ) -> None:
        self.delay = float(settings.nba_request_delay_seconds)
        self.timeout = float(settings.nba_request_timeout_seconds)
        self.max_retries = int(settings.nba_max_retries)
        self.proxy = settings.nba_proxy or None
        self._request = request_fn
        self._sleep = sleep
        self._clock = clock
        self._rng = rng or random.Random()
        self._reset_session = reset_session
        self._last_request_at: float | None = None

    def _pace(self) -> None:
        if self._last_request_at is not None:
            wait = self.delay - (self._clock() - self._last_request_at)
            if wait > 0:
                self._sleep(wait)
        self._last_request_at = self._clock()

    def _backoff(self, attempt: int) -> float:
        base = min(BACKOFF_CAP_SECONDS, BACKOFF_BASE_SECONDS * (2**attempt))
        return base + self._rng.uniform(0, base / 2)

    def fetch(self, endpoint_name: str, params: dict[str, Any]) -> RawResponse:
        last_error: Exception | None = None
        for attempt in range(self.max_retries + 1):
            self._pace()
            try:
                payload = self._request(endpoint_name, dict(params), self.timeout, self.proxy)
                log.info("fetched %s attempt=%d params=%s", endpoint_name, attempt + 1, params)
                return RawResponse(
                    dataset=endpoint_name,
                    params=dict(params),
                    payload=payload,
                    fetched_at=datetime.now(UTC),
                    endpoint=endpoint_name,
                    source=SOURCE_NBA_API,
                )
            except (
                TransientProviderError,
                requests.exceptions.Timeout,
                requests.exceptions.ConnectionError,
            ) as exc:
                last_error = exc
                self._reset_session()  # never retry on a session the edge may be holding
                if attempt >= self.max_retries:
                    break
                wait = self._backoff(attempt)
                log.warning(
                    "transient failure on %s (attempt %d/%d): %s; retrying in %.1fs",
                    endpoint_name,
                    attempt + 1,
                    self.max_retries + 1,
                    exc,
                    wait,
                )
                self._sleep(wait)
        raise ProviderError(
            f"{endpoint_name} failed after {self.max_retries + 1} attempts: {last_error}"
        ) from last_error

    def probe(self, timeout: float = 10.0) -> bool:
        """One cheap request with a short timeout; True when the provider answers."""
        try:
            payload = self._request(
                "leaguedashteamstats", {"per_mode_detailed": "Totals"}, timeout, self.proxy
            )
            return bool(payload.get("resultSets"))
        except Exception as exc:  # noqa: BLE001 - probe must never raise
            log.info("provider probe failed: %s", exc)
            return False
