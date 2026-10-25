"""Stored game logs and actual-vs-projected lines for free agents (no network on the request path)."""

from __future__ import annotations

from dataclasses import replace
from datetime import date

import pandas as pd
import pytest

from app.demo.generate import generate_demo_snapshot
from app.engine.categories import PRIM_IDX
from app.league.config import demo_league_config
from app.season.game_logs import actual_lines, load_game_logs, refresh_game_logs, scope_window


@pytest.fixture(scope="module")
def snap():
    base = generate_demo_snapshot(n_players=40)
    return replace(base, players=tuple(replace(p, nba_id=7000 + i) for i, p in enumerate(base.players)))


def _logs(snap, days):
    """First player: two games, one at double his projection and one at it; second player: one game at projection."""
    rows = []
    for k, p in enumerate(snap.players[:2]):
        pg = snap.per_game[snap.index[p.player_id]]
        for g, mult in enumerate([2.0, 1.0] if k == 0 else [1.0]):
            row = {"nba_id": p.nba_id, "name": p.name, "game_id": f"g{k}{g}", "game_date": days[g], "team": p.team}
            for key in ("MIN", "PTS", "REB", "AST", "STL", "BLK", "FG3M", "FG3A", "FGM", "FGA", "FTM", "FTA", "TOV"):
                row[key.lower()] = pg[PRIM_IDX[key]] * mult
            rows.append(row)
    return pd.DataFrame(rows)


def test_actual_lines_average_games_in_window_and_score_on_projection_scale(snap):
    league = demo_league_config()
    window = (date(2026, 10, 20), date(2026, 10, 26))
    logs = _logs(snap, [date(2026, 10, 21), date(2026, 10, 23)])
    first, second, third = (p.player_id for p in snap.players[:3])
    out = actual_lines(snap, league, logs, window, [first, second, third])
    assert set(out) == {first, second}  # no games -> no line, never zeros
    a = out[first]
    pg = snap.per_game[snap.index[first]]
    assert a.games == 2
    assert a.per_game["PTS"] == pytest.approx(pg[PRIM_IDX["PTS"]] * 1.5)
    assert a.fg_pct == pytest.approx(pg[PRIM_IDX["FGM"]] / pg[PRIM_IDX["FGA"]])  # makes ÷ attempts, not averaged
    assert a.value_delta > 0 and a.value_actual == pytest.approx(a.value_proj + a.value_delta)
    b = out[second]
    assert b.games == 1 and b.value_delta == pytest.approx(0.0, abs=1e-6)
    # games outside the window are ignored
    assert actual_lines(snap, league, logs, (date(2026, 11, 2), date(2026, 11, 8)), [first]) == {}


def test_refresh_stores_logs_and_load_reads_them_back(tmp_path, snap):
    logs = _logs(snap, [date(2026, 10, 21), date(2026, 10, 23)])
    meta = refresh_game_logs(tmp_path, "2026-27", fetch=lambda season, season_type: logs)
    assert meta.rows == 3 and meta.max_game_date == "2026-10-23" and meta.fetched_at
    frame, stored = load_game_logs(tmp_path, "2026-27")
    assert stored == meta and len(frame) == 3
    assert load_game_logs(tmp_path, "2027-28") == (None, None)


def test_scope_window_week_and_season():
    period, (start, end) = scope_window("2026-27", "week", date(2026, 10, 25))
    assert period == 1 and start <= date(2026, 10, 25) <= end
    period_s, (s2, e2) = scope_window("2026-27", "season", date(2026, 10, 25))
    assert period_s == 1 and s2 < start or s2 == start
    assert e2 == date(2026, 10, 25)
