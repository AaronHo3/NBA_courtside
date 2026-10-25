"""lineups family: leaguedashlineups (5-man) Base + Advanced merged on GROUP_ID."""

from __future__ import annotations

import pandas as pd

from app.ingestion.normalize.common import (
    Payload,
    box_mapping,
    cast_to_schema,
    merge_measures,
    pick,
    result_set,
    with_season,
)

RESULT_SET = "Lineups"
_BASE = {
    "GROUP_ID": "group_id",
    "GROUP_NAME": "group_name",
    "TEAM_ID": "team_id",
    "GP": "gp",
    "W": "w",
    "L": "l",
    **box_mapping(),
}
_ADV = {
    "GROUP_ID": "group_id",
    "TEAM_ID": "team_id",
    "OFF_RATING": "off_rating",
    "DEF_RATING": "def_rating",
    "NET_RATING": "net_rating",
    "PACE": "pace",
    "POSS": "poss",
}


def parse_group_id(group_id: object) -> list[int]:
    """``"-123-456-"`` -> ``[123, 456]``."""
    if group_id is None or not isinstance(group_id, str):
        return []
    return [int(p) for p in group_id.strip("-").split("-") if p.strip().lstrip("-").isdigit()]


def normalize_lineups(
    base: Payload, advanced: Payload | None, *, season: str, season_type: str
) -> pd.DataFrame:
    frames = [pick(result_set(base, RESULT_SET), _BASE)]
    if advanced is not None:
        frames.append(pick(result_set(advanced, RESULT_SET), _ADV))
    merged = merge_measures(frames, on=["group_id", "team_id"])
    if merged.empty:
        return cast_to_schema(pd.DataFrame(), "lineups")
    merged = merged[merged["team_id"].notna()]  # a lineup without a team cannot be attributed
    merged = merged.assign(player_ids=merged["group_id"].map(parse_group_id))
    return cast_to_schema(with_season(merged, season, season_type), "lineups")
