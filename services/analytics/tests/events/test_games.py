"""`games` family derived from team game logs: one row per game, ids as strings, nulls not zeros."""

import datetime as dt

import pandas as pd

from app.data.schemas import schema_for
from app.events.games import GAMES_SOURCE_ENDPOINT, derive_games, inconsistent_game_ids

BOS, NYK, LAL = 1610612738, 1610612752, 1610612747
RS = "Regular Season"


def _log(team, opp, game_id, home, pts, date="2024-10-22", wl="W"):
    return {
        "team_id": team,
        "season": "2024-25",
        "season_type": RS,
        "game_id": game_id,
        "game_date": dt.date.fromisoformat(date),
        "matchup": "x",
        "home": home,
        "opponent_team_id": opp,
        "wl": wl,
        "pts": float(pts),
    }


def test_two_team_rows_become_one_final_game():
    logs = pd.DataFrame(
        [
            _log(BOS, NYK, "0022400001", True, 120),
            _log(NYK, BOS, "0022400001", False, 115, wl="L"),
        ]
    )
    games = derive_games(logs)
    assert list(games.columns) == schema_for("games").names
    assert len(games) == 1
    g = games.iloc[0]
    assert g["game_id"] == "0022400001"
    assert g["home_team_id"] == BOS and g["away_team_id"] == NYK
    assert g["home_score"] == 120 and g["away_score"] == 115
    assert g["status"] == "final"
    assert g["game_date"] == dt.date(2024, 10, 22)
    assert g["season"] == "2024-25" and g["season_type"] == RS
    assert g["source_endpoint"] == GAMES_SOURCE_ENDPOINT
    assert pd.isna(g["periods"]) and pd.isna(g["attendance"]) and pd.isna(g["arena"])


def test_single_row_game_keeps_both_ids_and_nulls_the_missing_score():
    logs = pd.DataFrame([_log(LAL, BOS, "0022400002", False, 99)])
    games = derive_games(logs)
    g = games.iloc[0]
    assert g["home_team_id"] == BOS and g["away_team_id"] == LAL
    assert g["away_score"] == 99 and pd.isna(g["home_score"])
    assert g["status"] == "final"


def test_incomplete_games_are_reported():
    from app.events.games import incomplete_game_ids

    logs = pd.DataFrame(
        [
            _log(BOS, NYK, "0022400001", True, 120),
            _log(NYK, BOS, "0022400001", False, 115),
            _log(LAL, BOS, "0022400002", False, 99),
        ]
    )
    assert incomplete_game_ids(logs) == ["0022400002"]


def test_contradictory_home_flags_are_reported_not_guessed():
    logs = pd.DataFrame(
        [
            _log(BOS, NYK, "0022400003", True, 100),
            _log(NYK, BOS, "0022400003", True, 90),  # both claim home
        ]
    )
    assert inconsistent_game_ids(logs) == ["0022400003"]
    games = derive_games(logs)
    assert len(games) == 1 and games.iloc[0]["status"] == "final"


def test_leading_zeros_survive_and_output_is_sorted_by_date_then_id():
    logs = pd.DataFrame(
        [
            _log(BOS, NYK, "0022400010", True, 1, date="2024-10-23"),
            _log(NYK, BOS, "0022400010", False, 2, date="2024-10-23"),
            _log(LAL, BOS, "0022400002", False, 3, date="2024-10-22"),
        ]
    )
    games = derive_games(logs)
    assert games["game_id"].tolist() == ["0022400002", "0022400010"]
    assert games["game_id"].map(type).eq(str).all()


def test_empty_input_gives_empty_conformed_frame():
    games = derive_games(pd.DataFrame())
    assert games.empty and list(games.columns) == schema_for("games").names


def test_neutral_site_game_is_flagged_not_treated_as_inconsistent():
    """Mexico City / Paris / NBA Cup games: both rows say '@', so nobody was home."""
    from app.events.games import neutral_site_game_ids

    logs = pd.DataFrame(
        [
            _log(NYK, BOS, "0022400147", False, 118),
            _log(BOS, NYK, "0022400147", False, 98, wl="L"),
        ]
    )
    assert neutral_site_game_ids(logs) == ["0022400147"]
    assert inconsistent_game_ids(logs) == []
    g = derive_games(logs).iloc[0]
    assert g["neutral_site"] is True or g["neutral_site"] == True  # noqa: E712 - pandas boolean
    # slots are deterministic (lower team id first) so re-derivation is stable; scores follow teams
    assert g["home_team_id"] == BOS and g["away_team_id"] == NYK
    assert g["home_score"] == 98 and g["away_score"] == 118


def test_ordinary_games_are_not_neutral_site():
    logs = pd.DataFrame(
        [
            _log(BOS, NYK, "0022400001", True, 120),
            _log(NYK, BOS, "0022400001", False, 115, wl="L"),
            _log(LAL, BOS, "0022400002", False, 99),
        ]
    )
    games = derive_games(logs)
    assert games["neutral_site"].tolist() == [False, False]
