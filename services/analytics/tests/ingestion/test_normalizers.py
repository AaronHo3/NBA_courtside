import math

import pandas as pd
import pyarrow as pa
import pytest

from app.data.schemas import schema_for, to_arrow
from app.ingestion.normalize import (
    combine,
    defense_dash,
    game_logs,
    lineups,
    matchups,
    on_off,
    player_season,
    players,
    shots,
    team_season,
    teams,
)
from tests.ingestion.conftest import BOS, LAL, NYK, RS, SEASON


def _assert_conforms(df: pd.DataFrame, family: str) -> None:
    assert list(df.columns) == schema_for(family).names
    table = to_arrow(df.assign(source="t", fetched_at=pd.Timestamp.now(tz="UTC")), family)
    assert isinstance(table, pa.Table)


def _isnull(v) -> bool:
    return v is None or (isinstance(v, float) and math.isnan(v)) or v is pd.NA


class TestTeams:
    def test_static_teams(self, teams_df):
        _assert_conforms(teams_df, "teams")
        assert len(teams_df) == 30
        bos = teams_df.set_index("abbreviation").loc["BOS"]
        assert (
            bos["team_id"] == BOS and bos["conference"] == "East" and bos["division"] == "Atlantic"
        )

    def test_abbreviation_index_aliases(self, teams_df):
        idx = teams.abbreviation_index(teams_df)
        assert idx["NYK"] == NYK and idx["NJN"] == idx["BKN"]


class TestPlayers:
    def test_normalize_players(self, fx):
        df = players.normalize_players(fx("commonallplayers"))
        _assert_conforms(df, "players")
        assert len(df) == 5
        row = df.set_index("player_id").loc[1001]
        assert (
            row["full_name"] == "Tom Traded"
            and row["first_name"] == "Tom"
            and row["last_name"] == "Traded"
        )
        assert row["from_year"] == 2012 and row["to_year"] == 2024 and bool(row["is_active"])
        assert not bool(df.set_index("player_id").loc[1005, "is_active"])
        assert _isnull(row["height_in"]) and _isnull(row["birthdate"])

    def test_height_parsing(self):
        assert players.parse_height_inches("6-7") == 79.0
        assert players.parse_height_inches("7-0") == 84.0
        assert players.parse_height_inches("") is None
        assert players.parse_height_inches(None) is None
        assert players.parse_height_inches("tall") is None

    def test_bio_enrichment(self, fx):
        base = players.normalize_players(fx("commonallplayers"))
        bios = pd.concat(
            [
                players.normalize_player_bio(fx(f"commonplayerinfo__player_{p}"))
                for p in (1001, 1002)
            ]
        )
        merged = players.merge_bios(base, bios)
        _assert_conforms(merged, "players")
        tom = merged.set_index("player_id").loc[1001]
        assert tom["height_in"] == 79.0 and tom["weight_lb"] == 215.0
        assert str(tom["birthdate"]) == "1990-03-14" and tom["country"] == "USA"
        assert tom["draft_year"] == 2012 and tom["draft_round"] == 1 and tom["draft_number"] == 7
        assert tom["height_source"] == players.HEIGHT_SOURCE_ROSTER
        ben = merged.set_index("player_id").loc[1002]
        assert (
            _isnull(ben["height_in"]) and _isnull(ben["weight_lb"]) and _isnull(ben["draft_year"])
        )
        assert _isnull(ben["height_source"])
        assert _isnull(merged.set_index("player_id").loc[1003, "height_in"])
        assert _isnull(base.set_index("player_id").loc[1001, "height_in"])  # input untouched


class TestCombine:
    def test_blank_is_null(self, fx):
        df = combine.normalize_combine_anthro(
            fx("draftcombineplayeranthro"), combine_season="2019-20"
        )
        _assert_conforms(df, "combine_anthro")
        nick = df.set_index("player_id").loc[1003]
        assert (
            nick["height_wo_shoes_in"] == 76.25
            and nick["weight_lb"] == 205.2
            and nick["hand_width_in"] == 9.25
        )
        lou = df.set_index("player_id").loc[1004]
        assert (
            _isnull(lou["weight_lb"])
            and _isnull(lou["wingspan_in"])
            and _isnull(lou["body_fat_pct"])
        )
        assert (df["combine_season"] == "2019-20").all()


class TestPlayerSeason:
    def _build(self, fx, *, league_adv=True):
        team_payloads = [
            (
                fx(f"leaguedashplayerstats__Base__team_{t}"),
                fx(f"leaguedashplayerstats__Advanced__team_{t}"),
            )
            for t in (BOS, NYK, LAL)
        ]
        return player_season.normalize_player_season(
            fx("leaguedashplayerstats__Base"),
            fx("leaguedashplayerstats__Advanced") if league_adv else None,
            team_payloads,
            season=SEASON,
            season_type=RS,
        )

    def test_traded_player_stints_and_single_aggregate(self, fx):
        df = self._build(fx)
        _assert_conforms(df, "player_season")
        tom = df[df["player_id"] == 1001]
        stints = tom[~tom["is_aggregate"].astype(bool)]
        aggregates = tom[tom["is_aggregate"].astype(bool)]
        assert len(stints) == 2 and set(stints["team_id"]) == {BOS, NYK}
        assert len(aggregates) == 1
        agg = aggregates.iloc[0]
        assert agg["team_id"] == 0 and agg["team_abbreviation"] == "TOT"
        for col in ("gp", "min", "pts", "fga", "fgm", "dd2", "td3", "w", "l"):
            assert agg[col] == stints[col].sum(), col
        assert agg["usg_pct"] == 0.28 and agg["poss"] == 4500

    def test_single_team_players_have_no_aggregate(self, fx):
        df = self._build(fx)
        for pid in (1002, 1003, 1004):
            rows = df[df["player_id"] == pid]
            assert len(rows) == 1 and not bool(rows.iloc[0]["is_aggregate"])
        assert (df["season"] == SEASON).all() and (df["season_type"] == RS).all()

    def test_advanced_columns_from_response_headers(self, fx):
        df = self._build(fx).set_index(["player_id", "team_id"])
        assert df.loc[(1002, BOS), "off_rating"] == 118.0 and df.loc[(1002, BOS), "usg_pct"] == 0.18
        assert df.loc[(1002, BOS), "pie"] == 0.12 and df.loc[(1002, BOS), "poss"] == 3100
        # eFG%/TS% are recomputed from the stored totals (same public formula the provider uses)
        assert df.loc[(1002, BOS), "ts_pct"] == pytest.approx(590 / (2 * (480 + 0.44 * 150)))
        assert _isnull(df.loc[(1004, LAL), "off_rating"])  # null stays null

    def test_missing_advanced_payload_leaves_nulls(self, fx):
        df = self._build(fx, league_adv=False)
        agg = df[(df["player_id"] == 1001) & df["is_aggregate"].astype(bool)].iloc[0]
        assert agg["gp"] == 70 and agg["age"] == 34.0 and _isnull(agg["usg_pct"])
        stint = df[(df["player_id"] == 1001) & (df["team_id"] == BOS)].iloc[0]
        assert stint["usg_pct"] == 0.27  # stint rows still carry advanced

    def test_aggregate_built_when_provider_lacks_league_row(self, fx):
        league = fx("leaguedashplayerstats__Base")
        rs = league["resultSets"][0]
        trimmed = {
            **league,
            "resultSets": [{**rs, "rowSet": [r for r in rs["rowSet"] if r[0] != 1001]}],
        }
        team_payloads = [(fx(f"leaguedashplayerstats__Base__team_{t}"), None) for t in (BOS, NYK)]
        df = player_season.normalize_player_season(
            trimmed, None, team_payloads, season=SEASON, season_type=RS
        )
        agg = df[(df["player_id"] == 1001) & df["is_aggregate"].astype(bool)]
        assert (
            len(agg) == 1
            and agg.iloc[0]["pts"] == 560 + 840
            and agg.iloc[0]["team_abbreviation"] == "TOT"
        )


class TestTeamSeason:
    def test_merge_three_measure_types(self, fx):
        df = team_season.normalize_team_season(
            fx("leaguedashteamstats__Base"),
            fx("leaguedashteamstats__Advanced"),
            fx("leaguedashteamstats__Four_Factors"),
            season=SEASON,
            season_type=RS,
        )
        _assert_conforms(df, "team_season")
        bos = df.set_index("team_id").loc[BOS]
        assert bos["gp"] == 82 and bos["pts"] == 9700 and bos["off_rating"] == 119.5
        assert bos["opp_efg_pct"] == 0.52 and bos["opp_fta_rate"] == 0.22
        assert (
            bos["opp_tov_pct"] == 0.14 and bos["opp_oreb_pct"] == 0.25 and bos["fta_rate"] == 0.236
        )

    def test_missing_four_factors(self, fx):
        df = team_season.normalize_team_season(
            fx("leaguedashteamstats__Base"), None, None, season=SEASON, season_type=RS
        )
        assert len(df) == 3 and df["opp_efg_pct"].isna().all() and df["off_rating"].isna().all()


class TestGameLogs:
    def test_home_and_opponent(self, fx, teams_df):
        abbr = teams.abbreviation_index(teams_df)
        df = game_logs.normalize_player_game_logs(
            fx("playergamelogs"), season=SEASON, season_type=RS, abbreviations=abbr
        )
        _assert_conforms(df, "player_game_logs")
        first = df.iloc[0]
        assert (
            bool(first["home"])
            and first["opponent_team_id"] == NYK
            and str(first["game_date"]) == "2024-10-22"
        )
        second = df.iloc[1]
        assert (
            not bool(second["home"])
            and second["opponent_team_id"] == BOS
            and second["team_id"] == NYK
        )
        assert df.iloc[3]["opponent_team_id"] == BOS and df.iloc[3]["wl"] == "W"

    def test_team_logs(self, fx, teams_df):
        abbr = teams.abbreviation_index(teams_df)
        df = game_logs.normalize_team_game_logs(
            fx("teamgamelogs"), season=SEASON, season_type=RS, abbreviations=abbr
        )
        _assert_conforms(df, "team_game_logs")
        assert list(df["home"]) == [True, False] and list(df["opponent_team_id"]) == [NYK, BOS]
        assert df.iloc[0]["pts"] == 118

    def test_parse_matchup(self):
        assert game_logs.parse_matchup("BOS vs. NYK") == (True, "NYK")
        assert game_logs.parse_matchup("BOS @ NYK") == (False, "NYK")
        assert game_logs.parse_matchup(None) == (None, None)


class TestShots:
    def test_zone_labels_verbatim_and_home(self, fx, teams_df):
        df = shots.normalize_shots(
            [fx("shotchartdetail")], season=SEASON, season_type=RS, teams=teams_df
        )
        _assert_conforms(df, "shots")
        assert len(df) == 4
        first = df.iloc[0]
        assert (
            first["shot_zone_basic"] == "Above the Break 3"
            and first["shot_zone_area"] == "Center(C)"
        )
        assert first["shot_zone_range"] == "24+ ft."
        assert bool(first["home"]) and first["opponent_team_id"] == NYK and first["team_id"] == BOS
        nyk_shot = df.iloc[1]
        assert not bool(nyk_shot["home"]) and nyk_shot["opponent_team_id"] == BOS
        assert str(first["game_date"]) == "2024-10-22" and first["shot_made_flag"] == 1
        assert first["loc_x"] == -12 and first["loc_y"] == 250 and first["shot_distance"] == 25

    def test_league_zone_avg(self, fx):
        df = shots.normalize_league_zone_avg(fx("shotchartdetail"), season=SEASON, season_type=RS)
        _assert_conforms(df, "shot_league_zone_avg")
        assert (
            len(df) == 3
            and df.iloc[0]["fga"] == 18000
            and df.iloc[0]["shot_zone_range"] == "24+ ft."
        )

    def test_per_team_payloads_dedupe(self, fx, teams_df):
        df = shots.normalize_shots(
            [
                fx(f"shotchartdetail__team_{BOS}"),
                fx(f"shotchartdetail__team_{NYK}"),
                fx("shotchartdetail"),
            ],
            season=SEASON,
            season_type=RS,
            teams=teams_df,
        )
        assert len(df) == 4

    def test_merge_shots_dedupes_on_event(self, fx, teams_df):
        existing = shots.normalize_shots(
            [fx("shotchartdetail")], season=SEASON, season_type=RS, teams=teams_df
        )
        incoming = shots.normalize_shots(
            [fx("shotchartdetail__player_1001")], season=SEASON, season_type=RS, teams=teams_df
        )
        merged = shots.merge_shots(existing, incoming)
        assert len(merged) == 5 and len(existing) == 4
        assert merged.duplicated(subset=["game_id", "game_event_id"]).sum() == 0


class TestMatchups:
    def test_normalize(self, fx):
        df = matchups.normalize_matchups(
            [fx("leagueseasonmatchups")], season=SEASON, season_type=RS
        )
        _assert_conforms(df, "matchups")
        assert len(df) == 3
        row = df.set_index(["off_player_id", "def_player_id"]).loc[(1001, 1003)]
        assert row["partial_poss"] == 30.5 and row["matchup_fga"] == 11 and row["help_fga"] == 2
        nulls = df.set_index(["off_player_id", "def_player_id"]).loc[(1003, 1001)]
        assert _isnull(nulls["help_blk"]) and _isnull(nulls["help_fga"])
        assert _isnull(row["matchup_min"]) or isinstance(row["matchup_min"], float)


class TestDefenseDash:
    def test_categories(self, fx):
        payloads = [
            (c, fx(f"leaguedashptdefend__{c.replace(' ', '_')}"))
            for c in defense_dash.DEFENSE_CATEGORIES
        ]
        df = defense_dash.normalize_defense_dash(payloads, season=SEASON, season_type=RS)
        _assert_conforms(df, "defense_dash")
        assert len(df) == 12 and set(df["defense_category"]) == set(defense_dash.DEFENSE_CATEGORIES)
        overall = df[(df["defense_category"] == "Overall") & (df["player_id"] == 1002)].iloc[0]
        assert (
            overall["team_id"] == BOS
            and overall["d_fga"] == 620
            and overall["normal_fg_pct"] == 0.471
        )
        assert overall["gp"] == 60 and overall["g"] == 60 and overall["freq"] == 1.0


class TestLineups:
    def test_merge_and_group_ids(self, fx):
        df = lineups.normalize_lineups(
            fx("leaguedashlineups__Base"),
            fx("leaguedashlineups__Advanced"),
            season=SEASON,
            season_type=RS,
        )
        _assert_conforms(df, "lineups")
        assert len(df) == 2
        bos = df[df["team_id"] == BOS].iloc[0]
        assert list(bos["player_ids"]) == [1001, 1002, 2001, 2002, 2003]
        assert (
            bos["off_rating"] == 121.3
            and bos["poss"] == 640
            and bos["pts"] == 770
            and bos["gp"] == 25
        )

    def test_parse_group_id(self):
        assert lineups.parse_group_id("-1-22-333-") == [1, 22, 333]
        assert lineups.parse_group_id(None) == []


class TestOnOff:
    def test_on_and_off(self, fx):
        df = on_off.normalize_on_off(
            [fx("teamplayeronoffsummary__Advanced")], season=SEASON, season_type=RS
        )
        _assert_conforms(df, "on_off")
        assert len(df) == 6 and set(df["court_status"]) == {"On", "Off"}
        on = df[(df["player_id"] == 1001) & (df["court_status"] == "On")].iloc[0]
        off = df[(df["player_id"] == 1001) & (df["court_status"] == "Off")].iloc[0]
        assert on["team_id"] == BOS and on["min"] == 900.0 and on["net_rating"] == 9.3
        assert off["gp"] == 52 and off["off_rating"] == 119.9


def test_stint_team_comes_from_the_request_filter_not_the_response():
    """The provider stamps per-team rows with the player's current team; stints must not collapse."""
    from app.ingestion.normalize.player_season import normalize_player_season

    def payload(rows):
        return {
            "resultSets": [
                {
                    "name": "LeagueDashPlayerStats",
                    "headers": [
                        "PLAYER_ID",
                        "TEAM_ID",
                        "TEAM_ABBREVIATION",
                        "GP",
                        "MIN",
                        "PTS",
                        "FGM",
                        "FGA",
                        "TM_TOV_PCT",
                    ],
                    "rowSet": rows,
                }
            ]
        }

    league = payload([[7, 200, "NYK", 60, 1500.0, 900, 300, 700, 12.5]])
    league_adv = {
        "resultSets": [
            {
                "name": "LeagueDashPlayerStats",
                "headers": ["PLAYER_ID", "TEAM_ID", "TM_TOV_PCT", "USG_PCT"],
                "rowSet": [[7, 200, 12.5, 0.31]],
            }
        ]
    }
    bos = payload(
        [[7, 200, "NYK", 20, 500.0, 300, 100, 250, 11.0]]
    )  # played for BOS, reported as NYK
    nyk = payload([[7, 200, "NYK", 40, 1000.0, 600, 200, 450, 13.0]])
    out = normalize_player_season(
        league,
        league_adv,
        [(100, bos, None), (200, nyk, None)],
        season="2025-26",
        season_type="Regular Season",
        team_abbreviations={100: "BOS", 200: "NYK"},
    )
    stints = out[~out.is_aggregate].sort_values("team_id")
    assert stints["team_id"].tolist() == [100, 200]
    assert stints["team_abbreviation"].tolist() == ["BOS", "NYK"]
    agg = out[out.is_aggregate]
    assert len(agg) == 1 and agg.iloc[0]["gp"] == 60 and agg.iloc[0]["team_id"] == 0
    assert abs(agg.iloc[0]["tm_tov_pct"] - 0.125) < 1e-9  # 0-100 harmonised to a fraction


def test_defense_dash_resolves_per_category_column_names():
    from app.ingestion.normalize.defense_dash import normalize_defense_dash

    common = [
        "CLOSE_DEF_PERSON_ID",
        "PLAYER_NAME",
        "PLAYER_LAST_TEAM_ID",
        "PLAYER_LAST_TEAM_ABBREVIATION",
        "PLAYER_POSITION",
        "AGE",
        "GP",
        "G",
        "FREQ",
    ]

    def payload(cols, row):
        return {
            "resultSets": [
                {
                    "name": "LeagueDashPTDefend",
                    "headers": [*common, *cols],
                    "rowSet": [[9, "A", 1, "BOS", "G", 25.0, 70, 65, 0.3, *row]],
                }
            ]
        }

    out = normalize_defense_dash(
        [
            (
                "Overall",
                payload(
                    ["D_FGM", "D_FGA", "D_FG_PCT", "NORMAL_FG_PCT", "PCT_PLUSMINUS"],
                    [100, 220, 0.455, 0.47, -0.015],
                ),
            ),
            (
                "3 Pointers",
                payload(
                    ["FG3M", "FG3A", "FG3_PCT", "NS_FG3_PCT", "PLUSMINUS"],
                    [30, 90, 0.333, 0.36, -0.027],
                ),
            ),
            (
                "Less Than 6Ft",
                payload(
                    ["FGM_LT_06", "FGA_LT_06", "LT_06_PCT", "NS_LT_06_PCT", "PLUSMINUS"],
                    [40, 60, 0.667, 0.64, 0.027],
                ),
            ),
        ],
        season="2025-26",
        season_type="Regular Season",
    )
    by = out.set_index("defense_category")
    assert by.loc["3 Pointers", "d_fgm"] == 30 and by.loc["3 Pointers", "d_fga"] == 90
    assert abs(by.loc["3 Pointers", "normal_fg_pct"] - 0.36) < 1e-9
    assert (
        by.loc["Less Than 6Ft", "d_fga"] == 60
        and abs(by.loc["Less Than 6Ft", "normal_fg_pct"] - 0.64) < 1e-9
    )
    assert by.loc["Overall", "d_fga"] == 220


def test_bio_positions_are_abbreviated_like_the_dashboards():
    from app.ingestion.normalize.players import abbreviate_position

    assert abbreviate_position("Guard") == "G"
    assert abbreviate_position("Forward-Guard") == "F-G"
    assert abbreviate_position("Center-Forward") == "C-F"
    assert abbreviate_position("") is None and abbreviate_position(None) is None
