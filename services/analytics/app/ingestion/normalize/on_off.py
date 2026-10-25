"""on_off family: teamplayeronoffsummary per team (Advanced, Totals)."""

from __future__ import annotations

from collections.abc import Iterable

import pandas as pd

from app.ingestion.normalize.common import Payload, cast_to_schema, pick, result_set, with_season

ON_SET = "PlayersOnCourtTeamPlayerOnOffSummary"
OFF_SET = "PlayersOffCourtTeamPlayerOnOffSummary"
_MAPPING = {
    "TEAM_ID": "team_id",
    "VS_PLAYER_ID": "player_id",
    "GP": "gp",
    "MIN": "min",
    "PLUS_MINUS": "plus_minus",
    "OFF_RATING": "off_rating",
    "DEF_RATING": "def_rating",
    "NET_RATING": "net_rating",
}


def _rows(payload: Payload) -> list[pd.DataFrame]:
    out = []
    for name, status in ((ON_SET, "On"), (OFF_SET, "Off")):
        df = pick(result_set(payload, name), _MAPPING)
        if not df.empty:
            out.append(df.assign(court_status=status))
    return out


def normalize_on_off(payloads: Iterable[Payload], *, season: str, season_type: str) -> pd.DataFrame:
    frames = [f for p in payloads for f in _rows(p)]
    if not frames:
        return cast_to_schema(pd.DataFrame(), "on_off")
    raw = pd.concat(frames, ignore_index=True).drop_duplicates(
        subset=["team_id", "player_id", "court_status"]
    )
    return cast_to_schema(with_season(raw, season, season_type), "on_off")
