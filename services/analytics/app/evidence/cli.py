"""``python -m app.evidence.cli link-events --game-id ... [--check N]``"""

from __future__ import annotations

import argparse
import logging
import sys
from collections.abc import Sequence
from pathlib import Path

from app.config import Settings
from app.data.db import Database
from app.data.paths import REAL_NAMESPACE, DataLayout
from app.evidence.availability import check_availability
from app.evidence.link_events import link_game_events
from app.evidence.registry import count_assets, list_assets
from app.state.connection import open_state_db


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.evidence.cli", description="Evidence registry"
    )
    parser.add_argument("--data-dir", type=Path, default=None, help="override NBA_DATA_DIR")
    sub = parser.add_subparsers(dest="command", required=True)
    link = sub.add_parser(
        "link-events", help="external clip references for a game's field-goal events"
    )
    link.add_argument("--game-id", required=True, help="comma-separated provider game ids")
    link.add_argument(
        "--all-events", action="store_true", help="link every event, not only field goals"
    )
    link.add_argument(
        "--check",
        type=int,
        default=0,
        help="verify availability for up to N unverified references (provider calls)",
    )
    return parser


def cmd_link_events(args: argparse.Namespace, settings: Settings) -> int:
    layout = DataLayout(settings.data_dir, REAL_NAMESPACE)
    analytics = Database(layout)
    db = open_state_db(layout)
    try:
        for game_id in [g.strip() for g in args.game_id.split(",") if g.strip()]:
            report = link_game_events(db, analytics, game_id, only_field_goals=not args.all_events)
            print(
                f"{game_id}: {report.events} events -> {report.assets_created} new references, "
                f"{report.links_created} new links, {report.evidence_created} new evidence items"
            )
        if args.check > 0:
            from app.ingestion.providers.nba_api_provider import NbaApiProvider

            pending = [
                a["asset_id"]
                for a in list_assets(
                    db, kind="external_reference", availability="unverified", limit=args.check
                )
            ]
            rep = check_availability(
                NbaApiProvider(settings), layout, db, pending, max_calls=args.check
            )
            remaining = count_assets(db, kind="external_reference", availability="unverified")
            print(
                f"availability: checked {rep.checked}, available {rep.available}, "
                f"unavailable {rep.unavailable}, errors {rep.errors}; "
                f"{remaining} references still unverified"
            )
    finally:
        db.close()
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    settings = Settings(nba_data_dir=args.data_dir) if args.data_dir is not None else Settings()
    logging.basicConfig(
        level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    return cmd_link_events(args, settings)


if __name__ == "__main__":
    sys.exit(main())
