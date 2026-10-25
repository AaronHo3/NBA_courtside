import json
from datetime import UTC, datetime

import pandas as pd
import pyarrow as pa

from app.data import manifest as mf
from app.data import paths, schemas
from app.data.parquet_io import read_family, write_family


class TestPaths:
    def test_family_file_layout(self, tmp_path):
        layout = paths.DataLayout(root=tmp_path, namespace="demo")
        p = layout.family_file("player_season", season="2024-25", season_type="Regular Season")
        assert p.parent == tmp_path / "demo" / "parquet" / "player_season"
        assert p.name == "player_season__2024-25__regular_season.parquet"
        assert layout.family_file("players").name == "players.parquet"
        assert layout.manifest_path == tmp_path / "demo" / "manifest.json"
        assert layout.raw_dir == tmp_path / "demo" / "raw"

    def test_season_type_slug_round_trip(self):
        assert paths.season_type_slug("Regular Season") == "regular_season"
        assert paths.season_type_slug("Pre Season") == "pre_season"


class TestSchemas:
    def test_every_family_has_a_schema(self):
        for fam in schemas.FAMILIES:
            assert isinstance(schemas.schema_for(fam), pa.Schema)

    def test_player_season_has_required_columns(self):
        names = schemas.schema_for("player_season").names
        for c in [
            "player_id",
            "season",
            "season_type",
            "team_id",
            "is_aggregate",
            "gp",
            "min",
            "fgm",
            "fga",
            "fg3m",
            "fg3a",
            "ftm",
            "fta",
            "pts",
            "poss",
            "usg_pct",
            "pie",
        ]:
            assert c in names

    def test_conform_adds_missing_columns_as_null_and_orders(self):
        df = pd.DataFrame(
            {"player_id": [1], "season": ["2024-25"], "season_type": ["Regular Season"]}
        )
        out = schemas.conform(df, "player_season")
        assert list(out.columns) == schemas.schema_for("player_season").names
        assert out["pts"].isna().all()


class TestManifest:
    def test_round_trip_and_status(self, tmp_path):
        layout = paths.DataLayout(root=tmp_path, namespace="demo")
        m = mf.Manifest.load(layout)
        assert m.namespace == "demo"
        assert m.entries == []
        now = datetime(2026, 10, 8, tzinfo=UTC)
        m = m.upsert(
            mf.ManifestEntry(
                family="player_season",
                season="2024-25",
                season_type="Regular Season",
                status="ok",
                rows=10,
                fetched_at=now,
                source="demo-synthetic",
                path="x.parquet",
            )
        )
        m.save(layout)
        loaded = mf.Manifest.load(layout)
        assert len(loaded.entries) == 1
        assert loaded.entries[0].status == "ok"
        assert loaded.entries[0].fetched_at == now
        raw = json.loads(layout.manifest_path.read_text())
        assert raw["namespace"] == "demo"

    def test_upsert_replaces_same_key(self, tmp_path):
        layout = paths.DataLayout(root=tmp_path, namespace="demo")
        m = mf.Manifest.load(layout)
        e = mf.ManifestEntry(
            family="players",
            season=None,
            season_type=None,
            status="failed",
            rows=0,
            fetched_at=None,
            source="nba_api",
            path=None,
            error="timeout",
        )
        m = m.upsert(e).upsert(e.model_copy(update={"status": "ok", "rows": 5, "error": None}))
        assert len(m.entries) == 1 and m.entries[0].status == "ok"

    def test_has_usable_data(self, tmp_path):
        layout = paths.DataLayout(root=tmp_path, namespace="nba")
        m = mf.Manifest.load(layout)
        assert m.has_usable_data() is False
        m = m.upsert(
            mf.ManifestEntry(
                family="player_season",
                season="2024-25",
                season_type="Regular Season",
                status="ok",
                rows=500,
                fetched_at=None,
                source="nba_api",
                path="p",
            )
        )
        assert m.has_usable_data() is True

    def test_coverage_summary(self, tmp_path):
        layout = paths.DataLayout(root=tmp_path, namespace="demo")
        m = mf.Manifest.load(layout)
        for fam, status in [("player_season", "ok"), ("shots", "missing"), ("matchups", "failed")]:
            m = m.upsert(
                mf.ManifestEntry(
                    family=fam,
                    season="2024-25",
                    season_type="Regular Season",
                    status=status,
                    rows=0,
                    fetched_at=None,
                    source="demo",
                    path=None,
                )
            )
        cov = m.coverage()
        assert cov["2024-25"]["Regular Season"]["player_season"] == "ok"
        assert cov["2024-25"]["Regular Season"]["shots"] == "missing"
        assert cov["2024-25"]["Regular Season"]["matchups"] == "failed"


class TestParquetIO:
    def test_write_and_read_family_updates_manifest(self, tmp_path):
        layout = paths.DataLayout(root=tmp_path, namespace="demo")
        df = pd.DataFrame(
            {
                "player_id": [1, 2],
                "season": ["2024-25"] * 2,
                "season_type": ["Regular Season"] * 2,
                "team_id": [1, 1],
                "is_aggregate": [False, False],
                "pts": [10, None],
            }
        )
        entry = write_family(
            layout,
            "player_season",
            df,
            season="2024-25",
            season_type="Regular Season",
            source="demo-synthetic",
        )
        assert entry.rows == 2 and entry.status == "ok"
        back = read_family(layout, "player_season")
        assert len(back) == 2
        assert pd.isna(back.loc[back.player_id == 2, "pts"]).all()
        m = mf.Manifest.load(layout)
        assert m.entries[0].family == "player_season"


class TestDatabaseRefresh:
    def test_refresh_after_empty_family_gains_files(self, tmp_path):
        from app.data.db import Database

        layout = paths.DataLayout(root=tmp_path, namespace="nba")
        db = Database(layout)  # every family empty -> tables
        assert db.query("SELECT COUNT(*) AS n FROM teams")["n"].iloc[0] == 0
        write_family(
            layout, "teams", pd.DataFrame({"team_id": [1], "abbreviation": ["AAA"]}), source="t"
        )
        db.refresh()  # must swap the empty table for a view without a CatalogException
        assert db.query("SELECT COUNT(*) AS n FROM teams")["n"].iloc[0] == 1
        db.refresh()  # idempotent when already a view
        assert "teams" in db.available_families()


class TestPlayerContext:
    def test_one_row_per_player_even_with_two_combine_measurements(self, tmp_path):
        from app.data.db import Database
        from app.data.repositories.common import player_context

        layout = paths.DataLayout(root=tmp_path, namespace="nba")
        write_family(
            layout,
            "players",
            pd.DataFrame({"player_id": [1, 2], "full_name": ["A", "B"]}),
            source="t",
        )
        write_family(
            layout,
            "combine_anthro",
            pd.DataFrame(
                {
                    "player_id": [1, 1],
                    "combine_season": ["2023-24", "2024-25"],
                    "wingspan_in": [80.0, 81.0],
                    "height_wo_shoes_in": [76.0, 76.0],
                }
            ),
            source="t",
        )
        ctx = player_context(Database(layout))
        assert len(ctx) == 2 and ctx["player_id"].is_unique
        assert ctx.loc[ctx.player_id == 1, "wingspan_in"].iloc[0] == 81.0
