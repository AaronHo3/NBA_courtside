import csv
import io

import pytest

DETAIL = "2024-25"
RS = "Regular Season"


def _ok(resp):
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    return body["data"], body.get("meta")


class TestMeta:
    def test_status_identifies_demo_namespace(self, client):
        data, _ = _ok(client.get("/api/meta/status"))
        assert data["namespace"] == "demo" and data["is_demo"] is True
        assert data["default_season"] == DETAIL
        assert data["seasons"] == [DETAIL, "2023-24"]
        assert RS in data["season_types"]
        assert data["coverage"][DETAIL][RS]["shots"] == "ok"
        assert data["coverage"]["2023-24"][RS]["shots"] == "missing"

    def test_metrics_catalog(self, client):
        data, _ = _ok(client.get("/api/meta/metrics"))
        keys = {m["key"] for m in data}
        assert {"ts_pct", "usg_pct", "wingspan_in"} <= keys
        ts = next(m for m in data if m["key"] == "ts_pct")
        assert "0.44" in ts["formula"]

    def test_court_geometry(self, client):
        data, _ = _ok(client.get("/api/meta/court"))
        assert data["three_point"]["radius"] == 23.75

    def test_teams(self, client):
        data, _ = _ok(client.get("/api/meta/teams"))
        assert len(data) == 4 and {"team_id", "abbreviation", "full_name"} <= set(data[0])

    def test_manifest(self, client):
        data, _ = _ok(client.get("/api/meta/manifest"))
        assert data["namespace"] == "demo" and len(data["entries"]) > 10


class TestPlayers:
    def test_search(self, client):
        data, _ = _ok(client.get("/api/players/search", params={"q": "a", "limit": 5}))
        assert 1 <= len(data) <= 5
        assert {"player_id", "full_name", "position", "is_active"} <= set(data[0])

    def test_search_requires_query(self, client):
        assert client.get("/api/players/search").status_code == 422

    def test_profile(self, client):
        pid = _ok(client.get("/api/players/search", params={"q": "a"}))[0][0]["player_id"]
        data, _ = _ok(client.get(f"/api/players/{pid}"))
        assert data["bio"]["player_id"] == pid
        assert data["measurements"]["roster"]["height_in"] > 60
        assert "source" in data["measurements"]["roster"]
        assert "combine" in data["measurements"]
        assert len(data["seasons"]) >= 1
        assert data["career"]["gp"] >= 1
        for s in data["seasons"]:
            assert "is_aggregate" in s
        assert data["seasons"][0]["ts_pct"] is None or 0 < data["seasons"][0]["ts_pct"] < 1

    def test_profile_404(self, client):
        r = client.get("/api/players/1")
        assert r.status_code == 404 and r.json()["success"] is False

    def test_percentiles(self, client):
        pid = _ok(client.get("/api/players/search", params={"q": "a"}))[0][0]["player_id"]
        data, _ = _ok(
            client.get(
                f"/api/players/{pid}/percentiles",
                params={"season": DETAIL, "population": "all", "min_minutes": 0},
            )
        )
        assert data["population"]["size"] > 1
        m = {x["metric"]: x for x in data["metrics"]}
        assert 0 <= m["pts"]["percentile"] <= 100
        assert m["pts"]["normalization"] == "per_game"


class TestLeagueExplorer:
    def test_default_rows_one_per_player(self, client):
        data, meta = _ok(
            client.get(
                "/api/league/explorer", params={"season": DETAIL, "min_gp": 0, "min_minutes": 0}
            )
        )
        ids = [r["player_id"] for r in data]
        assert len(ids) == len(set(ids)) == 36
        assert meta["normalization"] == "per_game"
        row = data[0]
        assert {
            "ts_pct",
            "usg_pct",
            "height_in",
            "wingspan_in",
            "team_abbreviation",
            "position",
            "age",
            "gp",
            "min",
        } <= set(row)

    def test_normalization_changes_counting_stats_only(self, client):
        tot, _ = _ok(
            client.get(
                "/api/league/explorer",
                params={"season": DETAIL, "normalization": "totals", "min_gp": 0, "min_minutes": 0},
            )
        )
        p36, _ = _ok(
            client.get(
                "/api/league/explorer",
                params={"season": DETAIL, "normalization": "per_36", "min_gp": 0, "min_minutes": 0},
            )
        )
        t = {r["player_id"]: r for r in tot}
        for r in p36:
            base = t[r["player_id"]]
            if base["min"] and base["min"] > 0:
                assert r["pts"] == pytest.approx(base["pts"] / base["min"] * 36, rel=1e-6)
            assert r["ts_pct"] == base["ts_pct"]

    def test_per_100_requires_possessions(self, client):
        data, _ = _ok(
            client.get(
                "/api/league/explorer",
                params={
                    "season": DETAIL,
                    "normalization": "per_100",
                    "min_gp": 0,
                    "min_minutes": 0,
                },
            )
        )
        assert all(r["pts"] is None or r["poss"] for r in data)

    def test_filters(self, client):
        teams, _ = _ok(client.get("/api/meta/teams"))
        tid = teams[0]["team_id"]
        data, _ = _ok(
            client.get(
                "/api/league/explorer",
                params={"season": DETAIL, "team_id": tid, "min_gp": 0, "min_minutes": 0},
            )
        )
        assert data and all(r["team_id"] == tid for r in data)
        data, _ = _ok(
            client.get(
                "/api/league/explorer",
                params={"season": DETAIL, "position": "C", "min_gp": 0, "min_minutes": 0},
            )
        )
        assert data and all("C" in r["position"].split("-") for r in data)  # F-C counts as a centre
        data, _ = _ok(
            client.get(
                "/api/league/explorer",
                params={"season": DETAIL, "min_minutes": 100, "normalization": "totals"},
            )
        )
        assert data and all(r["min"] >= 100 for r in data)

    def test_invalid_params(self, client):
        assert client.get("/api/league/explorer", params={"season": "nope"}).status_code == 422
        assert (
            client.get(
                "/api/league/explorer", params={"season": DETAIL, "normalization": "per_1"}
            ).status_code
            == 422
        )

    def test_csv_export(self, client):
        r = client.get(
            "/api/league/explorer.csv", params={"season": DETAIL, "min_gp": 0, "min_minutes": 0}
        )
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
        rows = list(csv.DictReader(io.StringIO(r.text)))
        assert len(rows) == 36 and "ts_pct" in rows[0]


class TestShots:
    @pytest.fixture(scope="class")
    def pid(self, client):
        data, _ = _ok(
            client.get(
                "/api/league/explorer",
                params={"season": DETAIL, "normalization": "totals", "min_gp": 0, "min_minutes": 0},
            )
        )
        return max(data, key=lambda r: r["fga"])["player_id"]

    def test_markers_capped_and_filterable(self, client, pid):
        data, meta = _ok(
            client.get("/api/shots/markers", params={"season": DETAIL, "player_id": pid})
        )
        assert 0 < len(data) <= 500
        assert {
            "loc_x",
            "loc_y",
            "shot_made_flag",
            "shot_zone_basic",
            "game_date",
            "period",
        } <= set(data[0])
        assert meta["total"] >= len(data)
        made, _ = _ok(
            client.get(
                "/api/shots/markers", params={"season": DETAIL, "player_id": pid, "made": "true"}
            )
        )
        assert all(s["shot_made_flag"] == 1 for s in made)
        p1, _ = _ok(
            client.get(
                "/api/shots/markers", params={"season": DETAIL, "player_id": pid, "period": 1}
            )
        )
        assert all(s["period"] == 1 for s in p1)

    def test_hexbins(self, client, pid):
        data, meta = _ok(
            client.get(
                "/api/shots/hexbins",
                params={"season": DETAIL, "player_id": pid, "size_ft": 2.5, "min_attempts": 3},
            )
        )
        assert data and {
            "q",
            "r",
            "x_ft",
            "y_ft",
            "fga",
            "fgm",
            "fg_pct",
            "rel_fg_pct",
            "low_sample",
            "pts_per_fga",
            "ci_low",
            "ci_high",
            "frequency",
        } <= set(data[0])
        assert meta["total_fga"] == sum(b["fga"] for b in data)
        assert meta["league_baseline"] == "shot_league_zone_avg"

    def test_zones(self, client, pid):
        data, _ = _ok(client.get("/api/shots/zones", params={"season": DETAIL, "player_id": pid}))
        zones = {z["zone"] for z in data}
        assert "Restricted Area" in zones
        assert all(z["league_fg_pct"] is None or 0 < z["league_fg_pct"] < 1 for z in data)

    def test_team_shots(self, client):
        teams, _ = _ok(client.get("/api/meta/teams"))
        data, meta = _ok(
            client.get(
                "/api/shots/zones", params={"season": DETAIL, "team_id": teams[0]["team_id"]}
            )
        )
        assert sum(z["fga"] for z in data) > 500

    def test_filter_options(self, client, pid):
        data, _ = _ok(client.get("/api/shots/filters", params={"season": DETAIL, "player_id": pid}))
        assert (
            data["periods"]
            and data["opponents"]
            and data["action_types"]
            and data["date_range"]["min"]
        )
        assert data["unsupported"]  # e.g. defender distance, shot clock

    def test_requires_subject(self, client):
        assert client.get("/api/shots/markers", params={"season": DETAIL}).status_code == 422

    def test_season_without_shots_is_informative(self, client, pid):
        data, meta = _ok(
            client.get("/api/shots/hexbins", params={"season": "2023-24", "player_id": pid})
        )
        assert data == [] and meta["available"] is False and meta["reason"]


class TestMatchups:
    @pytest.fixture(scope="class")
    def pid(self, client):
        data, _ = _ok(
            client.get(
                "/api/league/explorer",
                params={"season": DETAIL, "normalization": "totals", "min_gp": 0, "min_minutes": 0},
            )
        )
        return max(data, key=lambda r: r["fga"])["player_id"]

    def test_offense_view(self, client, pid):
        data, meta = _ok(
            client.get(f"/api/matchups/offense/{pid}", params={"season": DETAIL, "min_poss": 5})
        )
        assert data
        row = data[0]
        assert {
            "def_player_id",
            "def_player_name",
            "matchup_fga",
            "matchup_fgm",
            "fg_pct",
            "fg_pct_shrunk",
            "ci_low",
            "ci_high",
            "partial_poss",
            "pts_per_poss",
            "qualifies",
        } <= set(row)
        assert all(r["qualifies"] == (r["partial_poss"] >= 5) for r in data)
        assert meta["prior"]["strength"] > 0 and 0 < meta["prior"]["mean"] < 1
        assert "lowest observed" in meta["wording"]

    def test_defense_view(self, client, pid):
        data, _ = _ok(client.get(f"/api/matchups/defense/{pid}", params={"season": DETAIL}))
        assert data and "off_player_name" in data[0]

    def test_pair(self, client, pid):
        off, _ = _ok(client.get(f"/api/matchups/offense/{pid}", params={"season": DETAIL}))
        d = off[0]["def_player_id"]
        data, _ = _ok(
            client.get("/api/matchups/pair", params={"off_player_id": pid, "def_player_id": d})
        )
        assert data["seasons"] and data["total"]["matchup_fga"] >= off[0]["matchup_fga"]

    def test_heatmap(self, client):
        teams, _ = _ok(client.get("/api/meta/teams"))
        a, b = teams[0]["team_id"], teams[1]["team_id"]
        data, _ = _ok(
            client.get(
                "/api/matchups/heatmap",
                params={"season": DETAIL, "team_id": a, "opponent_team_id": b, "min_poss": 1},
            )
        )
        assert data["offense"] and data["defense"] and data["cells"]
        assert {
            "off_player_id",
            "def_player_id",
            "partial_poss",
            "pts_per_poss",
            "low_sample",
        } <= set(data["cells"][0])

    def test_availability(self, client):
        data, _ = _ok(client.get("/api/matchups/availability", params={"season": "2023-24"}))
        assert data["available"] is False and data["reason"]
        data, _ = _ok(client.get("/api/matchups/availability", params={"season": DETAIL}))
        assert data["available"] is True

    def test_defense_dashboard(self, client, pid):
        data, _ = _ok(client.get(f"/api/defense/{pid}", params={"season": DETAIL}))
        cats = {r["defense_category"] for r in data}
        assert "Overall" in cats and all("pct_plusminus" in r for r in data)


class TestTeams:
    def test_list_and_seasons(self, client):
        teams, _ = _ok(client.get("/api/teams"))
        tid = teams[0]["team_id"]
        data, _ = _ok(client.get(f"/api/teams/{tid}/seasons"))
        assert {s["season"] for s in data} == {"2023-24", DETAIL}
        assert {
            "off_rating",
            "def_rating",
            "net_rating",
            "pace",
            "efg_pct",
            "tm_tov_pct",
            "oreb_pct",
            "fta_rate",
            "w",
            "l",
        } <= set(data[0])

    def test_season_detail(self, client):
        teams, _ = _ok(client.get("/api/teams"))
        tid = teams[0]["team_id"]
        data, _ = _ok(client.get(f"/api/teams/{tid}/season", params={"season": DETAIL}))
        assert data["team"]["team_id"] == tid
        roster = data["roster"]
        assert roster and {
            "player_id",
            "full_name",
            "min",
            "pts",
            "share_min",
            "share_pts",
            "usg_pct",
        } <= set(roster[0])
        assert sum(r["share_pts"] for r in roster) == pytest.approx(1.0, abs=1e-6)
        assert data["lineups"] and len(data["lineups"][0]["player_ids"]) == 5
        assert data["on_off"] and {
            "player_id",
            "on_net_rating",
            "off_net_rating",
            "on_off_net",
        } <= set(data["on_off"][0])
        assert data["stints"]

    def test_lineup_min_poss_filter(self, client):
        teams, _ = _ok(client.get("/api/teams"))
        tid = teams[0]["team_id"]
        data, _ = _ok(
            client.get(
                f"/api/teams/{tid}/season", params={"season": DETAIL, "min_lineup_poss": 1e9}
            )
        )
        assert data["lineups"] == []

    def test_league_table(self, client):
        data, _ = _ok(client.get("/api/teams/league", params={"season": DETAIL}))
        assert len(data) == 4

    def test_roster_metrics(self, client):
        data, _ = _ok(client.get("/api/teams/roster-metrics", params={"season": DETAIL}))
        assert len(data) == 4
        assert {
            "team_id",
            "net_rating",
            "usage_gini",
            "avg_height_in",
            "fg3a_rate",
            "top3_min_share",
        } <= set(data[0])

    def test_404(self, client):
        assert client.get("/api/teams/1/seasons").status_code == 404


class TestRankings:
    def test_lenses(self, client):
        data, _ = _ok(client.get("/api/rankings/lenses"))
        keys = {lens["key"] for lens in data}
        assert {
            "scoring_efficiency",
            "scoring_production",
            "playmaking",
            "rebounding",
            "defense",
            "impact",
            "balanced",
        } <= keys
        assert all(lens["components"] for lens in data)

    def test_lens_ranking(self, client):
        data, meta = _ok(
            client.get(
                "/api/rankings",
                params={
                    "season": DETAIL,
                    "lens": "scoring_efficiency",
                    "min_gp": 1,
                    "min_minutes": 0,
                },
            )
        )
        eligible = [r for r in data if r["eligible"]]
        assert eligible
        assert eligible == sorted(eligible, key=lambda r: -r["score"])
        row = eligible[0]
        assert row["contributions"] and {
            "metric",
            "raw",
            "normalized",
            "weight",
            "contribution",
            "higher_is_better",
        } <= set(row["contributions"][0])
        assert meta["population_size"] >= len(eligible)
        assert "user-defined index" in meta["disclaimer"]

    def test_custom_components_and_ineligibility(self, client):
        body = {
            "season": DETAIL,
            "min_gp": 1,
            "min_minutes": 0,
            "components": [
                {"metric": "ts_pct", "weight": 1},
                {"metric": "wingspan_in", "weight": 1},
            ],
        }
        data, meta = _ok(client.post("/api/rankings/custom", json=body))
        assert any(not r["eligible"] and "wingspan_in" in r["missing"] for r in data)
        for r in data:
            if r["eligible"]:
                assert r["score"] is not None
            else:
                assert r["score"] is None

    def test_mode_toggle(self, client):
        rate, _ = _ok(
            client.get(
                "/api/rankings",
                params={
                    "season": DETAIL,
                    "lens": "scoring_production",
                    "mode": "rate",
                    "min_gp": 1,
                    "min_minutes": 0,
                },
            )
        )
        cum, meta = _ok(
            client.get(
                "/api/rankings",
                params={
                    "season": DETAIL,
                    "lens": "scoring_production",
                    "mode": "cumulative",
                    "min_gp": 1,
                    "min_minutes": 0,
                },
            )
        )
        assert meta["normalization_of_counting_stats"] == "totals"
        assert rate and cum

    def test_bad_metric(self, client):
        r = client.post(
            "/api/rankings/custom",
            json={"season": DETAIL, "components": [{"metric": "nope", "weight": 1}]},
        )
        assert r.status_code == 422


class TestIngestion:
    def test_status(self, client):
        data, _ = _ok(client.get("/api/ingestion/status"))
        assert data["namespace"] == "demo" and data["running"] is False
        assert "real_manifest" in data and data["provider_reachable"] in (True, False, None)
