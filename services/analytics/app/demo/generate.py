"""Orchestrate synthetic dataset generation into the ``demo`` namespace.

Run: ``python -m app.demo.generate [--seasons 2023-24 2024-25 ...] [--detail-seasons ...]``
"""

from __future__ import annotations

import argparse
import logging
import time
from datetime import UTC, datetime

import numpy as np

from app.config import get_settings
from app.data.manifest import Manifest, ManifestEntry
from app.data.parquet_io import write_family
from app.data.paths import DEMO_NAMESPACE, DataLayout
from app.data.schemas import SEASON_TYPES
from app.demo import derive
from app.demo.config import REGULAR_SEASON, SOURCE, DemoConfig, season_start_year
from app.demo.league import build_league
from app.demo.simulate import build_schedule, simulate_season
from app.events.games import derive_games

log = logging.getLogger(__name__)

DETAIL_FAMILIES = (
    "player_game_logs",
    "team_game_logs",
    "games",
    "events",
    "event_participants",
    "event_id_map",
    "shots",
    "shot_league_zone_avg",
    "matchups",
    "defense_dash",
    "lineups",
    "on_off",
)
SEASONAL_FAMILIES = ("player_season", "team_season", *DETAIL_FAMILIES)


def _mark_missing(
    layout: DataLayout, family: str, season: str, season_type: str, note: str
) -> None:
    entry = ManifestEntry(
        family=family,
        season=season,
        season_type=season_type,
        status="missing",
        rows=0,
        fetched_at=datetime.now(UTC),
        source=SOURCE,
        note=note,
    )
    Manifest.load(layout).upsert(entry).save(layout)


def generate_demo(layout: DataLayout, cfg: DemoConfig | None = None) -> Manifest:
    cfg = cfg or DemoConfig()
    started = time.perf_counter()
    rng = np.random.default_rng(cfg.seed)
    stamp = datetime.now(UTC)
    league = build_league(rng, cfg)
    write_family(layout, "teams", league.teams, source=SOURCE, fetched_at=stamp)
    write_family(layout, "players", league.players, source=SOURCE, fetched_at=stamp)
    write_family(
        layout,
        "combine_anthro",
        derive.combine_anthro(rng, league, cfg),
        source=SOURCE,
        fetched_at=stamp,
        note="synthetic combine measurements; ~80% of recent draftees",
    )
    for season in cfg.seasons:
        season_rng = np.random.default_rng([cfg.seed, season_start_year(season)])
        kw = dict(source=SOURCE, season=season, season_type=REGULAR_SEASON, fetched_at=stamp)
        if season in cfg.detail_seasons:
            schedule = build_schedule(
                season_rng, season, league.teams["team_id"].to_numpy(), cfg.games_per_team
            )
            sim = simulate_season(season_rng, cfg, season, league, schedule)
            ps = derive.player_season_from_logs(season_rng, season, sim, league)
            ts = derive.team_season_from_logs(season, sim.team_logs)
            write_family(layout, "player_season", ps, **kw)
            write_family(layout, "team_season", ts, **kw, note=derive.POSS_NOTE)
            write_family(layout, "player_game_logs", sim.player_logs, **kw)
            write_family(layout, "team_game_logs", sim.team_logs, **kw)
            write_family(layout, "games", derive_games(sim.team_logs), **kw)
            ev, pa, im = derive.events_from_shots(season, sim.shots)
            write_family(layout, "events", ev, **kw, note=derive.EVENTS_NOTE)
            write_family(layout, "event_participants", pa, **kw, note=derive.EVENTS_NOTE)
            write_family(layout, "event_id_map", im, **kw, note=derive.EVENTS_NOTE)
            write_family(
                layout, "shots", sim.shots.drop(columns=["def_player_id", "zone_key"]), **kw
            )
            write_family(
                layout, "shot_league_zone_avg", derive.league_zone_avg(season, sim.shots), **kw
            )
            write_family(
                layout,
                "matchups",
                derive.matchups_from_shots(season_rng, season, sim),
                **kw,
                note="synthetic defender assignment per shot; help_* not modelled",
            )
            write_family(layout, "defense_dash", derive.defense_dash_from_shots(season, sim), **kw)
            write_family(
                layout,
                "lineups",
                derive.lineups_synthetic(season_rng, season, sim, ts, league),
                **kw,
                note="synthetic lineup minutes and ratings (no play-by-play in demo)",
            )
            write_family(
                layout,
                "on_off",
                derive.on_off_synthetic(season_rng, season, ps, ts, league),
                **kw,
                note="synthetic on/off ratings derived from team ratings and player impact",
            )
        else:
            ps = derive.player_season_synthetic(season_rng, season, league, cfg)
            ts = derive.team_season_synthetic(season_rng, season, ps, cfg)
            write_family(
                layout, "player_season", ps, **kw, note="season totals only (no simulated games)"
            )
            write_family(
                layout,
                "team_season",
                ts,
                **kw,
                note="season totals only; opponent context approximated",
            )
            for fam in DETAIL_FAMILIES:
                _mark_missing(
                    layout,
                    fam,
                    season,
                    REGULAR_SEASON,
                    "demo generates game-level detail for detail_seasons only",
                )
        for st in SEASON_TYPES:
            if st != REGULAR_SEASON:
                for fam in SEASONAL_FAMILIES:
                    _mark_missing(layout, fam, season, st, f"demo dataset does not generate {st}")
        log.info("season %s written (%.1fs elapsed)", season, time.perf_counter() - started)
    return Manifest.load(layout)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate the labelled synthetic demo dataset")
    parser.add_argument(
        "--seasons", nargs="*", help="e.g. 2023-24 2024-25 (default: 10 seasons to 2025-26)"
    )
    parser.add_argument(
        "--detail-seasons",
        nargs="*",
        help="seasons with game logs/shots/matchups (default: last 3)",
    )
    parser.add_argument("--teams", type=int, default=30)
    parser.add_argument("--games", type=int, default=82)
    parser.add_argument("--roster", type=int, default=15)
    parser.add_argument("--seed", type=int, default=20261008)
    parser.add_argument("--data-dir", default=None)
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    settings = get_settings()
    kwargs: dict = {
        "seed": args.seed,
        "n_teams": args.teams,
        "games_per_team": args.games,
        "roster_size": args.roster,
    }
    if args.seasons:
        kwargs["seasons"] = tuple(args.seasons)
        kwargs["detail_seasons"] = (
            tuple(args.detail_seasons) if args.detail_seasons else tuple(args.seasons[-3:])
        )
    elif args.detail_seasons:
        kwargs["detail_seasons"] = tuple(args.detail_seasons)
    cfg = DemoConfig(**kwargs)
    layout = DataLayout(
        root=(
            settings.data_dir
            if args.data_dir is None
            else __import__("pathlib").Path(args.data_dir)
        ),
        namespace=DEMO_NAMESPACE,
    )
    manifest = generate_demo(layout, cfg)
    ok = [e for e in manifest.entries if e.status == "ok"]
    print(
        f"demo dataset written to {layout.namespace_dir}: {len(ok)} dataset files, "
        f"{sum(e.rows for e in ok):,} rows; seasons {cfg.seasons[0]}..{cfg.seasons[-1]} "
        f"(detail: {', '.join(cfg.detail_seasons)})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
