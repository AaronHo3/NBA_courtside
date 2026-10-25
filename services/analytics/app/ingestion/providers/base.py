"""Provider contract: anything that can answer a stats.nba.com-style endpoint request."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol

SOURCE_NBA_API = "nba_api"


class ProviderError(RuntimeError):
    """Raised when the provider cannot produce a usable response after bounded retries."""


class TransientProviderError(ProviderError):
    """A retryable failure (timeout, connection reset, HTTP 5xx, rate limiting)."""


@dataclass(frozen=True)
class RawResponse:
    """One raw provider payload plus provenance.

    ``payload`` is the untouched JSON document ``{"resource", "parameters", "resultSets": [...]}``.
    """

    dataset: str
    params: dict[str, Any]
    payload: dict[str, Any]
    fetched_at: datetime
    endpoint: str
    source: str = SOURCE_NBA_API
    from_cache: bool = field(default=False, compare=False)

    def result_set(self, name: str) -> dict[str, Any] | None:
        for rs in self.payload.get("resultSets", []):
            if rs.get("name") == name:
                return rs
        return None


class StatsProvider(Protocol):
    def fetch(self, endpoint_name: str, params: dict[str, Any]) -> RawResponse: ...

    def probe(self, timeout: float = 10.0) -> bool: ...
