import numpy as np
import pyarrow.parquet as pq

from app.analytics.court import classify_provider
from app.data.parquet_io import read_family
from app.data.schemas import FAMILIES
from app.demo.config import SOURCE, DemoConfig
from app.demo.generate import generate_demo
from app.demo.names import REAL_NBA_NICKNAMES

from .conftest import SMALL

DETAIL = "2024-25"
RS = "Regular Season"


def _ps(layout):
    return read_family(layout, "player_season")


class TestManifestAndProvenance:
    def test_all_families_written(self, demo_manifest):
        from app.data.schemas import SNAPSHOT_FAMILIES

        families = {e.family for e in demo_manifest.entries if e.status == "ok"}
        assert (
            set(FAMILIES) - set(SNAPSHOT_FAMILIES) <= families
        )  # snapshots are exports, not generated

    def test_detail_only_families_marked_missing_for_other_seasons(self, demo_manifest):
        e = demo_manifest.find("shots", "2023-24", RS)
        assert e is not None and e.status == "missing"
        assert demo_manifest.find("shots", DETAIL, RS).status == "ok"

    def test_playoffs_marked_missing_with_note(self, demo_manifest):
        e = demo_manifest.find("player_season", DETAIL, "Playoffs")
        assert e is not None and e.status == "missing" and e.note

    def test_source_is_labelled_synthetic(self, demo_layout):
        for fam in ["players", "player_season", "shots", "matchups"]:
            df = read_family(demo_layout, fam)
            assert (df["source"] == SOURCE).all()
            assert df["fetched_at"].notna().all()


class TestIdentities:
    def test_team_names_are_fictional(self, demo_layout):
        teams = read_family(demo_layout, "teams")
        assert len(teams) == SMALL.n_teams
        assert not set(teams["name"]) & set(REAL_NBA_NICKNAMES)
        assert teams["team_id"].min() >= 9_000_000

    def test_player_ids_cannot_collide_with_provider_ids(self, demo_layout):
        players = read_family(demo_layout, "players")
        assert players["player_id"].min() >= 9_000_000
        assert players["player_id"].is_unique
        assert players["height_in"].notna().all()
        assert players["height_source"].str.contains("synthetic").all()

    def test_combine_has_nulls_not_zeros(self, demo_layout):
        anthro = read_family(demo_layout, "combine_anthro")
        assert len(anthro) > 0
        assert (anthro["wingspan_in"].dropna() > 60).all()
        assert anthro["wingspan_in"].isna().any() or anthro["hand_length_in"].isna().any()
        assert anthro["player_id"].is_unique


class TestInternalConsistency:
    def test_season_totals_equal_summed_game_logs(self, demo_layout):
        ps = _ps(demo_layout)
        ps = ps[(ps.season == DETAIL) & (~ps.is_aggregate)]
        logs = read_family(demo_layout, "player_game_logs")
        logs = logs[logs.season == DETAIL]
        summed = logs.groupby(["player_id", "team_id"])[
            ["fga", "fgm", "fg3a", "fg3m", "fta", "ftm", "pts", "ast", "reb", "tov", "min"]
        ].sum()
        gp = logs.groupby(["player_id", "team_id"]).size().rename("gp")
        merged = (
            ps.set_index(["player_id", "team_id"])
            .join(summed, rsuffix="_log")
            .join(gp, rsuffix="_log")
        )
        for c in ["fga", "fgm", "fg3a", "fg3m", "fta", "ftm", "pts", "ast", "reb", "tov"]:
            assert np.allclose(merged[c], merged[f"{c}_log"]), c
        assert np.allclose(merged["min"], merged["min_log"])
        assert (merged["gp"] == merged["gp_log"]).all()

    def test_shots_match_attempts_and_makes(self, demo_layout):
        ps = _ps(demo_layout)
        ps = ps[(ps.season == DETAIL) & (~ps.is_aggregate)].set_index(["player_id", "team_id"])
        shots = read_family(demo_layout, "shots")
        g = shots.groupby(["player_id", "team_id"])
        fga = g.size()
        fgm = g["shot_made_flag"].sum()
        fg3a = g["shot_type"].apply(lambda s: (s == "3PT Field Goal").sum())
        assert (ps["fga"] == fga.reindex(ps.index).fillna(0)).all()
        assert (ps["fgm"] == fgm.reindex(ps.index).fillna(0)).all()
        assert (ps["fg3a"] == fg3a.reindex(ps.index).fillna(0)).all()

    def test_shot_zone_labels_match_geometry(self, demo_layout):
        shots = read_family(demo_layout, "shots").sample(500, random_state=1)
        for row in shots.itertuples():
            z = classify_provider(row.loc_x, row.loc_y)
            assert row.shot_zone_basic == z["shot_zone_basic"]
            assert row.shot_zone_area == z["shot_zone_area"]
            assert row.shot_zone_range == z["shot_zone_range"]
            assert row.shot_type == z["shot_type"]
            assert row.shot_distance == z["shot_distance"]
        assert shots["event_type"].isin(["Made Shot", "Missed Shot"]).all()
        assert ((shots.event_type == "Made Shot") == (shots.shot_made_flag == 1)).all()

    def test_league_zone_averages_match_shots(self, demo_layout):
        shots = read_family(demo_layout, "shots")
        avg = read_family(demo_layout, "shot_league_zone_avg")
        assert avg["fga"].sum() == len(shots)
        assert avg["fgm"].sum() == shots["shot_made_flag"].sum()

    def test_team_game_logs_are_consistent(self, demo_layout):
        tl = read_family(demo_layout, "team_game_logs")
        tl = tl[tl.season == DETAIL]
        assert (tl.groupby("team_id").size() == SMALL.games_per_team).all()
        by_game = tl.groupby("game_id")
        assert (by_game.size() == 2).all()
        for _, g in by_game:
            a, b = g.iloc[0], g.iloc[1]
            assert a.pts != b.pts  # no ties in regulation demo data
            assert (a.wl == "W") == (a.pts > b.pts)
            assert a.opponent_team_id == b.team_id and b.opponent_team_id == a.team_id
            assert a.home != b.home
        pl = read_family(demo_layout, "player_game_logs")
        pl = pl[pl.season == DETAIL]
        team_pts_from_players = pl.groupby(["game_id", "team_id"])["pts"].sum()
        tl_pts = tl.set_index(["game_id", "team_id"])["pts"]
        assert (team_pts_from_players.reindex(tl_pts.index) == tl_pts).all()

    def test_team_season_equals_summed_team_logs(self, demo_layout):
        ts = read_family(demo_layout, "team_season")
        ts = ts[ts.season == DETAIL].set_index("team_id")
        tl = read_family(demo_layout, "team_game_logs")
        tl = tl[tl.season == DETAIL].groupby("team_id")[["pts", "fga", "fgm"]].sum()
        assert np.allclose(ts["pts"], tl["pts"].reindex(ts.index))
        assert (ts["w"] + ts["l"] == SMALL.games_per_team).all()
        assert ts["off_rating"].between(80, 140).all()
        assert ts["pace"].between(80, 120).all()


class TestTradedPlayers:
    def test_traded_players_have_stints_and_one_aggregate(self, demo_layout):
        ps = _ps(demo_layout)
        ps = ps[ps.season == DETAIL]
        counts = ps[~ps.is_aggregate].groupby("player_id").size()
        traded = counts[counts > 1].index
        assert len(traded) > 0
        for pid in traded:
            rows = ps[ps.player_id == pid]
            agg = rows[rows.is_aggregate]
            stints = rows[~rows.is_aggregate]
            assert len(agg) == 1 and agg.iloc[0].team_id == 0
            assert agg.iloc[0].team_abbreviation == "TOT"
            assert agg.iloc[0].pts == stints["pts"].sum()
            assert agg.iloc[0].gp == stints["gp"].sum()
        single = counts[counts == 1].index
        assert not ps[(ps.player_id.isin(single)) & ps.is_aggregate].shape[0]

    def test_advanced_fields_present_and_sane(self, demo_layout):
        ps = _ps(demo_layout)
        ps = ps[(ps.season == DETAIL) & (ps.gp >= 5)]
        assert ps["usg_pct"].between(0.02, 0.5).all()  # fraction, like the provider
        assert ps["pie"].notna().all()
        assert ps["poss"].gt(0).all()
        assert ps["off_rating"].between(70, 150).all()
        assert ps["age"].between(18, 45).all()


class TestMatchupsDefenseLineupsOnOff:
    def test_matchups_are_cross_team_and_bounded_by_totals(self, demo_layout):
        mu = read_family(demo_layout, "matchups")
        assert len(mu) > 0
        assert (mu.off_player_id != mu.def_player_id).all()
        ps = _ps(demo_layout)
        ps = ps[ps.season == DETAIL]
        ps = ps[ps.is_aggregate | ~ps.player_id.duplicated(keep=False)]
        totals = ps.set_index("player_id")["fga"]
        per_off = mu.groupby("off_player_id")["matchup_fga"].sum()
        assert (per_off <= totals.reindex(per_off.index) + 1e-9).all()
        assert (mu["matchup_fgm"] <= mu["matchup_fga"]).all()
        assert mu["help_fga"].isna().all()  # not modelled -> null, never zero

    def test_defense_dash_categories(self, demo_layout):
        dd = read_family(demo_layout, "defense_dash")
        cats = set(dd["defense_category"])
        assert {
            "Overall",
            "3 Pointers",
            "2 Pointers",
            "Less Than 6Ft",
            "Less Than 10Ft",
            "Greater Than 15Ft",
        } <= cats
        overall = dd[dd.defense_category == "Overall"]
        assert (overall["d_fgm"] <= overall["d_fga"]).all()
        assert overall["normal_fg_pct"].between(0.2, 0.8).all()

    def test_lineups_have_five_roster_players(self, demo_layout):
        lu = read_family(demo_layout, "lineups")
        logs = read_family(demo_layout, "player_game_logs")
        roster = logs.groupby("team_id")["player_id"].apply(set)
        for row in lu.itertuples():
            ids = list(row.player_ids)
            assert len(ids) == 5 and len(set(ids)) == 5
            assert set(ids) <= roster[row.team_id]
        assert (lu["min"] > 0).all()

    def test_on_off_rows(self, demo_layout):
        oo = read_family(demo_layout, "on_off")
        ps = _ps(demo_layout)
        ps = ps[(ps.season == DETAIL) & (~ps.is_aggregate)]
        on = oo[oo.court_status == "On"].set_index(["player_id", "team_id"])
        off = oo[oo.court_status == "Off"].set_index(["player_id", "team_id"])
        assert len(on) == len(off) == len(ps)
        joined = ps.set_index(["player_id", "team_id"]).join(on[["min"]], rsuffix="_on")
        assert np.allclose(joined["min"], joined["min_on"])
        assert oo["net_rating"].notna().all()


class TestDeterminism:
    def test_same_seed_same_output(self, tmp_path):
        a = tmp_path / "a"
        b = tmp_path / "b"
        cfg = DemoConfig(
            seed=3,
            seasons=("2024-25",),
            detail_seasons=("2024-25",),
            n_teams=4,
            roster_size=8,
            games_per_team=4,
        )
        from app.data.paths import DataLayout

        generate_demo(DataLayout(a, "demo"), cfg)
        generate_demo(DataLayout(b, "demo"), cfg)
        for fam in ["players", "player_game_logs", "shots"]:
            ta = pq.read_table(sorted((a / "demo/parquet" / fam).glob("*.parquet"))[0])
            tb = pq.read_table(sorted((b / "demo/parquet" / fam).glob("*.parquet"))[0])
            assert ta.drop_columns(["fetched_at"]).equals(tb.drop_columns(["fetched_at"]))

    def test_non_detail_seasons_have_player_seasons(self, demo_layout):
        ps = _ps(demo_layout)
        assert set(ps.season) == set(SMALL.seasons)
        assert (ps[ps.season == "2023-24"]["gp"] > 0).all()


class TestGames:
    def test_games_match_distinct_game_ids_in_team_logs(self, demo_layout):
        games = read_family(demo_layout, "games")
        logs = read_family(demo_layout, "team_game_logs")
        assert len(games) == logs["game_id"].nunique() > 0
        assert games["home_score"].notna().all() and games["away_score"].notna().all()
        assert (games["source"] == SOURCE).all()
        assert set(games["season"]) == {DETAIL} or set(games["season"]) <= set(SMALL.detail_seasons)

    def test_games_missing_for_summary_only_seasons(self, demo_manifest):
        e = demo_manifest.find("games", "2023-24", RS)
        assert e is not None and e.status == "missing"


class TestEvents:
    def test_demo_events_are_shot_only_and_labelled(self, demo_layout, demo_manifest):
        events = read_family(demo_layout, "events")
        shots = read_family(demo_layout, "shots")
        assert len(events) == len(shots) > 0
        assert (events["source_event_system"] == "demo_shots").all()
        assert (events["source"] == SOURCE).all()
        note = demo_manifest.find("events", DETAIL, RS).note or ""
        assert "shot" in note.lower()
        id_map = read_family(demo_layout, "event_id_map")
        assert len(id_map) == len(shots) and (id_map["method"] == "equal_ids").all()
        participants = read_family(demo_layout, "event_participants")
        assert len(participants) == len(shots) and (participants["role"] == "actor").all()
