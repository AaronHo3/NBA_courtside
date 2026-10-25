"""Video source adapter contract (VIDEO_PIPELINE §1)."""

from __future__ import annotations

from typing import Any, Literal, Protocol


class ExternalReferenceAdapter(Protocol):
    """Metadata-only source: knows how to name and describe an event's clip on the provider's site."""

    name: str
    mode: Literal["external_reference"]

    def reference_url(self, game_id: str, event_id: int) -> str: ...

    def ref_key(self, game_id: str, event_id: int) -> str: ...

    def metadata_request(self, game_id: str, event_id: int) -> tuple[str, dict[str, Any]]: ...

    def parse_metadata(self, payload: dict[str, Any]) -> dict[str, Any] | None: ...
