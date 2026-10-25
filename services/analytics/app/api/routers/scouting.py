from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from app.api.deps import get_db
from app.api.envelope import clean, ok
from app.api.params import SeasonParam, SeasonTypeParam
from app.data.repositories import players as players_repo
from app.scouting.compute import Cohort, compute_traits
from app.scouting.traits import TRAIT_INDEX, TRAIT_REGISTRY_VERSION, registry

router = APIRouter(prefix="/api/scouting", tags=["scouting"])


@router.get("/traits")
def trait_registry():
    return ok(registry(), {"trait_registry_version": TRAIT_REGISTRY_VERSION})


@router.get("/traits/{player_id}")
def player_traits(
    player_id: int,
    season: SeasonParam,
    season_type: SeasonTypeParam = "Regular Season",
    keys: Annotated[
        str | None, Query(description="comma-separated trait keys; default all")
    ] = None,
    min_gp: Annotated[int, Query(ge=0)] = 10,
    min_minutes: Annotated[float, Query(ge=0)] = 100,
    position: Annotated[str | None, Query(pattern="^(G|F|C)$")] = None,
    db=Depends(get_db),
):
    wanted = [k.strip() for k in keys.split(",") if k.strip()] if keys else None
    unknown = [k for k in (wanted or []) if k not in TRAIT_INDEX]
    if unknown:
        raise HTTPException(422, f"unknown trait keys {unknown}; see /api/scouting/traits")
    if players_repo.bio(db, player_id) is None:
        raise HTTPException(404, f"player {player_id} not found")
    cohort = Cohort(min_gp=min_gp, min_minutes=min_minutes, position=position)
    records = compute_traits(db, [player_id], season, season_type, cohort=cohort, trait_keys=wanted)
    return ok(
        clean(records),
        {
            "trait_registry_version": TRAIT_REGISTRY_VERSION,
            "cohort": cohort.__dict__,
            "season": season,
            "season_type": season_type,
        },
    )


# --- role templates and candidate search (C-02) --------------------------------------------------

from typing import Any, Literal  # noqa: E402

from fastapi import Request  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from app.api.deps import get_layout, get_state_db  # noqa: E402
from app.scouting.candidates import CandidateQuery, search_candidates  # noqa: E402
from app.scouting.role_store import list_custom_roles, load_role, save_custom_role  # noqa: E402
from app.scouting.roles import BUILTIN_ROLES, FilterRule, RoleComponent, RoleTemplate  # noqa: E402


class ComponentIn(BaseModel):
    trait_key: str
    weight: float = Field(gt=0, le=100)
    higher_is_better: bool | None = None


class FilterIn(BaseModel):
    column: str = Field(min_length=1, max_length=40)
    op: Literal["<=", ">=", "in", "qualified"]
    value: Any = None


class RoleIn(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=400)
    components: list[ComponentIn] = Field(min_length=1, max_length=12)
    filters: list[FilterIn] = Field(default_factory=list, max_length=12)
    optional_video_traits: list[str] = Field(default_factory=list, max_length=6)
    caveats: list[str] = Field(default_factory=list, max_length=6)


class CustomCandidatesIn(RoleIn):
    season: str = Field(pattern=r"^\d{4}-\d{2}$")
    season_type: Literal["Regular Season", "Playoffs", "Pre Season"] = "Regular Season"
    min_gp: int = Field(default=20, ge=0)
    min_minutes: float = Field(default=400, ge=0)
    position: Literal["G", "F", "C"] | None = None
    limit: int = Field(default=50, ge=1, le=200)
    offset: int = Field(default=0, ge=0)
    normalization: Literal["percentile", "zscore"] = "percentile"


def _template_from(body: RoleIn, role_id: str = "custom") -> RoleTemplate:
    return RoleTemplate(
        role_id=role_id,
        version=1,
        label=body.label,
        description=body.description,
        components=tuple(
            RoleComponent(c.trait_key, c.weight, c.higher_is_better) for c in body.components
        ),
        filters=tuple(
            FilterRule(f.column, f.op, tuple(f.value) if isinstance(f.value, list) else f.value)
            for f in body.filters
        ),
        optional_video_traits=tuple(body.optional_video_traits),
        caveats=tuple(body.caveats),
        is_builtin=False,
    )


def _run_candidates(
    db,
    layout,
    state_db,
    role: RoleTemplate,
    season,
    season_type,
    min_gp,
    min_minutes,
    position,
    limit,
    offset,
    normalization,
):
    q = CandidateQuery(
        role=role,
        season=season,
        season_type=season_type,
        cohort=Cohort(min_gp=min_gp, min_minutes=min_minutes, position=position),
        limit=limit,
        offset=offset,
        normalization=normalization,
        layout=layout,
        state_db=state_db,
    )
    try:
        result = search_candidates(db, q)
    except KeyError as exc:
        raise HTTPException(422, f"unknown trait or column {exc}") from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return ok(clean(result.rows), clean(result.meta))


@router.get("/roles")
def roles(state_db=Depends(get_state_db)):
    rows = [r.to_dict() for r in BUILTIN_ROLES] + [r.to_dict() for r in list_custom_roles(state_db)]
    return ok(rows, {"trait_registry_version": TRAIT_REGISTRY_VERSION})


@router.get("/roles/{role_id}")
def role_detail(role_id: str, state_db=Depends(get_state_db)):
    role = load_role(state_db, role_id)
    if role is None:
        raise HTTPException(404, f"role {role_id} not found")
    return ok(role.to_dict())


@router.post("/roles", status_code=201)
def create_role(body: RoleIn, state_db=Depends(get_state_db)):
    try:
        saved = save_custom_role(state_db, _template_from(body, role_id=""))
    except KeyError as exc:
        raise HTTPException(422, f"unknown trait {exc}") from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return ok(saved.to_dict())


@router.get("/candidates")
def candidates(
    role: str,
    season: SeasonParam,
    season_type: SeasonTypeParam = "Regular Season",
    min_gp: Annotated[int, Query(ge=0)] = 20,
    min_minutes: Annotated[float, Query(ge=0)] = 400,
    position: Annotated[str | None, Query(pattern="^(G|F|C)$")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    normalization: Literal["percentile", "zscore"] = "percentile",
    db=Depends(get_db),
    layout=Depends(get_layout),
    state_db=Depends(get_state_db),
):
    template = load_role(state_db, role)
    if template is None:
        raise HTTPException(404, f"role {role!r} not found; see /api/scouting/roles")
    return _run_candidates(
        db,
        layout,
        state_db,
        template,
        season,
        season_type,
        min_gp,
        min_minutes,
        position,
        limit,
        offset,
        normalization,
    )


@router.post("/candidates")
def custom_candidates(
    body: CustomCandidatesIn,
    request: Request,
    db=Depends(get_db),
    layout=Depends(get_layout),
    state_db=Depends(get_state_db),
):
    return _run_candidates(
        db,
        layout,
        state_db,
        _template_from(body),
        body.season,
        body.season_type,
        body.min_gp,
        body.min_minutes,
        body.position,
        body.limit,
        body.offset,
        body.normalization,
    )


# --- profiles (C-03) ---------------------------------------------------------------------------------

from app.scouting.profiles import build_profile, list_snapshots  # noqa: E402


@router.get("/profiles/{player_id}")
def profile(
    player_id: int,
    season: SeasonParam,
    season_type: SeasonTypeParam = "Regular Season",
    min_gp: Annotated[int, Query(ge=0)] = 10,
    min_minutes: Annotated[float, Query(ge=0)] = 100,
    position: Annotated[str | None, Query(pattern="^(G|F|C)$")] = None,
    db=Depends(get_db),
    layout=Depends(get_layout),
    state_db=Depends(get_state_db),
):
    cohort = Cohort(min_gp=min_gp, min_minutes=min_minutes, position=position)
    data = build_profile(db, state_db, layout, player_id, season, season_type, cohort=cohort)
    if data is None:
        raise HTTPException(404, f"player {player_id} not found")
    return ok(
        clean(data),
        {
            "snapshot_id": data["snapshot"]["snapshot_id"],
            "data_fingerprint": data["snapshot"]["data_fingerprint"],
            "trait_registry_version": TRAIT_REGISTRY_VERSION,
        },
    )


@router.get("/profiles/{player_id}/snapshots")
def profile_snapshots(
    player_id: int,
    season: SeasonParam,
    season_type: SeasonTypeParam = "Regular Season",
    state_db=Depends(get_state_db),
):
    return ok(clean(list_snapshots(state_db, player_id, season, season_type)))


# --- shortlists (C-04) -------------------------------------------------------------------------------

from app.evidence.evidence_items import EvidenceNamespaceError  # noqa: E402
from app.scouting import shortlists as sl  # noqa: E402

ULID = r"^[0-9A-HJKMNP-TV-Z]{26}$"


class ShortlistSource(BaseModel):
    role: str
    min_gp: int = Field(default=20, ge=0)
    min_minutes: float = Field(default=400, ge=0)
    position: Literal["G", "F", "C"] | None = None
    limit: int = Field(default=20, ge=1, le=100)
    normalization: Literal["percentile", "zscore"] = "percentile"


class ShortlistIn(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    season: str = Field(pattern=r"^\d{4}-\d{2}$")
    season_type: Literal["Regular Season", "Playoffs", "Pre Season"] = "Regular Season"
    notes: str | None = Field(default=None, max_length=2000)
    source: ShortlistSource | None = None
    player_ids: list[int] = Field(default_factory=list, max_length=100)


class ShortlistPatch(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=80)
    notes: str | None = Field(default=None, max_length=2000)


class EntriesIn(BaseModel):
    player_ids: list[int] = Field(min_length=1, max_length=100)
    added_by: Literal["manual", "compare", "candidates"] = "manual"


class EntryPatch(BaseModel):
    pinned: bool | None = None
    note: str | None = Field(default=None, max_length=1000)


def _guard(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except KeyError as exc:
        raise HTTPException(404, f"not found: {exc}") from exc
    except EvidenceNamespaceError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/shortlists")
def shortlists(state_db=Depends(get_state_db)):
    rows = sl.list_shortlists(state_db)
    return ok(clean(rows), {"total": len(rows)})


@router.post("/shortlists", status_code=201)
def create_shortlist(
    body: ShortlistIn,
    db=Depends(get_db),
    layout=Depends(get_layout),
    state_db=Depends(get_state_db),
):
    candidates: list[dict] = []
    meta = None
    role_id = role_version = None
    cohort = None
    if body.source is not None:
        template = load_role(state_db, body.source.role)
        if template is None:
            raise HTTPException(404, f"role {body.source.role!r} not found")
        cohort = Cohort(
            min_gp=body.source.min_gp,
            min_minutes=body.source.min_minutes,
            position=body.source.position,
        )
        result = search_candidates(
            db,
            CandidateQuery(
                role=template,
                season=body.season,
                season_type=body.season_type,
                cohort=cohort,
                limit=body.source.limit,
                normalization=body.source.normalization,
                layout=layout,
                state_db=state_db,
            ),
        )
        candidates, meta, role_id, role_version = (
            result.rows,
            result.meta,
            template.role_id,
            template.version,
        )
    created = _guard(
        sl.create_shortlist,
        state_db,
        label=body.label,
        season=body.season,
        season_type=body.season_type,
        role_id=role_id,
        role_version=role_version,
        cohort=cohort,
        ranking_meta=meta,
        candidates=candidates,
        player_ids=body.player_ids,
        notes=body.notes,
    )
    return ok(clean(created))


@router.get("/shortlists/{shortlist_id}")
def shortlist_detail(
    shortlist_id: Annotated[str, Path(pattern=ULID)], state_db=Depends(get_state_db)
):
    row = sl.get_shortlist(state_db, shortlist_id)
    if row is None:
        raise HTTPException(404, f"shortlist {shortlist_id} not found")
    return ok(clean(row))


@router.patch("/shortlists/{shortlist_id}")
def patch_shortlist(
    shortlist_id: Annotated[str, Path(pattern=ULID)],
    body: ShortlistPatch,
    state_db=Depends(get_state_db),
):
    return ok(
        clean(
            _guard(sl.update_shortlist, state_db, shortlist_id, label=body.label, notes=body.notes)
        )
    )


@router.delete("/shortlists/{shortlist_id}")
def delete_shortlist(
    shortlist_id: Annotated[str, Path(pattern=ULID)], state_db=Depends(get_state_db)
):
    _guard(sl.delete_shortlist, state_db, shortlist_id)
    return ok({"deleted": shortlist_id})


@router.post("/shortlists/{shortlist_id}/entries")
def add_shortlist_entries(
    shortlist_id: Annotated[str, Path(pattern=ULID)],
    body: EntriesIn,
    state_db=Depends(get_state_db),
):
    return ok(
        clean(
            _guard(
                sl.add_entries,
                state_db,
                shortlist_id,
                player_ids=body.player_ids,
                added_by=body.added_by,
            )
        )
    )


@router.patch("/shortlists/{shortlist_id}/entries/{player_id}")
def patch_entry(
    shortlist_id: Annotated[str, Path(pattern=ULID)],
    player_id: int,
    body: EntryPatch,
    state_db=Depends(get_state_db),
):
    return ok(
        clean(
            _guard(
                sl.update_entry,
                state_db,
                shortlist_id,
                player_id,
                pinned=body.pinned,
                note=body.note,
            )
        )
    )


@router.delete("/shortlists/{shortlist_id}/entries/{player_id}")
def delete_entry(
    shortlist_id: Annotated[str, Path(pattern=ULID)], player_id: int, state_db=Depends(get_state_db)
):
    return ok(clean(_guard(sl.remove_entry, state_db, shortlist_id, player_id)))


# --- reports (C-05) --------------------------------------------------------------------------------

from app.scouting import reports as rp  # noqa: E402
from app.scouting.claims import Claim  # noqa: E402


class ReportIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    shortlist_id: str | None = Field(default=None, pattern=ULID)
    player_ids: list[int] | None = Field(default=None, max_length=12)
    season: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}$")
    season_type: Literal["Regular Season", "Playoffs", "Pre Season"] = "Regular Season"
    min_gp: int = Field(default=10, ge=0)
    min_minutes: float = Field(default=100, ge=0)


class ReportPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    status: Literal["draft", "final"] | None = None
    interpretation: str | None = Field(default=None, max_length=20000)


class ClaimsIn(BaseModel):
    claims: list[Claim] = Field(min_length=1, max_length=50)


@router.get("/reports")
def reports(state_db=Depends(get_state_db)):
    rows = rp.list_reports(state_db)
    return ok(clean(rows), {"total": len(rows)})


@router.post("/reports", status_code=201)
def create_report(
    body: ReportIn, db=Depends(get_db), layout=Depends(get_layout), state_db=Depends(get_state_db)
):
    try:
        report = rp.build_report_draft(
            db,
            state_db,
            layout,
            shortlist_id=body.shortlist_id,
            player_ids=body.player_ids,
            season=body.season,
            season_type=body.season_type,
            title=body.title,
            cohort=Cohort(min_gp=body.min_gp, min_minutes=body.min_minutes),
        )
    except KeyError as exc:
        raise HTTPException(404, f"shortlist not found: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return ok(
        clean(report),
        {"llm_mode": report["llm_mode"], "data_fingerprint": report["data_fingerprint"]},
    )


@router.get("/reports/{report_id}")
def report_detail(report_id: Annotated[str, Path(pattern=ULID)], state_db=Depends(get_state_db)):
    report = rp.get_report(state_db, report_id)
    if report is None:
        raise HTTPException(404, f"report {report_id} not found")
    return ok(clean(report), {"llm_mode": report["llm_mode"]})


@router.patch("/reports/{report_id}")
def patch_report(
    report_id: Annotated[str, Path(pattern=ULID)], body: ReportPatch, state_db=Depends(get_state_db)
):
    return ok(
        clean(
            _guard(
                rp.update_report,
                state_db,
                report_id,
                title=body.title,
                status=body.status,
                interpretation=body.interpretation,
            )
        )
    )


@router.post("/reports/{report_id}/claims")
def add_report_claims(
    report_id: Annotated[str, Path(pattern=ULID)], body: ClaimsIn, state_db=Depends(get_state_db)
):
    return ok(clean(_guard(rp.add_claims, state_db, report_id, body.claims)))
