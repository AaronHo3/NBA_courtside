"""players family: commonallplayers (+ optional commonplayerinfo bio enrichment)."""

from __future__ import annotations

import re

import pandas as pd

from app.ingestion.normalize.common import (
    Payload,
    cast_to_schema,
    result_set,
    to_date,
    to_float,
    to_int,
)

HEIGHT_SOURCE_ROSTER = "roster-listed (stats.nba.com)"
_HEIGHT_RE = re.compile(r"^\s*(\d+)\s*-\s*(\d+)\s*$")


def parse_height_inches(value: object) -> float | None:
    """``"6-7"`` -> 79.0; blanks/unknown -> None."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    m = _HEIGHT_RE.match(str(value))
    if not m:
        return None
    return float(int(m.group(1)) * 12 + int(m.group(2)))


def _split_name(display: str | None) -> tuple[str | None, str | None]:
    if not display:
        return None, None
    parts = str(display).split(" ", 1)
    return (parts[0], parts[1] if len(parts) > 1 else None)


def normalize_players(payload: Payload) -> pd.DataFrame:
    raw = result_set(payload, "CommonAllPlayers")
    if raw.empty:
        return cast_to_schema(pd.DataFrame(), "players")
    names = raw["DISPLAY_FIRST_LAST"].map(_split_name)
    to_year = to_int(raw["TO_YEAR"])
    roster = to_int(raw["ROSTERSTATUS"]) if "ROSTERSTATUS" in raw else pd.Series([None] * len(raw))
    out = pd.DataFrame(
        {
            "player_id": to_int(raw["PERSON_ID"]),
            "full_name": raw["DISPLAY_FIRST_LAST"],
            "first_name": [n[0] for n in names],
            "last_name": [n[1] for n in names],
            "from_year": to_int(raw["FROM_YEAR"]),
            "to_year": to_year,
            "is_active": (roster.fillna(0) == 1).astype(bool),
        }
    )
    return cast_to_schema(out, "players")


_POSITION_ABBR = {"guard": "G", "forward": "F", "center": "C"}


def abbreviate_position(value: object) -> str | None:
    """Provider bios say "Forward-Guard"; the app (and leaguedashplayerstats) use "F-G" style."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    parts = [p.strip().lower() for p in str(value).split("-") if p.strip()]
    letters = [_POSITION_ABBR.get(part, part[:1].upper()) for part in parts]
    return "-".join(letters) if letters else None


def normalize_player_bio(payload: Payload) -> pd.DataFrame:
    """One commonplayerinfo payload -> one-row frame of bio columns keyed by player_id."""
    raw = result_set(payload, "CommonPlayerInfo")
    if raw.empty:
        return pd.DataFrame(columns=["player_id"])
    out = pd.DataFrame(
        {
            "player_id": to_int(raw["PERSON_ID"]),
            "birthdate": to_date(raw["BIRTHDATE"]) if "BIRTHDATE" in raw else None,
            "country": raw.get("COUNTRY"),
            "school": raw.get("SCHOOL"),
            "position": raw["POSITION"].map(abbreviate_position) if "POSITION" in raw else None,
            "height_in": raw["HEIGHT"].map(parse_height_inches) if "HEIGHT" in raw else None,
            "weight_lb": to_float(raw["WEIGHT"]) if "WEIGHT" in raw else None,
            "draft_year": to_int(raw["DRAFT_YEAR"]) if "DRAFT_YEAR" in raw else None,
            "draft_round": to_int(raw["DRAFT_ROUND"]) if "DRAFT_ROUND" in raw else None,
            "draft_number": to_int(raw["DRAFT_NUMBER"]) if "DRAFT_NUMBER" in raw else None,
        }
    )
    out["height_source"] = out["height_in"].map(
        lambda h: HEIGHT_SOURCE_ROSTER if h is not None and not pd.isna(h) else None
    )
    return out


def merge_bios(players: pd.DataFrame, bios: pd.DataFrame) -> pd.DataFrame:
    """Return players with bio columns filled from ``bios`` where available (inputs untouched)."""
    if bios.empty:
        return players.copy()
    indexed = bios.drop_duplicates("player_id").set_index("player_id")
    out = players.copy()
    for col in (c for c in bios.columns if c != "player_id"):
        incoming = out["player_id"].map(indexed[col])
        out[col] = incoming.where(incoming.notna(), out[col]) if col in out.columns else incoming
    return cast_to_schema(out, "players")
