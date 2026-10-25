"""defense_dash family: leaguedashptdefend per defense category (Totals)."""

from __future__ import annotations

from collections.abc import Iterable

import pandas as pd

from app.ingestion.normalize.common import Payload, cast_to_schema, pick, result_set, with_season

DEFENSE_CATEGORIES: tuple[str, ...] = (
    "Overall",
    "3 Pointers",
    "2 Pointers",
    "Less Than 6Ft",
    "Less Than 10Ft",
    "Greater Than 15Ft",
)
RESULT_SET = "LeagueDashPTDefend"
_COMMON = {
    "CLOSE_DEF_PERSON_ID": "player_id",
    "PLAYER_LAST_TEAM_ID": "team_id",
    "GP": "gp",
    "G": "g",
    "FREQ": "freq",
}
# The provider names the made/attempted/"normal" columns differently per defense category:
# Overall -> D_FGM/D_FGA/NORMAL_FG_PCT, 3 Pointers -> FG3M/FG3A/NS_FG3_PCT, 2 Pointers -> FG2M/...,
# Less Than 6Ft -> FGM_LT_06/FGA_LT_06/NS_LT_06_PCT, Less Than 10Ft -> *_LT_10, Greater Than 15Ft -> *_GT_15.
_MADE = ("D_FGM", "FG3M", "FG2M")
_ATTEMPTED = ("D_FGA", "FG3A", "FG2A")


def category_mapping(headers: Iterable[str]) -> dict[str, str]:
    """Resolve the per-category column names present in ``headers`` to the schema's columns."""
    mapping = dict(_COMMON)
    for h in headers:
        if h in _MADE or h.startswith("FGM_"):
            mapping[h] = "d_fgm"
        elif h in _ATTEMPTED or h.startswith("FGA_"):
            mapping[h] = "d_fga"
        elif h == "NORMAL_FG_PCT" or h.startswith("NS_"):
            mapping[h] = "normal_fg_pct"
    return mapping


def normalize_defense_dash(
    payloads: Iterable[tuple[str, Payload]], *, season: str, season_type: str
) -> pd.DataFrame:
    """``payloads`` pairs each defense category label with its response."""
    frames = []
    for category, payload in payloads:
        rs = result_set(payload, RESULT_SET)
        df = pick(rs, category_mapping(list(rs.columns)))
        if not df.empty:
            frames.append(df.assign(defense_category=category))
    if not frames:
        return cast_to_schema(pd.DataFrame(), "defense_dash")
    raw = pd.concat(frames, ignore_index=True)
    return cast_to_schema(with_season(raw, season, season_type), "defense_dash")
