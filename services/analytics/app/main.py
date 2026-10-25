"""FastAPI application. ``uvicorn app.main:app --reload``"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.jobs.handlers.all  # noqa: F401, E402 - registers built-in job handlers
from app.api.envelope import install_error_handlers
from app.api.routers import (
    annotations,
    event_links,
    events,
    evidence,
    games,
    ingestion,
    jobs,
    league,
    matchups,
    media,
    meta,
    players,
    rankings,
    scouting,
    shots,
    teams,
)
from app.config import Settings, get_settings
from app.data.db import Database
from app.data.namespace import resolve_namespace
from app.data.paths import DataLayout
from app.ingestion.manager import IngestionManager
from app.state.connection import open_state_db

log = logging.getLogger("nba")


def _make_on_complete(app: FastAPI, settings: Settings):
    """After ingestion: refresh DuckDB views and switch namespace if real data just appeared."""

    def on_complete(_report=None) -> None:
        decision = resolve_namespace(settings)
        if decision.namespace != app.state.namespace.namespace:
            log.info("namespace changed to %s (%s)", decision.namespace, decision.reason)
            app.state.namespace = decision
            app.state.layout = DataLayout(settings.data_dir, decision.namespace)
            app.state.db = Database(app.state.layout)
            app.state.state_db.close()
            app.state.state_db = open_state_db(app.state.layout)
        else:
            _refresh_db(app)

    return on_complete


def _refresh_db(app: FastAPI) -> None:
    """Re-register DuckDB views; rebuild the connection when a placeholder table blocks a view."""
    try:
        app.state.db.refresh()
    except Exception as exc:  # noqa: BLE001 - duckdb CatalogException when a family first appears
        log.info("rebuilding DuckDB connection after refresh failure: %s", exc)
        app.state.db = Database(app.state.layout)


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Release the SQLite handle on shutdown; views over Parquet need no teardown."""
    try:
        yield
    finally:
        state_db = getattr(app.state, "state_db", None)
        if state_db is not None:
            state_db.close()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(
        level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    decision = resolve_namespace(settings)
    layout = DataLayout(settings.data_dir, decision.namespace)
    log.info(
        "serving namespace=%s (%s) from %s",
        decision.namespace,
        decision.reason,
        layout.namespace_dir,
    )

    app = FastAPI(title="NBA Analytics Research API", version="0.1.0", lifespan=_lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)
    app.state.settings = settings
    app.state.namespace = decision
    app.state.layout = layout
    app.state.db = Database(layout)
    app.state.state_db = open_state_db(layout)
    app.state.ingestion = IngestionManager(settings, on_complete=_make_on_complete(app, settings))
    routers = [meta, players, league, shots, matchups, teams, rankings, games, events, evidence]
    if settings.public_read_only:
        # Public hosts serve statistics and evidence listings only. Scouting (shortlists, reports,
        # custom roles), jobs and ingestion mutate state or trigger work and stay local until the
        # owner-token gate exists (docs/scouting/IMPLEMENTATION_PLAN.md A-00, DECISIONS DEC-19).
        log.info(
            "public read-only mode: ingestion, scouting and jobs routes disabled; provider fetches refused"
        )
    else:
        routers.extend([scouting, jobs, media, event_links, annotations, ingestion])
    for r in routers:
        app.include_router(r.router)

    @app.get("/api/health")
    def health():
        return {
            "success": True,
            "data": {
                "status": "ok",
                "namespace": decision.namespace,
                "read_only": settings.public_read_only,
            },
            "error": None,
            "meta": {},
        }

    return app


app = create_app()
