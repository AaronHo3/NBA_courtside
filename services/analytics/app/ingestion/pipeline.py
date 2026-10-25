"""Resumable ingestion runner: plan -> fetch (cached) -> normalize -> validate -> Parquet -> manifest.

The manifest is rewritten after every step, so a re-run skips steps already marked ``ok`` unless
``refresh`` is requested or the entry is stale (in-progress season older than 24h). ``partial``
steps are re-executed: their successful sub-requests come from the raw cache, so only the failed
ones hit the provider.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable, Iterator
from dataclasses import asdict, dataclass, field
from datetime import UTC, date, datetime, timedelta

import pandas as pd
import pyarrow.parquet as pq

from app.data.manifest import Manifest, ManifestEntry
from app.data.parquet_io import record_failure, write_family
from app.data.paths import DataLayout
from app.data.schemas import FAMILIES, SEASON_TYPES, SNAPSHOT_FAMILIES, conform
from app.ingestion.fetchers import FETCHERS, StepContext, StepOutput, shot_params
from app.ingestion.normalize.shots import merge_shots, normalize_league_zone_avg, normalize_shots
from app.ingestion.providers.base import SOURCE_NBA_API, ProviderError, StatsProvider

log = logging.getLogger("nba.ingestion.pipeline")

STEP_ORDER: tuple[str, ...] = (
    "teams",
    "players",
    "team_season",
    "player_season",
    "combine_anthro",
    "player_game_logs",
    "team_game_logs",
    "games",
    "events",
    "lineups",
    "on_off",
    "defense_dash",
    "matchups",
    "shots",
    "player_bios",
)
GLOBAL_FAMILIES: frozenset[str] = frozenset({"teams", "players", "player_bios"})
SEASON_ONLY_FAMILIES: frozenset[str] = frozenset({"combine_anthro"})
ALIASES: dict[str, str] = {
    "shot_league_zone_avg": "shots",
    "event_participants": "events",
    "event_id_map": "events",
}
# Never part of `all`: per-player bios (one call each) and per-game play-by-play (one call per game).
ON_DEMAND_FAMILIES: frozenset[str] = frozenset({"player_bios", "events"})
# Always re-run when requested: their coverage is per player / per game, not per season.
NEVER_SKIP_FAMILIES: frozenset[str] = frozenset({"player_bios", "events"})
FIRST_SEASON_START_YEAR: dict[str, int] = {
    "matchups": 2017,
    "defense_dash": 2013,
    "shots": 1996,
    "combine_anthro": 2000,
}
STALE_AFTER = timedelta(hours=24)
REQUIRED_IDS: dict[str, tuple[str, ...]] = {
    "players": ("player_id",),
    "teams": ("team_id",),
    "player_season": ("player_id", "team_id"),
    "team_season": ("team_id",),
    "player_game_logs": ("player_id", "game_id"),
    "team_game_logs": ("team_id", "game_id"),
    "games": ("game_id", "home_team_id", "away_team_id"),
    "events": ("game_id", "source_event_system", "source_event_id"),
    "event_participants": ("game_id", "source_event_id", "person_id"),
    "event_id_map": ("game_id", "shots_game_event_id"),
    "shots": ("game_id", "player_id"),
    "matchups": ("off_player_id", "def_player_id"),
    "defense_dash": ("player_id",),
    "lineups": ("group_id", "team_id"),
    "on_off": ("team_id", "player_id"),
    "combine_anthro": ("player_id",),
}
COUNT_COLUMNS: tuple[str, ...] = (
    "gp",
    "fga",
    "fgm",
    "fta",
    "ftm",
    "min",
    "poss",
    "d_fga",
    "matchup_fga",
)
ProgressCallback = Callable[["StepResult"], None]


class ValidationError(ValueError):
    pass


def season_start_year(season: str) -> int:
    return int(season[:4])


def is_in_progress_season(season: str, today: date) -> bool:
    start = season_start_year(season)
    return start == today.year or (start == today.year - 1 and today.month < 7)


def unsupported_reason(family: str, season: str) -> str | None:
    first = FIRST_SEASON_START_YEAR.get(family)
    if first is None or season_start_year(season) >= first:
        return None
    return f"{family} is not published by stats.nba.com before {first}-{str(first + 1)[-2:]}"


@dataclass(frozen=True)
class IngestionPlan:
    seasons: tuple[str, ...]
    season_types: tuple[str, ...] = ("Regular Season",)
    families: tuple[str, ...] = ("all",)

    def resolved_families(self) -> tuple[str, ...]:
        requested = set(self.families)
        if "all" in requested:
            everything = {
                f
                for f in FAMILIES
                if ALIASES.get(f, f) not in ON_DEMAND_FAMILIES and f not in SNAPSHOT_FAMILIES
            }
            requested = (requested - {"all"}) | everything
        mapped = {ALIASES.get(f, f) for f in requested}
        unknown = mapped - set(STEP_ORDER)
        if unknown:
            raise ValueError(f"unknown families: {sorted(unknown)}")
        return tuple(f for f in STEP_ORDER if f in mapped)

    def steps(self) -> tuple[Step, ...]:
        out: list[Step] = []
        for family in self.resolved_families():
            if family in GLOBAL_FAMILIES:
                out.append(Step(family))
            elif family in SEASON_ONLY_FAMILIES:
                out.extend(Step(family, s) for s in self.seasons)
            else:
                out.extend(Step(family, s, t) for s in self.seasons for t in self.season_types)
        return tuple(out)

    def summary(self) -> dict:
        return {
            "seasons": list(self.seasons),
            "season_types": list(self.season_types),
            "families": list(self.resolved_families()),
            "steps": len(self.steps()),
        }


@dataclass(frozen=True)
class Step:
    family: str
    season: str | None = None
    season_type: str | None = None

    @property
    def manifest_family(self) -> str:
        return "players" if self.family == "player_bios" else self.family

    def label(self) -> str:
        return " ".join(str(p) for p in (self.family, self.season, self.season_type) if p)


@dataclass(frozen=True)
class StepResult:
    family: str
    season: str | None
    season_type: str | None
    status: str
    rows: int = 0
    error: str | None = None
    note: str | None = None
    skipped: bool = False
    seconds: float = 0.0

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass
class RunReport:
    started_at: datetime
    plan: dict
    results: list[StepResult] = field(default_factory=list)
    finished_at: datetime | None = None

    @property
    def ok(self) -> int:
        return sum(r.status in ("ok", "partial") and not r.skipped for r in self.results)

    @property
    def failed(self) -> int:
        return sum(r.status == "failed" for r in self.results)

    def summary(self) -> dict:
        return {
            "started_at": self.started_at.isoformat(),
            "plan": self.plan,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "ok": self.ok,
            "failed": self.failed,
            "skipped": sum(r.skipped for r in self.results),
            "steps": len(self.results),
        }


def validate(df: pd.DataFrame, family: str) -> pd.DataFrame:
    """Conform to the schema; required ids must be non-null, counting stats non-negative."""
    out = conform(df, family)
    for col in REQUIRED_IDS.get(family, ()):
        if col in out.columns and len(out) and out[col].isna().any():
            raise ValidationError(f"{family}: {int(out[col].isna().sum())} rows with null {col}")
    for col in COUNT_COLUMNS:
        if col in out.columns and len(out):
            values = pd.to_numeric(out[col], errors="coerce")
            if (values < 0).any():
                raise ValidationError(f"{family}: negative values in {col}")
    return out


def _skip_reason(entry: ManifestEntry | None, step: Step, refresh: bool, today: date) -> str | None:
    if refresh or entry is None or entry.status != "ok":
        return None  # partial/failed/missing/stale steps run again; cached sub-requests are free
    if step.season and entry.fetched_at and is_in_progress_season(step.season, today):
        age = datetime.now(UTC) - entry.fetched_at.astimezone(UTC)
        if age > STALE_AFTER:
            return None
    return f"already {entry.status} ({entry.rows} rows)"


def _mark_stale(layout: DataLayout, entry: ManifestEntry | None, step: Step, today: date) -> bool:
    if entry is None or not step.season or not entry.fetched_at:
        return False
    if entry.status not in ("ok", "partial") or not is_in_progress_season(step.season, today):
        return False
    if datetime.now(UTC) - entry.fetched_at.astimezone(UTC) <= STALE_AFTER:
        return False
    Manifest.load(layout).upsert(entry.model_copy(update={"status": "stale"})).save(layout)
    return True


def _write_outputs(layout: DataLayout, step: Step, output: StepOutput) -> StepResult:
    rows = 0
    for family, frame in output.frames.items():
        validated = validate(frame, family)
        entry = write_family(
            layout,
            family,
            validated,
            source=SOURCE_NBA_API,
            season=step.season,
            season_type=step.season_type,
            note=output.note,
        )
        if output.partial and entry.rows > 0:
            Manifest.load(layout).upsert(entry.model_copy(update={"status": "partial"})).save(
                layout
            )
        rows = entry.rows if family == step.manifest_family else rows
    status = "partial" if output.partial else ("ok" if rows > 0 else "missing")
    return StepResult(
        step.family, step.season, step.season_type, status, rows=rows, note=output.note
    )


def _record_missing(layout: DataLayout, step: Step, reason: str) -> StepResult:
    entry = ManifestEntry(
        family=step.family,
        season=step.season,
        season_type=step.season_type,
        status="missing",
        rows=0,
        fetched_at=datetime.now(UTC),
        source=SOURCE_NBA_API,
        note=reason,
    )
    Manifest.load(layout).upsert(entry).save(layout)
    return StepResult(step.family, step.season, step.season_type, "missing", note=reason)


def _execute(ctx: StepContext, step: Step) -> StepResult:
    started = time.monotonic()
    try:
        fetcher = FETCHERS[step.family]
        output = fetcher(ctx, step.season, step.season_type) if step.season else fetcher(ctx)
        result = _write_outputs(ctx.layout, step, output)
    except (ProviderError, ValidationError, Exception) as exc:  # noqa: B014 - continue past any step failure
        log.exception("step %s failed", step.label())
        record_failure(
            ctx.layout,
            step.manifest_family,
            source=SOURCE_NBA_API,
            error=f"{type(exc).__name__}: {exc}",
            season=step.season,
            season_type=step.season_type,
        )
        result = StepResult(
            step.family,
            step.season,
            step.season_type,
            "failed",
            error=f"{type(exc).__name__}: {exc}",
        )
    return StepResult(**{**result.as_dict(), "seconds": round(time.monotonic() - started, 3)})


def iter_run(
    layout: DataLayout,
    provider: StatsProvider,
    plan: IngestionPlan,
    *,
    refresh: bool = False,
    players_limit: int | None = None,
    today: date | None = None,
    game_ids: tuple[str, ...] | None = None,
    games_limit: int | None = None,
) -> Iterator[StepResult]:
    today = today or datetime.now(UTC).date()
    for step in plan.steps():
        if step.season and (reason := unsupported_reason(step.family, step.season)):
            yield _record_missing(layout, step, reason)
            continue
        entry = Manifest.load(layout).find(step.manifest_family, step.season, step.season_type)
        if step.family not in NEVER_SKIP_FAMILIES and (
            why := _skip_reason(entry, step, refresh, today)
        ):
            yield StepResult(
                step.family,
                step.season,
                step.season_type,
                entry.status,
                rows=entry.rows,
                note=why,
                skipped=True,
            )
            continue
        stale = _mark_stale(layout, entry, step, today)
        max_age = STALE_AFTER if (stale and not refresh) else None
        ctx = StepContext(
            layout,
            provider,
            refresh=refresh,
            max_age=max_age,
            players_limit=players_limit,
            game_ids=game_ids,
            games_limit=games_limit,
        )
        yield _execute(ctx, step)


def run(
    layout: DataLayout,
    provider: StatsProvider,
    plan: IngestionPlan,
    *,
    refresh: bool = False,
    progress: ProgressCallback | None = None,
    players_limit: int | None = None,
    today: date | None = None,
    game_ids: tuple[str, ...] | None = None,
    games_limit: int | None = None,
) -> RunReport:
    report = RunReport(started_at=datetime.now(UTC), plan=plan.summary())
    for result in iter_run(
        layout,
        provider,
        plan,
        refresh=refresh,
        players_limit=players_limit,
        today=today,
        game_ids=game_ids,
        games_limit=games_limit,
    ):
        report.results.append(result)
        log.info(
            "step %s %s %s -> %s rows=%d",
            result.family,
            result.season,
            result.season_type,
            result.status,
            result.rows,
        )
        if progress is not None:
            progress(result)
    report.finished_at = datetime.now(UTC)
    return report


def _read_file(path) -> pd.DataFrame:
    return pq.read_table(path).to_pandas() if path.exists() else pd.DataFrame()


def fetch_player_shots(
    layout: DataLayout,
    provider: StatsProvider,
    player_id: int,
    season: str,
    season_type: str,
    *,
    refresh: bool = False,
) -> dict:
    """On-demand single-player shot fetch merged into the season shots file (dedup on event)."""
    if season_type not in SEASON_TYPES:
        raise ValueError(f"season_type must be one of {SEASON_TYPES}")
    from app.ingestion.fetchers import load_teams

    ctx = StepContext(layout, provider, refresh=refresh)
    raw = ctx.get("shots", "shotchartdetail", shot_params(season, season_type, player_id=player_id))
    incoming = normalize_shots(
        [raw.payload], season=season, season_type=season_type, teams=load_teams(layout)
    )
    existing = _read_file(layout.family_file("shots", season, season_type))
    merged = merge_shots(existing, incoming)
    entry = write_family(
        layout,
        "shots",
        validate(merged, "shots"),
        source=SOURCE_NBA_API,
        season=season,
        season_type=season_type,
    )
    if not layout.family_file("shot_league_zone_avg", season, season_type).exists():
        zones = normalize_league_zone_avg(raw.payload, season=season, season_type=season_type)
        write_family(
            layout,
            "shot_league_zone_avg",
            zones,
            source=SOURCE_NBA_API,
            season=season,
            season_type=season_type,
        )
    return {
        "player_id": player_id,
        "season": season,
        "season_type": season_type,
        "fetched_rows": int(len(incoming)),
        "added_rows": int(len(merged) - len(existing)),
        "total_rows": int(entry.rows),
        "from_cache": raw.from_cache,
    }
