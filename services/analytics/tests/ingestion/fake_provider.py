"""Fixture-backed StatsProvider used by the ingestion tests (no network)."""

from __future__ import annotations

import json
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.ingestion.providers.base import SOURCE_NBA_API, ProviderError, RawResponse

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "nba_api"
TEAM_KEYS = ("team_id_nullable", "team_id", "def_team_id_nullable")


def fixture_key(endpoint: str, params: dict[str, Any]) -> tuple[str, str, int | None]:
    """(full key, base key without team/player discriminators, team id)."""
    parts = [endpoint]
    measure = params.get("measure_type_detailed_defense")
    if measure:
        parts.append(str(measure).replace(" ", "_"))
    category = params.get("defense_category")
    if category:
        parts.append(str(category).replace(" ", "_"))
    base = "__".join(parts)
    team = next((int(params[k]) for k in TEAM_KEYS if params.get(k)), None)
    if team:
        parts.append(f"team_{team}")
    if params.get("player_id"):
        parts.append(f"player_{int(params['player_id'])}")
    if params.get("game_id"):
        parts.append(f"game_{params['game_id']}")
    return "__".join(parts), base, team


def _filter_by_team(payload: dict[str, Any], team_id: int) -> dict[str, Any]:
    sets = []
    for rs in payload.get("resultSets", []):
        headers = rs["headers"]
        if "TEAM_ID" in headers:
            idx = headers.index("TEAM_ID")
            rows = [r for r in rs["rowSet"] if r[idx] == team_id]
        else:
            rows = []
        sets.append({**rs, "rowSet": rows})
    return {**payload, "resultSets": sets}


class FakeProvider:
    def __init__(
        self, root: Path = FIXTURES, *, fail_keys: set[str] | None = None, reachable: bool = True
    ) -> None:
        self.root = root
        self.fail_keys = set(fail_keys or ())
        self.reachable = reachable
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self._lock = threading.Lock()

    def _payload(self, endpoint: str, params: dict[str, Any]) -> dict[str, Any]:
        key, base, team = fixture_key(endpoint, params)
        if key in self.fail_keys:
            raise ProviderError(f"simulated failure for {key}")
        exact = self.root / f"{key}.json"
        if exact.exists():
            return json.loads(exact.read_text())
        fallback = self.root / f"{base}.json"
        if fallback.exists() and team is not None:
            return _filter_by_team(json.loads(fallback.read_text()), team)
        raise ProviderError(f"no fixture for {key}")

    def fetch(self, endpoint_name: str, params: dict[str, Any]) -> RawResponse:
        with self._lock:
            self.calls.append((endpoint_name, dict(params)))
        payload = self._payload(endpoint_name, params)
        return RawResponse(
            dataset=endpoint_name,
            params=dict(params),
            payload=payload,
            fetched_at=datetime.now(UTC),
            endpoint=endpoint_name,
            source=SOURCE_NBA_API,
        )

    def probe(self, timeout: float = 10.0) -> bool:
        return self.reachable

    def calls_for(self, endpoint: str) -> list[dict[str, Any]]:
        return [p for e, p in self.calls if e == endpoint]


def load_fixture(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / f"{name}.json").read_text())
