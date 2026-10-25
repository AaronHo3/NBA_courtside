"""Small immutable value types shared by the evidence modules."""

from __future__ import annotations

from dataclasses import dataclass

DEMO_ID_FLOOR = 9_000_000  # demo players/teams have ids at or above this; provider ids are below
REAL_NAMESPACE = "nba"


@dataclass(frozen=True)
class EventKey:
    source_event_system: str
    game_id: str
    source_event_id: int


@dataclass(frozen=True)
class AvailabilityReport:
    checked: int
    available: int
    unavailable: int
    errors: int
    skipped: int


@dataclass(frozen=True)
class LinkReport:
    game_id: str
    events: int
    assets_created: int
    links_created: int
    evidence_created: int
