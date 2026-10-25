"""Consistent API envelope: {success, data, error, meta}."""

from __future__ import annotations

import json
import math
from typing import Any

import pandas as pd
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


def ok(data: Any, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"success": True, "data": data, "error": None, "meta": meta or {}}


def records(df: pd.DataFrame) -> list[dict[str, Any]]:
    """DataFrame -> JSON-safe records (NaN -> null, numpy scalars -> python, dates -> ISO)."""
    if df is None or df.empty:
        return []
    return json.loads(df.to_json(orient="records", date_format="iso", date_unit="s"))


def clean(value: Any) -> Any:
    """Make a scalar JSON-safe."""
    if value is None:
        return None
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if hasattr(value, "item"):
        return clean(value.item())
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [clean(v) for v in value]
    return value


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": str(exc.detail), "meta": {}},
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        detail = "; ".join(
            f"{'.'.join(str(x) for x in e['loc'])}: {e['msg']}" for e in exc.errors()
        )
        return JSONResponse(
            status_code=422, content={"success": False, "data": None, "error": detail, "meta": {}}
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "data": None,
                "error": f"{type(exc).__name__}: {exc}",
                "meta": {},
            },
        )
