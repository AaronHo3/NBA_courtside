from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from pydantic import BaseModel, Field

from app.api.deps import get_db, get_layout, get_namespace, get_settings_dep, get_state_db
from app.api.envelope import clean, ok, records
from app.api.params import SeasonParam, SeasonType, SeasonTypeParam
from app.data.repositories import shots as repo
from app.data.repositories.shots import ShotFilters
from app.events import repository as events_repo
from app.evidence.models import EventKey
from app.evidence.read import evidence_for_event
from app.ingestion.manager import IngestionBusyError
from app.ingestion.providers.base import ProviderError

router = APIRouter(prefix="/api/shots", tags=["shots"])


def shot_filters(
    season: SeasonParam,
    season_type: SeasonTypeParam = "Regular Season",
    player_id: Annotated[str | None, Query(description="player id or comma-separated ids")] = None,
    team_id: int | None = None,
    opponent_team_id: int | None = None,
    period: Annotated[int | None, Query(ge=1, le=10)] = None,
    shot_type: Annotated[str | None, Query(pattern="^(2PT|3PT)$")] = None,
    made: bool | None = None,
    min_distance: Annotated[float | None, Query(ge=0)] = None,
    max_distance: Annotated[float | None, Query(ge=0, le=94)] = None,
    date_from: str | None = None,
    date_to: str | None = None,
    game_id: str | None = None,
    zone_basic: str | None = None,
    action_type: str | None = None,
    home: bool | None = None,
) -> ShotFilters:
    ids: tuple[int, ...] = ()
    if player_id:
        try:
            ids = tuple(int(x) for x in player_id.split(",") if x.strip())
        except ValueError as exc:
            raise HTTPException(
                422, "player_id must be an integer or comma-separated integers"
            ) from exc
        if len(ids) > 12:
            raise HTTPException(422, "at most 12 players per shot query")
    f = ShotFilters(
        season=season,
        season_type=season_type,
        player_ids=ids,
        team_id=team_id,
        opponent_team_id=opponent_team_id,
        period=period,
        shot_type=shot_type,
        made=made,
        min_distance=min_distance,
        max_distance=max_distance,
        date_from=date_from,
        date_to=date_to,
        game_id=game_id,
        zone_basic=zone_basic,
        action_type=action_type,
        home=home,
    )
    if not f.has_subject():
        raise HTTPException(422, "provide player_id and/or team_id")
    return f


def _unavailable(layout, f: ShotFilters):
    available, reason = repo.availability(layout, f.season, f.season_type)
    return (
        None
        if available
        else {
            "available": False,
            "reason": reason,
            "season": f.season,
            "season_type": f.season_type,
        }
    )


@router.get("/markers")
def markers(
    f: ShotFilters = Depends(shot_filters),
    db=Depends(get_db),
    layout=Depends(get_layout),
    settings=Depends(get_settings_dep),
):
    if (meta := _unavailable(layout, f)) is not None:
        return ok([], meta)
    df, total = repo.markers(db, f, settings.max_shot_rows)
    return ok(
        records(df),
        {
            "available": True,
            "total": total,
            "returned": len(df),
            "capped": total > len(df),
            "cap": settings.max_shot_rows,
        },
    )


@router.get("/hexbins")
def hexbins(
    f: ShotFilters = Depends(shot_filters),
    size_ft: Annotated[float, Query(ge=0.75, le=6)] = 1.5,
    min_attempts: Annotated[int, Query(ge=1, le=500)] = 5,
    db=Depends(get_db),
    layout=Depends(get_layout),
):
    if (meta := _unavailable(layout, f)) is not None:
        return ok([], meta)
    df = repo.hexbins(db, f, size_ft, min_attempts)
    return ok(
        records(df),
        {
            "available": True,
            "size_ft": size_ft,
            "min_attempts": min_attempts,
            "total_fga": int(df["fga"].sum()) if not df.empty else 0,
            "total_fgm": int(df["fgm"].sum()) if not df.empty else 0,
            "league_baseline": "shot_league_zone_avg",
            "rel_fg_pct_definition": "bin FG% minus league FG% in the bin's dominant provider zone for the same season",
        },
    )


@router.get("/zones")
def zones(
    f: ShotFilters = Depends(shot_filters),
    min_attempts: Annotated[int, Query(ge=1, le=500)] = 10,
    db=Depends(get_db),
    layout=Depends(get_layout),
):
    if (meta := _unavailable(layout, f)) is not None:
        return ok([], meta)
    df = repo.zones(db, f, min_attempts)
    return ok(
        records(df),
        {
            "available": True,
            "min_attempts": min_attempts,
            "total_fga": int(df["fga"].sum()) if not df.empty else 0,
        },
    )


@router.get("/filters")
def filters(f: ShotFilters = Depends(shot_filters), db=Depends(get_db), layout=Depends(get_layout)):
    if (meta := _unavailable(layout, f)) is not None:
        return ok(
            {
                "opponents": [],
                "periods": [],
                "action_types": [],
                "zones": [],
                "date_range": {"min": None, "max": None},
                "supported": [],
                "unsupported": repo.UNSUPPORTED_FILTERS,
            },
            meta,
        )
    return ok(clean(repo.filter_options(db, f)), {"available": True})


@router.get("/league-zones")
def league_zones(
    season: SeasonParam, season_type: SeasonTypeParam = "Regular Season", db=Depends(get_db)
):
    df = repo.league_zone_baseline(db, season, season_type)
    if not df.empty:
        df["fg_pct"] = df["fgm"] / df["fga"]
    return ok(records(df))


@router.get("/{game_id}/{game_event_id}/evidence")
def shot_evidence(
    game_id: Annotated[str, Path(pattern=r"^[0-9A-Z]\d{9}$")],
    game_event_id: int,
    db=Depends(get_db),
    state_db=Depends(get_state_db),
):
    """Play-by-play event and evidence behind one shot, resolved through event_id_map."""
    hit = events_repo.events_for_shot(db, game_id, game_event_id)
    if hit is None or hit.get("event") is None:
        reason = (
            f"shot {game_event_id} of game {game_id} is {hit['confidence']} in event_id_map"
            if hit
            else f"no event mapped for shot {game_event_id} of game {game_id}; ingest events for the game"
        )
        return ok(
            None,
            {
                "event_id_map_method": None,
                "confidence": hit["confidence"] if hit else None,
                "reason": reason,
            },
        )
    event = hit["event"]
    key = EventKey(event["source_event_system"], game_id, int(event["source_event_id"]))
    return ok(
        clean(
            {
                "event": event,
                "participants": hit["participants"],
                "evidence": evidence_for_event(state_db, key),
            }
        ),
        {
            "event_id_map_method": hit["method"],
            "confidence": hit["confidence"],
            "verified_at": hit.get("verified_at"),
        },
    )


class FetchPlayerRequest(BaseModel):
    player_id: int = Field(gt=0)
    season: str = Field(pattern=r"^\d{4}-\d{2}$")
    season_type: SeasonType = "Regular Season"


@router.post("/fetch-player")
def fetch_player(
    body: FetchPlayerRequest,
    request: Request,
    ns=Depends(get_namespace),
    settings=Depends(get_settings_dep),
):
    """On-demand single-player shot fetch, merged into the real namespace's season shots file."""
    if settings.public_read_only:
        raise HTTPException(
            403, "this deployment is read-only; provider fetches run on the ingestion machine"
        )
    if ns.is_demo:
        raise HTTPException(
            409,
            "on-demand provider fetches are only available in the real `nba` namespace; "
            "the API is currently serving labelled synthetic demo data",
        )
    manager = getattr(request.app.state, "ingestion", None)
    if manager is None:
        raise HTTPException(503, "ingestion manager is not configured")
    try:
        result = manager.fetch_player_shots(body.player_id, body.season, body.season_type)
    except IngestionBusyError as exc:
        raise HTTPException(409, str(exc)) from exc
    except ProviderError as exc:
        raise HTTPException(502, f"provider error: {exc}") from exc
    return ok(result)
