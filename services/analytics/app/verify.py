"""Cross-check one player-season and one team-season summary against the underlying game logs.

Run: ``python -m app.verify --season 2025-26 [--player-id ID] [--team-id ID] [--namespace demo|nba]``
Exit code 1 if any additive total disagrees. Works for the demo namespace (simulated logs) and for
the real namespace once game logs and season totals are ingested.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass

import pandas as pd

from app.config import get_settings
from app.data.db import Database
from app.data.namespace import resolve_namespace
from app.data.paths import DataLayout

COUNT_COLS = (
    "gp",
    "fgm",
    "fga",
    "fg3m",
    "fg3a",
    "ftm",
    "fta",
    "oreb",
    "dreb",
    "reb",
    "ast",
    "tov",
    "stl",
    "blk",
    "pf",
    "pts",
)
MIN_TOLERANCE = 0.6  # provider minutes are rounded per game


@dataclass(frozen=True)
class Check:
    field: str
    summary: float | None
    from_logs: float | None

    @property
    def ok(self) -> bool:
        if self.summary is None or self.from_logs is None:
            return False
        tol = MIN_TOLERANCE if self.field == "min" else 1e-9
        return abs(self.summary - self.from_logs) <= tol


def _compare(summary: pd.Series, logs: pd.DataFrame) -> list[Check]:
    checks = []
    for col in (*COUNT_COLS, "min"):
        if col not in summary.index or (col != "gp" and col not in logs.columns):
            continue
        from_logs = float(len(logs)) if col == "gp" else float(logs[col].sum())
        s = summary[col]
        checks.append(Check(col, None if pd.isna(s) else float(s), from_logs))
    return checks


def verify_player(
    db: Database, season: str, season_type: str, player_id: int | None
) -> tuple[str, list[Check]]:
    ps = db.query(
        "SELECT * FROM player_season WHERE season = ? AND season_type = ? AND NOT is_aggregate ORDER BY min DESC",
        [season, season_type],
    )
    if ps.empty:
        return "no player_season rows", []
    row = (
        ps[ps.player_id == player_id].iloc[0]
        if player_id and (ps.player_id == player_id).any()
        else ps.iloc[0]
    )
    logs = db.query(
        "SELECT * FROM player_game_logs WHERE season = ? AND season_type = ? AND player_id = ? AND team_id = ?",
        [season, season_type, int(row.player_id), int(row.team_id)],
    )
    label = f"player {int(row.player_id)} ({row.team_abbreviation}) {season} {season_type}"
    if logs.empty:
        return f"{label}: no game logs ingested", []
    return label, _compare(row, logs)


def verify_team(
    db: Database, season: str, season_type: str, team_id: int | None
) -> tuple[str, list[Check]]:
    ts = db.query(
        "SELECT * FROM team_season WHERE season = ? AND season_type = ? ORDER BY team_id",
        [season, season_type],
    )
    if ts.empty:
        return "no team_season rows", []
    row = (
        ts[ts.team_id == team_id].iloc[0]
        if team_id and (ts.team_id == team_id).any()
        else ts.iloc[0]
    )
    logs = db.query(
        "SELECT * FROM team_game_logs WHERE season = ? AND season_type = ? AND team_id = ?",
        [season, season_type, int(row.team_id)],
    )
    label = f"team {int(row.team_id)} {season} {season_type}"
    if logs.empty:
        return f"{label}: no team game logs ingested", []
    return label, _compare(row, logs)


def report(label: str, checks: list[Check]) -> bool:
    print(label)
    if not checks:
        return False
    for c in checks:
        flag = "ok " if c.ok else "MISMATCH"
        print(f"  {flag:9} {c.field:5} summary={c.summary!s:>10} logs={c.from_logs!s:>10}")
    return all(c.ok for c in checks)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--season", required=True)
    parser.add_argument("--season-type", default="Regular Season")
    parser.add_argument("--player-id", type=int)
    parser.add_argument("--team-id", type=int)
    parser.add_argument("--namespace", choices=["auto", "nba", "demo"], default="auto")
    args = parser.parse_args(argv)
    settings = get_settings()
    if args.namespace != "auto":
        settings = settings.model_copy(update={"nba_namespace": args.namespace})
    decision = resolve_namespace(settings)
    db = Database(DataLayout(settings.data_dir, decision.namespace))
    print(f"namespace: {decision.namespace} ({decision.reason})")
    ok_p = report(*verify_player(db, args.season, args.season_type, args.player_id))
    ok_t = report(*verify_team(db, args.season, args.season_type, args.team_id))
    return 0 if ok_p and ok_t else 1


if __name__ == "__main__":
    sys.exit(main())
