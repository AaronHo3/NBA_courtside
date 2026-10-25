"""In-season minutes: recent minutes from stored game logs blended into (or overriding) projected minutes."""

from __future__ import annotations

from dataclasses import replace

import numpy as np
import pandas as pd
import pytest

from app.demo.generate import generate_demo_snapshot
from app.engine.categories import PRIM_IDX, PRIMITIVES
from app.season.minutes import MinutesBlendConfig, adjust_minutes, recent_minutes

LOG_COLS = ("min", "pts", "reb", "ast", "stl", "blk", "fg3m", "fg3a", "fgm", "fga", "ftm", "fta", "tov")


@pytest.fixture(scope="module")
def snap():
    base = generate_demo_snapshot(n_players=20)
    players = tuple(replace(p, nba_id=i + 1) for i, p in enumerate(base.players))
    return replace(base, players=players)


def game(nba_id: int, day: str, minutes: float) -> dict:
    return {"nba_id": nba_id, "name": f"P{nba_id}", "team": "ORL", "game_id": f"g{nba_id}{day}", "game_date": day, **{c: 1.0 for c in LOG_COLS}, "min": minutes}


def logs(*rows: dict) -> pd.DataFrame:
    return pd.DataFrame(list(rows))


def test_recent_minutes_averages_the_last_n_games_per_player():
    frame = logs(game(1, "2026-10-20", 10), game(1, "2026-10-22", 30), game(1, "2026-10-24", 34), game(2, "2026-10-21", 5))
    out = recent_minutes(frame, window_games=2)
    assert out.loc[1, "minutes"] == pytest.approx(32.0)  # the 10-minute opener falls outside the window
    assert out.loc[1, "games"] == 2
    assert out.loc[2, "minutes"] == pytest.approx(5.0) and out.loc[2, "games"] == 1


def test_blend_moves_minutes_toward_recent_and_scales_counting_stats(snap):
    pid = snap.players[0].player_id
    i = snap.index[pid]
    proj_min = float(snap.per_game[i, PRIM_IDX["MIN"]])
    frame = logs(game(1, "2026-10-21", proj_min + 6), game(1, "2026-10-23", proj_min + 6))
    adj, info = adjust_minutes(snap, frame, {}, MinutesBlendConfig(k_games=4.0))
    # weight n/(n+k) = 2/6 on the recent mean
    used = proj_min * (4 / 6) + (proj_min + 6) * (2 / 6)
    assert info[pid].used == pytest.approx(used) and info[pid].source == "blend" and info[pid].games == 2
    assert info[pid].projected == pytest.approx(proj_min) and info[pid].recent == pytest.approx(proj_min + 6)
    assert adj.per_game[i, PRIM_IDX["MIN"]] == pytest.approx(used)
    factor = used / proj_min
    for k in PRIMITIVES:
        if k in ("MIN", "GP"):
            continue
        assert adj.per_game[i, PRIM_IDX[k]] == pytest.approx(snap.per_game[i, PRIM_IDX[k]] * factor)
        assert adj.per_game_sd[i, PRIM_IDX[k]] == pytest.approx(snap.per_game_sd[i, PRIM_IDX[k]] * factor)
    assert adj.per_game[i, PRIM_IDX["GP"]] == snap.per_game[i, PRIM_IDX["GP"]]


def test_players_without_logs_keep_their_projection(snap):
    frame = logs(game(1, "2026-10-21", 30))
    adj, info = adjust_minutes(snap, frame, {}, MinutesBlendConfig())
    other = snap.index[snap.players[5].player_id]
    assert snap.players[5].player_id not in info
    np.testing.assert_array_equal(adj.per_game[other], snap.per_game[other])


def test_override_wins_over_the_blend_and_works_without_logs(snap):
    pid = snap.players[1].player_id
    i = snap.index[pid]
    frame = logs(game(2, "2026-10-21", 40), game(2, "2026-10-23", 40))
    adj, info = adjust_minutes(snap, frame, {pid: 8.0}, MinutesBlendConfig())
    assert info[pid].source == "override" and info[pid].used == 8.0 and info[pid].recent == pytest.approx(40.0)
    assert adj.per_game[i, PRIM_IDX["MIN"]] == 8.0
    no_logs, info2 = adjust_minutes(snap, None, {pid: 8.0}, MinutesBlendConfig())
    assert info2[pid].source == "override" and info2[pid].recent is None and info2[pid].games == 0
    assert no_logs.per_game[i, PRIM_IDX["MIN"]] == 8.0


def test_zero_override_zeroes_every_counting_stat_but_keeps_games(snap):
    pid = snap.players[2].player_id
    i = snap.index[pid]
    adj, _ = adjust_minutes(snap, None, {pid: 0.0}, MinutesBlendConfig())
    for k in PRIMITIVES:
        if k == "GP":
            assert adj.per_game[i, PRIM_IDX[k]] == snap.per_game[i, PRIM_IDX[k]]
        else:
            assert adj.per_game[i, PRIM_IDX[k]] == 0.0


def test_stat_scale_is_capped_so_garbage_time_rates_do_not_explode(snap):
    pid = snap.players[3].player_id
    i = snap.index[pid]
    proj_min = float(snap.per_game[i, PRIM_IDX["MIN"]])
    adj, info = adjust_minutes(snap, None, {pid: proj_min * 5}, MinutesBlendConfig(max_scale=2.0))
    assert adj.per_game[i, PRIM_IDX["MIN"]] == pytest.approx(proj_min * 5)
    assert adj.per_game[i, PRIM_IDX["PTS"]] == pytest.approx(snap.per_game[i, PRIM_IDX["PTS"]] * 2.0)
    assert info[pid].used == pytest.approx(proj_min * 5)


def test_blend_can_be_disabled_leaving_only_overrides(snap):
    a, b = snap.players[0].player_id, snap.players[1].player_id
    frame = logs(game(1, "2026-10-21", 40), game(2, "2026-10-21", 40))
    adj, info = adjust_minutes(snap, frame, {b: 12.0}, MinutesBlendConfig(), blend=False)
    assert a not in info and info[b].source == "override"
    np.testing.assert_array_equal(adj.per_game[snap.index[a]], snap.per_game[snap.index[a]])


def test_adjusted_snapshot_has_a_distinct_deterministic_id_and_leaves_the_original_alone(snap):
    pid = snap.players[0].player_id
    before = snap.per_game.copy()
    one, _ = adjust_minutes(snap, None, {pid: 30.0}, MinutesBlendConfig())
    same, _ = adjust_minutes(snap, None, {pid: 30.0}, MinutesBlendConfig())
    other, _ = adjust_minutes(snap, None, {pid: 31.0}, MinutesBlendConfig())
    untouched, info = adjust_minutes(snap, None, {}, MinutesBlendConfig())
    assert one.snapshot_id != snap.snapshot_id and one.snapshot_id == same.snapshot_id != other.snapshot_id
    assert untouched is snap and info == {}
    np.testing.assert_array_equal(snap.per_game, before)
