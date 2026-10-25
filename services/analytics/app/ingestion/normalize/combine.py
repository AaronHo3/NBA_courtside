"""combine_anthro family: draftcombineplayeranthro per combine season (values already inches)."""

from __future__ import annotations

import pandas as pd

from app.ingestion.normalize.common import Payload, cast_to_schema, pick, result_set

_MAPPING = {
    "PLAYER_ID": "player_id",
    "POSITION": "position",
    "HEIGHT_WO_SHOES": "height_wo_shoes_in",
    "HEIGHT_W_SHOES": "height_w_shoes_in",
    "WEIGHT": "weight_lb",
    "WINGSPAN": "wingspan_in",
    "STANDING_REACH": "standing_reach_in",
    "BODY_FAT_PCT": "body_fat_pct",
    "HAND_LENGTH": "hand_length_in",
    "HAND_WIDTH": "hand_width_in",
}


def normalize_combine_anthro(payload: Payload, *, combine_season: str) -> pd.DataFrame:
    raw = result_set(payload, "Results")
    if raw.empty:
        return cast_to_schema(pd.DataFrame(), "combine_anthro")
    out = pick(raw, _MAPPING).assign(combine_season=combine_season)
    out = out[out["player_id"].notna()]
    return cast_to_schema(out, "combine_anthro")
