"""player_season family: leaguedashplayerstats Base + Advanced, league-wide + per-team stints."""

from __future__ import annotations

from collections.abc import Iterable, Mapping

import pandas as pd

from app.analytics.aggregation import with_aggregate_rows
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

AGGREGATE_TEAM_ID = 0
AGGREGATE_ABBREVIATION = "TOT"
RESULT_SET = "LeagueDashPlayerStats"

_BASE_MAPPING = {
    "PLAYER_ID": "player_id",
    "TEAM_ID": "team_id",
    "TEAM_ABBREVIATION": "team_abbreviation",
    "AGE": "age",
    "GP": "gp",
    "W": "w",
    "L": "l",
    **box_mapping(),
    "DD2": "dd2",
    "TD3": "td3",
}
_ADV_MAPPING = {"PLAYER_ID": "player_id", "TEAM_ID": "team_id", **ADVANCED_MAPPING}


def _rows(base: Payload, advanced: Payload | None) -> pd.DataFrame:
    base_df = pick(result_set(base, RESULT_SET), _BASE_MAPPING)
    if base_df.empty:
        return base_df
    frames = [base_df]
    if advanced is not None:
        adv_df = pick(result_set(advanced, RESULT_SET), _ADV_MAPPING)
        if not adv_df.empty:
            frames.append(adv_df.drop(columns=["team_id"], errors="ignore"))
    return merge_measures(frames, on=["player_id"])


def _stint(item: tuple, abbreviations: Mapping[int, str] | None) -> pd.DataFrame:
    """One per-team response -> stint rows.

    The provider stamps every row with the player's *current* TEAM_ID even when the response was
    filtered to another team, so a stint's team must come from the request filter (3-tuples);
    2-tuples keep the response's team for callers without a filter.
    """
    if len(item) == 3:
        team_id, base, adv = item
        df = _rows(base, adv)
        if df.empty:
            return df
        df = df.assign(team_id=int(team_id))
        if abbreviations and int(team_id) in abbreviations:
            df = df.assign(team_abbreviation=abbreviations[int(team_id)])
        return df
    base, adv = item
    return _rows(base, adv)


def _harmonise_percentages(df: pd.DataFrame) -> pd.DataFrame:
    """Player TM_TOV_PCT arrives as 0-100 while every other *_pct is a fraction; store fractions."""
    if "tm_tov_pct" in df.columns:
        vals = pd.to_numeric(df["tm_tov_pct"], errors="coerce")
        if vals.max(skipna=True) > 1.0:  # the whole response shares one scale
            df = df.assign(tm_tov_pct=vals / 100.0)
    return df


def normalize_player_season(
    league_base: Payload,
    league_advanced: Payload | None,
    team_payloads: Iterable[tuple],
    *,
    season: str,
    season_type: str,
    team_abbreviations: Mapping[int, str] | None = None,
) -> pd.DataFrame:
    """Stint rows from the per-team responses; the league-wide row only for multi-stint players.

    ``team_payloads`` items are ``(team_id, base, advanced)`` (team from the request filter) or
    ``(base, advanced)``. Falls back to the league-wide rows as single stints for players with no
    per-team row (a failed per-team call), and lets :func:`with_aggregate_rows` build an aggregate
    when the provider did not supply one.
    """
    stints = [_stint(item, team_abbreviations) for item in team_payloads]
    stint_df = (
        pd.concat([s for s in stints if not s.empty], ignore_index=True)
        if stints
        else pd.DataFrame()
    )
    league_df = _rows(league_base, league_advanced)
    if stint_df.empty:
        stint_df = league_df.copy()
    stint_df = stint_df.drop_duplicates(subset=["player_id", "team_id"]).assign(is_aggregate=False)
    counts = stint_df.groupby("player_id").size()
    multi = set(counts[counts > 1].index)
    covered = set(stint_df["player_id"])
    aggregate = league_df[league_df["player_id"].isin(multi)].assign(
        team_id=AGGREGATE_TEAM_ID, team_abbreviation=AGGREGATE_ABBREVIATION, is_aggregate=True
    )
    orphans = league_df[~league_df["player_id"].isin(covered)].assign(is_aggregate=False)
    combined = pd.concat([stint_df, orphans, aggregate], ignore_index=True)
    combined = _harmonise_percentages(with_season(combined, season, season_type))
    conformed = cast_to_schema(combined, "player_season")
    return cast_to_schema(with_aggregate_rows(conformed), "player_season")
