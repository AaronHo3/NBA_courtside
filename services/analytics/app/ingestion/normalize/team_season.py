"""team_season family: leaguedashteamstats Base + Advanced + Four Factors (Totals)."""

from __future__ import annotations

import pandas as pd

from app.ingestion.normalize.common import (
    ADVANCED_MAPPING,
    Payload,
    box_mapping,
    cast_to_schema,
    merge_measures,
    pick,
    result_set,
    with_season,
)

RESULT_SET = "LeagueDashTeamStats"
_BASE = {"TEAM_ID": "team_id", "GP": "gp", "W": "w", "L": "l", **box_mapping()}
_ADV = {"TEAM_ID": "team_id", **ADVANCED_MAPPING}
_FOUR = {
    "TEAM_ID": "team_id",
    "EFG_PCT": "efg_pct",
    "FTA_RATE": "fta_rate",
    "TM_TOV_PCT": "tm_tov_pct",
    "OREB_PCT": "oreb_pct",
    "OPP_EFG_PCT": "opp_efg_pct",
    "OPP_FTA_RATE": "opp_fta_rate",
    "OPP_TOV_PCT": "opp_tov_pct",
    "OPP_OREB_PCT": "opp_oreb_pct",
}


def normalize_team_season(
    base: Payload,
    advanced: Payload | None,
    four_factors: Payload | None,
    *,
    season: str,
    season_type: str,
) -> pd.DataFrame:
    frames = [pick(result_set(base, RESULT_SET), _BASE)]
    if advanced is not None:
        frames.append(pick(result_set(advanced, RESULT_SET), _ADV))
    if four_factors is not None:
        frames.append(pick(result_set(four_factors, RESULT_SET), _FOUR))
    merged = merge_measures(frames, on=["team_id"])
    if merged.empty:
        return cast_to_schema(pd.DataFrame(), "team_season")
    return cast_to_schema(with_season(merged, season, season_type), "team_season")
