from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from app.api.deps import get_namespace, get_settings_dep
from app.api.envelope import ok
from app.data.manifest import Manifest
from app.data.paths import REAL_NAMESPACE, DataLayout
from app.data.schemas import FAMILIES, SEASON_TYPES
from app.ingestion.manager import IngestionBusyError

router = APIRouter(prefix="/api/ingestion", tags=["ingestion"])
SEASON_RE = re.compile(r"^\d{4}-\d{2}$")
ALLOWED_FAMILIES = frozenset({*FAMILIES, "all", "player_bios"})


class RunRequest(BaseModel):
    seasons: list[str] = Field(min_length=1, max_length=40)
    season_types: list[str] = Field(default_factory=lambda: ["Regular Season"], min_length=1)
    families: list[str] = Field(default_factory=lambda: ["all"], min_length=1)
    refresh: bool = False
    players_limit: int | None = Field(default=None, ge=1)
    game_ids: list[str] | None = Field(default=None, max_length=200)
    games_limit: int | None = Field(default=None, ge=1)

    @field_validator("seasons")
    @classmethod
    def _seasons(cls, v: list[str]) -> list[str]:
        bad = [s for s in v if not SEASON_RE.match(s)]
        if bad:
            raise ValueError(f"seasons must look like 2024-25: {bad}")
        return v

    @field_validator("season_types")
    @classmethod
    def _season_types(cls, v: list[str]) -> list[str]:
        bad = [s for s in v if s not in SEASON_TYPES]
        if bad:
            raise ValueError(f"season_types must be among {SEASON_TYPES}: {bad}")
        return v

    @field_validator("game_ids")
    @classmethod
    def _game_ids(cls, v: list[str] | None) -> list[str] | None:
        bad = [g for g in (v or []) if not re.fullmatch(r"\d{10}", g)]
        if bad:
            raise ValueError(f"game_ids must be 10-digit provider ids: {bad}")
        return v

    @field_validator("families")
    @classmethod
    def _families(cls, v: list[str]) -> list[str]:
        bad = [f for f in v if f not in ALLOWED_FAMILIES]
        if bad:
            raise ValueError(f"unknown families: {bad}")
        return v


def _manager(request: Request):
    manager = getattr(request.app.state, "ingestion", None)
    if manager is None:
        raise HTTPException(503, "ingestion manager is not configured")
    return manager


@router.get("/status")
def status(request: Request, ns=Depends(get_namespace), settings=Depends(get_settings_dep)):
    manager = getattr(request.app.state, "ingestion", None)
    real = Manifest.load(DataLayout(settings.data_dir, REAL_NAMESPACE))
    return ok(
        {
            "namespace": ns.namespace,
            "reason": ns.reason,
            "running": bool(manager.running) if manager else False,
            "last_run": manager.last_run if manager else None,
            "provider_reachable": manager.provider_reachable if manager else None,
            "real_manifest": {
                "entries": len(real.entries),
                "ok": sum(e.status == "ok" for e in real.entries),
                "partial": sum(e.status == "partial" for e in real.entries),
                "failed": sum(e.status == "failed" for e in real.entries),
                "seasons": real.seasons(),
                "generated_at": real.generated_at,
                "coverage": real.coverage(),
            },
        }
    )


@router.post("/run", status_code=202)
def start_run(body: RunRequest, request: Request):
    manager = _manager(request)
    try:
        plan = manager.start(
            body.seasons,
            body.season_types,
            body.families,
            refresh=body.refresh,
            players_limit=body.players_limit,
            game_ids=body.game_ids,
            games_limit=body.games_limit,
        )
    except IngestionBusyError as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return JSONResponse(status_code=202, content=ok({"accepted": True, "plan": plan}))


@router.post("/probe")
def probe(request: Request):
    manager = _manager(request)
    return ok({"provider_reachable": manager.probe()})


@router.get("/progress")
def progress(request: Request):
    manager = _manager(request)
    steps = list(manager.progress)
    return ok(
        {
            "running": manager.running,
            "last_run": manager.last_run,
            "steps": steps,
            "completed": len(steps),
            "planned": (manager.last_run or {}).get("plan", {}).get("steps"),
        }
    )
