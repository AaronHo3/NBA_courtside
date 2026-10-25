from __future__ import annotations

from fastapi import APIRouter, Depends

from app.analytics.catalog import NORMALIZATION_LABELS, catalog
from app.analytics.court import half_court_geometry
from app.api.capabilities import capabilities
from app.api.deps import get_db, get_layout, get_namespace, get_settings_dep, get_state_db
from app.api.envelope import ok, records
from app.data.manifest import Manifest
from app.data.schemas import SEASON_TYPES

router = APIRouter(prefix="/api/meta", tags=["meta"])


@router.get("/status")
def status(
    db=Depends(get_db),
    layout=Depends(get_layout),
    ns=Depends(get_namespace),
    settings=Depends(get_settings_dep),
):
    manifest = Manifest.load(layout)
    seasons = db.query("SELECT DISTINCT season FROM player_season ORDER BY season DESC")[
        "season"
    ].tolist()
    detail = [e.season for e in manifest.entries if e.family == "shots" and e.status == "ok"]
    default_season = (
        sorted(detail, reverse=True)[0] if detail else (seasons[0] if seasons else None)
    )
    return ok(
        {
            "namespace": ns.namespace,
            "is_demo": ns.is_demo,
            "reason": ns.reason,
            "read_only": settings.public_read_only,
            "generated_at": manifest.generated_at,
            "seasons": seasons,
            "season_types": list(SEASON_TYPES),
            "default_season": default_season,
            "default_season_type": "Regular Season",
            "coverage": manifest.coverage(),
            "families": db.available_families(),
            "normalizations": NORMALIZATION_LABELS,
            "banner": (
                "DEMO DATA: every team, player and statistic shown is synthetic and fictional. "
                "Nothing here is a real NBA record."
            )
            if ns.is_demo
            else None,
        }
    )


@router.get("/capabilities")
def machine_capabilities(state_db=Depends(get_state_db), settings=Depends(get_settings_dep)):
    return ok(capabilities(state_db, settings))


@router.get("/metrics")
def metrics():
    return ok(catalog())


@router.get("/court")
def court():
    return ok(
        half_court_geometry(),
        {
            "units": "feet; origin at hoop centre; y toward half court",
            "provider_units": "LOC_X/LOC_Y are tenths of a foot from the hoop centre",
        },
    )


@router.get("/teams")
def teams(db=Depends(get_db)):
    return ok(records(db.query("SELECT * FROM teams ORDER BY full_name")))


@router.get("/manifest")
def manifest(layout=Depends(get_layout)):
    return ok(Manifest.load(layout).model_dump(mode="json"))
