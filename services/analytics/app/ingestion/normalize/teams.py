"""teams family from ``nba_api.stats.static.teams`` (offline; no network call)."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

import pandas as pd

from app.ingestion.normalize.common import cast_to_schema

SOURCE_STATIC = "nba_api static"

# Conference/division are not part of the static table; this is public league structure.
DIVISIONS: dict[str, tuple[str, str]] = {
    "BOS": ("East", "Atlantic"),
    "BKN": ("East", "Atlantic"),
    "NYK": ("East", "Atlantic"),
    "PHI": ("East", "Atlantic"),
    "TOR": ("East", "Atlantic"),
    "CHI": ("East", "Central"),
    "CLE": ("East", "Central"),
    "DET": ("East", "Central"),
    "IND": ("East", "Central"),
    "MIL": ("East", "Central"),
    "ATL": ("East", "Southeast"),
    "CHA": ("East", "Southeast"),
    "MIA": ("East", "Southeast"),
    "ORL": ("East", "Southeast"),
    "WAS": ("East", "Southeast"),
    "DEN": ("West", "Northwest"),
    "MIN": ("West", "Northwest"),
    "OKC": ("West", "Northwest"),
    "POR": ("West", "Northwest"),
    "UTA": ("West", "Northwest"),
    "GSW": ("West", "Pacific"),
    "LAC": ("West", "Pacific"),
    "LAL": ("West", "Pacific"),
    "PHX": ("West", "Pacific"),
    "SAC": ("West", "Pacific"),
    "DAL": ("West", "Southwest"),
    "HOU": ("West", "Southwest"),
    "MEM": ("West", "Southwest"),
    "NOP": ("West", "Southwest"),
    "SAS": ("West", "Southwest"),
}


def static_teams() -> list[dict[str, Any]]:
    from nba_api.stats.static import teams as static

    return static.get_teams()


def normalize_teams(raw_teams: Iterable[Mapping[str, Any]] | None = None) -> pd.DataFrame:
    rows = list(raw_teams) if raw_teams is not None else static_teams()
    records = [
        {
            "team_id": t["id"],
            "abbreviation": t["abbreviation"],
            "city": t.get("city"),
            "name": t.get("nickname"),
            "full_name": t.get("full_name"),
            "conference": DIVISIONS.get(t["abbreviation"], (None, None))[0],
            "division": DIVISIONS.get(t["abbreviation"], (None, None))[1],
        }
        for t in rows
    ]
    return cast_to_schema(pd.DataFrame(records), "teams")


def abbreviation_index(teams: pd.DataFrame) -> dict[str, int]:
    """abbreviation -> team_id (plus a few historical aliases the provider still emits)."""
    base = {str(a): int(i) for a, i in zip(teams["abbreviation"], teams["team_id"], strict=True)}
    aliases = {"NJN": "BKN", "NOH": "NOP", "NOK": "NOP", "SEA": "OKC", "VAN": "MEM", "CHH": "CHA"}
    for old, new in aliases.items():
        if new in base and old not in base:
            base[old] = base[new]
    return base
