"""``python -m app.ingestion.cli {run,status,probe,probe-capabilities}``"""

from __future__ import annotations

import argparse
import logging
import sys
from collections.abc import Sequence
from pathlib import Path

from app.config import Settings
from app.data.manifest import Manifest
from app.data.paths import REAL_NAMESPACE, DataLayout
from app.data.schemas import FAMILIES, SEASON_TYPES
from app.ingestion.pipeline import IngestionPlan, StepResult, run
from app.ingestion.providers.nba_api_provider import NbaApiProvider


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.ingestion.cli", description="Real-provider ingestion"
    )
    parser.add_argument("--data-dir", type=Path, default=None, help="override NBA_DATA_DIR")
    parser.add_argument("--log-level", default=None)
    sub = parser.add_subparsers(dest="command", required=True)

    run_p = sub.add_parser("run", help="fetch, normalise and write families for the given seasons")
    run_p.add_argument(
        "--seasons", nargs="+", required=True, metavar="SEASON", help="e.g. 2024-25 2023-24"
    )
    run_p.add_argument(
        "--season-types", nargs="+", default=["Regular Season"], choices=SEASON_TYPES
    )
    run_p.add_argument("--families", default="all", help="all or comma-separated family names")
    run_p.add_argument(
        "--refresh", action="store_true", help="ignore cache and manifest; re-download"
    )
    run_p.add_argument(
        "--players-limit", type=int, default=None, help="cap commonplayerinfo calls (player_bios)"
    )
    run_p.add_argument(
        "--delay", type=float, default=None, help="seconds between provider requests"
    )
    run_p.add_argument(
        "--game-ids", default=None, help="comma-separated game ids for per-game families (events)"
    )
    run_p.add_argument(
        "--games-limit", type=int, default=None, help="first N games of the season (events)"
    )

    sub.add_parser("status", help="print manifest coverage for the real namespace")
    probe_p = sub.add_parser("probe", help="check whether stats.nba.com answers")
    probe_p.add_argument("--timeout", type=float, default=10.0)

    cap_p = sub.add_parser(
        "probe-capabilities",
        help="bounded probe of play-by-play / video endpoints for one game; logs what comes back",
    )
    cap_p.add_argument("--game-id", required=True, help="provider game id, e.g. 0022400061")
    cap_p.add_argument(
        "--event-ids",
        default=None,
        help="comma-separated shot event ids (default: first 3 from shots)",
    )
    cap_p.add_argument(
        "--shooter",
        default=None,
        help="team_id:player_id for videodetailsasset (default: from shots)",
    )
    cap_p.add_argument("--max", type=int, default=10, help="hard cap on provider calls")
    cap_p.add_argument(
        "--record-fixtures",
        nargs="?",
        const=str(Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "nba_api"),
        default=None,
        help="save scrubbed responses as test fixtures (default dir: backend/tests/fixtures/nba_api)",
    )
    return parser


def parse_families(text: str) -> tuple[str, ...]:
    families = tuple(f.strip() for f in text.split(",") if f.strip())
    if not families:
        raise argparse.ArgumentTypeError("at least one family is required")
    unknown = set(families) - set(FAMILIES) - {"all", "player_bios"}
    if unknown:
        raise argparse.ArgumentTypeError(f"unknown families: {sorted(unknown)}")
    return families


def make_settings(args: argparse.Namespace) -> Settings:
    overrides = {}
    if args.data_dir is not None:
        overrides["nba_data_dir"] = args.data_dir
    if getattr(args, "delay", None) is not None:
        overrides["nba_request_delay_seconds"] = args.delay
    if args.log_level:
        overrides["log_level"] = args.log_level
    return Settings(**overrides)


def _print_step(result: StepResult) -> None:
    flag = "skip" if result.skipped else result.status
    label = " ".join(str(p) for p in (result.family, result.season, result.season_type) if p)
    extra = result.error or result.note or ""
    print(f"[{flag:>7}] {label:<48} rows={result.rows:<8} {extra}")


def cmd_run(args: argparse.Namespace, settings: Settings) -> int:
    layout = DataLayout(settings.data_dir, REAL_NAMESPACE)
    plan = IngestionPlan(
        tuple(args.seasons), tuple(args.season_types), parse_families(args.families)
    )
    print(f"plan: {plan.summary()}")
    report = run(
        layout,
        NbaApiProvider(settings),
        plan,
        refresh=args.refresh,
        progress=_print_step,
        players_limit=args.players_limit,
        game_ids=tuple(g.strip() for g in args.game_ids.split(",") if g.strip())
        if args.game_ids
        else None,
        games_limit=args.games_limit,
    )
    print(f"done: ok={report.ok} failed={report.failed} steps={len(report.results)}")
    return 1 if report.failed and not report.ok else 0


def cmd_status(settings: Settings) -> int:
    manifest = Manifest.load(DataLayout(settings.data_dir, REAL_NAMESPACE))
    print(
        f"namespace={manifest.namespace} entries={len(manifest.entries)} generated_at={manifest.generated_at}"
    )
    for entry in sorted(
        manifest.entries, key=lambda e: (e.season or "", e.season_type or "", e.family)
    ):
        label = " ".join(str(p) for p in (entry.family, entry.season, entry.season_type) if p)
        when = entry.fetched_at.isoformat(timespec="minutes") if entry.fetched_at else "-"
        print(
            f"{entry.status:>8}  {label:<48} rows={entry.rows:<8} fetched={when}  {entry.error or entry.note or ''}"
        )
    return 0


def cmd_probe(args: argparse.Namespace, settings: Settings) -> int:
    reachable = NbaApiProvider(settings).probe(timeout=args.timeout)
    print(f"stats.nba.com reachable: {reachable}")
    return 0 if reachable else 2


def _shots_for_game(layout: DataLayout, game_id: str):
    import pyarrow.parquet as pq

    from app.ingestion.capabilities import season_from_game_id

    season = season_from_game_id(game_id)
    files = sorted(layout.family_dir("shots").glob(f"shots__{season}__*.parquet"))
    if not files:
        return None
    import pandas as pd

    cols = ["game_id", "game_event_id", "player_id", "team_id"]
    df = pd.concat([pq.read_table(f, columns=cols).to_pandas() for f in files])
    df = df[df["game_id"] == game_id].sort_values("game_event_id")
    return df if not df.empty else None


def cmd_probe_capabilities(args: argparse.Namespace, settings: Settings) -> int:
    from app.ingestion.capabilities import probe_capabilities

    layout = DataLayout(settings.data_dir, REAL_NAMESPACE)
    shots = None if (args.event_ids and args.shooter) else _shots_for_game(layout, args.game_id)
    if args.event_ids:
        event_ids = [int(x) for x in args.event_ids.split(",") if x.strip()]
    else:
        event_ids = [int(x) for x in shots["game_event_id"].head(3)] if shots is not None else []
    if args.shooter:
        team, player = args.shooter.split(":")
        shooter: tuple[int, int] | None = (int(team), int(player))
    else:
        shooter = (
            (int(shots.iloc[0]["team_id"]), int(shots.iloc[0]["player_id"]))
            if shots is not None
            else None
        )
    fixtures = Path(args.record_fixtures) if args.record_fixtures else None
    records = probe_capabilities(
        NbaApiProvider(settings), layout, args.game_id, event_ids, shooter, args.max, fixtures
    )
    for r in records:
        detail = r.error or ", ".join(
            f"{n}={len(r.fields_seen.get(n, []))} cols" for n in r.result_set_names
        )
        print(
            f"[{r.status:>11}] {r.endpoint:<22} rows={r.row_count:<6} cache={str(r.from_cache):<5} {detail}"
        )
    print(
        f"log: {layout.namespace_dir / 'capability_log.jsonl'}"
        + (f"; fixtures: {fixtures}" if fixtures else "")
    )
    return 0 if any(r.status == "ok" for r in records) else 2


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    settings = make_settings(args)
    logging.basicConfig(
        level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    if args.command == "run":
        return cmd_run(args, settings)
    if args.command == "status":
        return cmd_status(settings)
    if args.command == "probe-capabilities":
        return cmd_probe_capabilities(args, settings)
    return cmd_probe(args, settings)


if __name__ == "__main__":
    sys.exit(main())
