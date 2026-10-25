"""Helpers shared by the family normalizers (header-driven, null-preserving)."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

import numpy as np
import pandas as pd

from app.data.schemas import conform, schema_for

Payload = Mapping[str, Any]


def result_set(payload: Payload, name: str | None = None) -> pd.DataFrame:
    """DataFrame for one result set, using the headers *in the response* (never static lists).

    ``name=None`` returns the first result set. A missing or empty set yields an empty frame.
    """
    sets = payload.get("resultSets") or []
    if not sets and "resultSet" in payload:
        sets = [payload["resultSet"]]
    chosen = None
    for rs in sets:
        if name is None or rs.get("name") == name:
            chosen = rs
            break
    if chosen is None:
        return pd.DataFrame()
    headers = list(chosen.get("headers") or [])
    rows = chosen.get("rowSet") or []
    return pd.DataFrame(rows, columns=headers)


def lower_columns(df: pd.DataFrame) -> pd.DataFrame:
    return df.rename(columns={c: str(c).lower() for c in df.columns})


def to_float(series: pd.Series) -> pd.Series:
    """Numeric with blanks/None -> NaN (never zero)."""
    cleaned = series.replace({"": None, " ": None, "-": None})
    return pd.to_numeric(cleaned, errors="coerce").astype("float64")


def to_int(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series.replace({"": None}), errors="coerce").astype("Int64")


def to_text(series: pd.Series) -> pd.Series:
    out = series.astype("object").where(series.notna(), None)
    return out.map(lambda v: None if v is None or str(v).strip() == "" else str(v))


def to_date(series: pd.Series) -> pd.Series:
    parsed = pd.to_datetime(series, errors="coerce", utc=False)
    return parsed.dt.tz_localize(None).dt.date.where(parsed.notna(), None)


def cast_to_schema(df: pd.DataFrame, family: str) -> pd.DataFrame:
    """Conform columns and coerce dtypes according to the Arrow schema; nulls stay null."""
    out = conform(df, family)
    for field in schema_for(family):
        name, kind = field.name, str(field.type)
        if name not in out.columns or name in ("source", "fetched_at"):
            continue
        col = out[name]
        if kind == "double":
            out[name] = to_float(col)
        elif kind == "int64":
            out[name] = to_int(col)
        elif kind == "string":
            out[name] = to_text(col)
        elif kind == "bool":
            out[name] = col.map(lambda v: None if v is None or pd.isna(v) else bool(v)).astype(
                "boolean"
            )
        elif kind == "date32[day]":
            out[name] = (
                col
                if col.map(lambda v: v is None or not isinstance(v, str)).all()
                else to_date(col)
            )
    return out.reset_index(drop=True)


def pick(df: pd.DataFrame, mapping: Mapping[str, str]) -> pd.DataFrame:
    """Rename the present raw columns (``RAW -> snake``) and drop everything else."""
    present = {raw: new for raw, new in mapping.items() if raw in df.columns}
    return df[list(present)].rename(columns=present)


def box_mapping(prefix: str = "") -> dict[str, str]:
    cols = (
        "MIN",
        "FGM",
        "FGA",
        "FG3M",
        "FG3A",
        "FTM",
        "FTA",
        "OREB",
        "DREB",
        "REB",
        "AST",
        "TOV",
        "STL",
        "BLK",
        "BLKA",
        "PF",
        "PFD",
        "PTS",
        "PLUS_MINUS",
    )
    return {f"{prefix}{c}": c.lower() for c in cols}


ADVANCED_MAPPING: dict[str, str] = {
    "OFF_RATING": "off_rating",
    "DEF_RATING": "def_rating",
    "NET_RATING": "net_rating",
    "AST_PCT": "ast_pct",
    "AST_TO": "ast_to",
    "AST_RATIO": "ast_ratio",
    "OREB_PCT": "oreb_pct",
    "DREB_PCT": "dreb_pct",
    "REB_PCT": "reb_pct",
    "TM_TOV_PCT": "tm_tov_pct",
    "EFG_PCT": "efg_pct",
    "TS_PCT": "ts_pct",
    "USG_PCT": "usg_pct",
    "PACE": "pace",
    "PIE": "pie",
    "POSS": "poss",
}


def merge_measures(
    frames: Iterable[pd.DataFrame], on: list[str], suffix_drop: bool = True
) -> pd.DataFrame:
    """Outer-merge Base/Advanced/... frames on ``on``; later frames add only new columns."""
    merged: pd.DataFrame | None = None
    for frame in frames:
        if frame.empty and merged is not None:
            continue
        if merged is None:
            merged = frame.copy()
            continue
        new_cols = [c for c in frame.columns if c in on or c not in merged.columns]
        merged = merged.merge(frame[new_cols], on=on, how="outer")
    return merged if merged is not None else pd.DataFrame()


def with_season(df: pd.DataFrame, season: str, season_type: str) -> pd.DataFrame:
    return df.assign(season=season, season_type=season_type)


def nan_to_none(values: Iterable[Any]) -> list[Any]:
    return [None if isinstance(v, float) and np.isnan(v) else v for v in values]
