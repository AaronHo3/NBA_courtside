"""``event_id_map``: which play-by-play action a shot row refers to, and how sure we are.

``shots.game_event_id`` and ``playbyplayv3.actionNumber`` are hypothesised equal (DEC-06). A pair is
``exact`` only when the ids are equal *and* player, period, clock and result agree; otherwise a
unique match on (period, clock, player, result) is ``probable``, several matches are ``ambiguous``
(no action recorded), and no match leaves the shot unmapped (no row).
"""

from __future__ import annotations

from datetime import UTC, datetime

import pandas as pd

from app.ingestion.normalize.common import cast_to_schema

VERIFIER = "id_map@v1"
METHOD_EQUAL = "equal_ids"
METHOD_MATCHED = "matched_on_clock_player_result"


def _shot_clock_s(shots: pd.DataFrame) -> pd.Series:
    return shots["minutes_remaining"].astype(float) * 60 + shots["seconds_remaining"].astype(float)


def _prepare_events(events: pd.DataFrame) -> pd.DataFrame:
    fg = events[events["is_field_goal"].astype("boolean").fillna(False).astype(bool)].copy()
    fg["clock_s"] = (pd.to_numeric(fg["clock_ms"], errors="coerce") // 1000).astype("Float64")
    return fg


def _matches(fg: pd.DataFrame, shot) -> pd.DataFrame:
    result = "Made" if int(shot.shot_made_flag or 0) == 1 else "Missed"
    return fg[
        (fg["period"] == shot.period)
        & (fg["clock_s"] == shot.clock_s)
        & (fg["person_id"] == shot.player_id)
        & (fg["shot_result"] == result)
    ]


def _map_row(
    game_id: str, shot_event_id: int, action: int | None, method: str, confidence: str, now
) -> dict:
    return {
        "game_id": game_id,
        "pbp_v3_action_number": action,
        "pbp_v2_eventnum": None,
        "shots_game_event_id": int(shot_event_id),
        "method": method,
        "confidence": confidence,
        "verified_at": now,
        "verifier": VERIFIER,
    }


def build_event_id_map(events: pd.DataFrame, shots: pd.DataFrame) -> pd.DataFrame:
    if events.empty or shots.empty:
        return cast_to_schema(pd.DataFrame(), "event_id_map")
    now = pd.Timestamp(datetime.now(UTC))
    fg_all = _prepare_events(events)
    games = sorted(set(fg_all["game_id"]) & set(shots["game_id"]))
    shots = shots.assign(clock_s=_shot_clock_s(shots))
    rows: list[dict] = []
    for game_id in games:
        fg = fg_all[fg_all["game_id"] == game_id]
        for shot in shots[shots["game_id"] == game_id].itertuples():
            candidates = _matches(fg, shot)
            exact = candidates[candidates["source_event_id"] == shot.game_event_id]
            if not exact.empty:
                rows.append(
                    _map_row(
                        game_id,
                        shot.game_event_id,
                        int(shot.game_event_id),
                        METHOD_EQUAL,
                        "exact",
                        now,
                    )
                )
            elif candidates["source_event_id"].nunique() == 1:
                action = int(candidates["source_event_id"].iloc[0])
                rows.append(
                    _map_row(game_id, shot.game_event_id, action, METHOD_MATCHED, "probable", now)
                )
            elif candidates["source_event_id"].nunique() > 1:
                rows.append(
                    _map_row(game_id, shot.game_event_id, None, METHOD_MATCHED, "ambiguous", now)
                )
    if not rows:
        return cast_to_schema(pd.DataFrame(), "event_id_map")
    out = pd.DataFrame(rows)
    season_cols = ["season", "season_type"]
    if all(c in shots.columns for c in season_cols):
        out = out.merge(
            shots[["game_id", "game_event_id", *season_cols]].rename(
                columns={"game_event_id": "shots_game_event_id"}
            ),
            on=["game_id", "shots_game_event_id"],
            how="left",
        )
    return cast_to_schema(out, "event_id_map")


def agreement_summary(id_map: pd.DataFrame, shots: pd.DataFrame) -> dict[str, int]:
    exact = int((id_map["confidence"] == "exact").sum()) if not id_map.empty else 0
    probable = int((id_map["confidence"] == "probable").sum()) if not id_map.empty else 0
    ambiguous = int((id_map["confidence"] == "ambiguous").sum()) if not id_map.empty else 0
    n = int(len(shots))
    return {
        "shots": n,
        "mapped": exact + probable,
        "exact": exact,
        "probable": probable,
        "ambiguous": ambiguous,
        "unmapped": n - exact - probable - ambiguous,
    }
