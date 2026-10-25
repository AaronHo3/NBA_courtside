"""One fetch+normalize function per family. Every provider call goes through the raw cache.

Each function returns a :class:`StepOutput`: the frames to write (family -> DataFrame), whether the
result is partial (some sub-requests failed) and a human-readable note.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

import pandas as pd
import pyarrow.parquet as pq

from app.data.parquet_io import read_family
from app.data.paths import DataLayout
from app.events import games
from app.events.id_map import build_event_id_map
from app.events.normalize_pbp import normalize_pbp_v3
from app.ingestion.cache import get_or_fetch
from app.ingestion.normalize import (
    combine,
    defense_dash,
    game_logs,
    lineups,
    matchups,
    on_off,
    player_season,
    players,
    shots,
    team_season,
    teams,
)
from app.ingestion.providers.base import ProviderError, RawResponse, StatsProvider

log = logging.getLogger("nba.ingestion.fetch")

Payload = dict[str, Any]


@dataclass(frozen=True)
class StepContext:
    layout: DataLayout
    provider: StatsProvider
    refresh: bool = False
    max_age: timedelta | None = None
    players_limit: int | None = None
    # Per-game families (events): explicit game ids, or the first N games of the season's `games` family.
    game_ids: tuple[str, ...] | None = None
    games_limit: int | None = None

    def get(self, family: str, endpoint: str, params: dict[str, Any]) -> RawResponse:
        return get_or_fetch(
            self.provider,
            self.layout,
            family,
            endpoint,
            params,
            max_age=self.max_age,
            refresh=self.refresh,
        )


@dataclass(frozen=True)
class StepOutput:
    frames: dict[str, pd.DataFrame]
    partial: bool = False
    note: str | None = None
    failures: tuple[str, ...] = field(default=())


Fetcher = Callable[..., StepOutput]


def load_teams(layout: DataLayout) -> pd.DataFrame:
    stored = read_family(layout, "teams")
    return stored if not stored.empty else teams.normalize_teams()


def _collect(
    ctx: StepContext, family: str, endpoint: str, param_sets: Iterable[tuple[str, dict[str, Any]]]
) -> tuple[list[tuple[str, Payload]], list[str]]:
    """Fetch many parameterisations, continuing past per-call provider errors."""
    payloads: list[tuple[str, Payload]] = []
    failures: list[str] = []
    for label, params in param_sets:
        try:
            payloads.append((label, ctx.get(family, endpoint, params).payload))
        except ProviderError as exc:
            log.warning("%s %s failed for %s: %s", family, endpoint, label, exc)
            failures.append(f"{label}: {exc}")
    return payloads, failures


def _output(frames: dict[str, pd.DataFrame], failures: list[str], total: int) -> StepOutput:
    if not failures:
        return StepOutput(frames=frames)
    note = f"{len(failures)}/{total} sub-requests failed: " + "; ".join(failures)[:400]
    return StepOutput(frames=frames, partial=True, note=note, failures=tuple(failures))


# --- non-seasonal -----------------------------------------------------------------------------


def fetch_teams(ctx: StepContext) -> StepOutput:
    return StepOutput(frames={"teams": teams.normalize_teams()})


def fetch_players(ctx: StepContext) -> StepOutput:
    raw = ctx.get("players", "commonallplayers", {"is_only_current_season": 0})
    return StepOutput(frames={"players": players.normalize_players(raw.payload)})


def fetch_player_bios(ctx: StepContext) -> StepOutput:
    """Enrich the stored players family with commonplayerinfo (one call per player)."""
    base = read_family(ctx.layout, "players")
    if base.empty:
        raise ProviderError("players family must be ingested before player bios")
    ids = [int(i) for i in base["player_id"].dropna()]
    # Only players who appear in an ingested season need a bio (the directory has ~5,000 names).
    seasons_df = read_family(ctx.layout, "player_season")
    if not seasons_df.empty:
        wanted = {int(i) for i in seasons_df["player_id"].dropna()}
        already = (
            set(base.loc[base["position"].notna(), "player_id"].astype(int))
            if "position" in base
            else set()
        )
        ids = [i for i in ids if i in wanted and i not in already]
    if ctx.players_limit is not None:
        ids = ids[: ctx.players_limit]
    payloads, failures = _collect(
        ctx, "players", "commonplayerinfo", ((str(i), {"player_id": i}) for i in ids)
    )
    bios = [players.normalize_player_bio(p) for _, p in payloads]
    bio_df = pd.concat(bios, ignore_index=True) if bios else pd.DataFrame(columns=["player_id"])
    merged = players.merge_bios(base, bio_df)
    out = _output({"players": merged}, failures, len(ids))
    note = f"bios fetched for {len(payloads)} of {len(base)} players"
    return StepOutput(
        frames=out.frames,
        partial=out.partial,
        note=f"{note}; {out.note}" if out.note else note,
        failures=out.failures,
    )


# --- seasonal ---------------------------------------------------------------------------------


def _dash_params(season: str, season_type: str, measure: str, **extra: Any) -> dict[str, Any]:
    return {
        "season": season,
        "season_type_all_star": season_type,
        "measure_type_detailed_defense": measure,
        "per_mode_detailed": "Totals",
        **extra,
    }


def fetch_team_season(ctx: StepContext, season: str, season_type: str) -> StepOutput:
    fam = "team_season"
    base = ctx.get(fam, "leaguedashteamstats", _dash_params(season, season_type, "Base")).payload
    extras, failures = _collect(
        ctx,
        fam,
        "leaguedashteamstats",
        [(m, _dash_params(season, season_type, m)) for m in ("Advanced", "Four Factors")],
    )
    by_label = dict(extras)
    df = team_season.normalize_team_season(
        base,
        by_label.get("Advanced"),
        by_label.get("Four Factors"),
        season=season,
        season_type=season_type,
    )
    return _output({fam: df}, failures, 3)


def fetch_player_season(ctx: StepContext, season: str, season_type: str) -> StepOutput:
    fam, ep = "player_season", "leaguedashplayerstats"
    league_base = ctx.get(fam, ep, _dash_params(season, season_type, "Base")).payload
    adv, failures = _collect(
        ctx, fam, ep, [("Advanced", _dash_params(season, season_type, "Advanced"))]
    )
    league_adv = adv[0][1] if adv else None
    teams_df = load_teams(ctx.layout)
    team_ids = [int(t) for t in teams_df["team_id"]]
    abbreviations = {
        int(t): str(a) for t, a in zip(teams_df["team_id"], teams_df["abbreviation"], strict=True)
    }
    team_payloads: list[tuple[int, Payload, Payload | None]] = []
    for team_id in team_ids:
        got, failed = _collect(
            ctx,
            fam,
            ep,
            [
                (
                    f"{m} team {team_id}",
                    _dash_params(season, season_type, m, team_id_nullable=team_id),
                )
                for m in ("Base", "Advanced")
            ],
        )
        failures = [*failures, *failed]
        labelled = dict(got)
        base_payload = next((p for k, p in got if k.startswith("Base")), None)
        if base_payload is not None:
            adv_payload = next((p for k, p in labelled.items() if k.startswith("Advanced")), None)
            team_payloads.append((team_id, base_payload, adv_payload))
    df = player_season.normalize_player_season(
        league_base,
        league_adv,
        team_payloads,
        season=season,
        season_type=season_type,
        team_abbreviations=abbreviations,
    )
    return _output({fam: df}, failures, 2 + 2 * len(team_ids))


def fetch_combine_anthro(
    ctx: StepContext, season: str, season_type: str | None = None
) -> StepOutput:
    raw = ctx.get("combine_anthro", "draftcombineplayeranthro", {"season_year": season})
    df = combine.normalize_combine_anthro(raw.payload, combine_season=season)
    return StepOutput(frames={"combine_anthro": df})


def _log_params(season: str, season_type: str) -> dict[str, Any]:
    return {"season_nullable": season, "season_type_nullable": season_type}


def fetch_player_game_logs(ctx: StepContext, season: str, season_type: str) -> StepOutput:
    raw = ctx.get("player_game_logs", "playergamelogs", _log_params(season, season_type))
    abbr = teams.abbreviation_index(load_teams(ctx.layout))
    df = game_logs.normalize_player_game_logs(
        raw.payload, season=season, season_type=season_type, abbreviations=abbr
    )
    return StepOutput(frames={"player_game_logs": df})


def fetch_team_game_logs(ctx: StepContext, season: str, season_type: str) -> StepOutput:
    raw = ctx.get("team_game_logs", "teamgamelogs", _log_params(season, season_type))
    abbr = teams.abbreviation_index(load_teams(ctx.layout))
    df = game_logs.normalize_team_game_logs(
        raw.payload, season=season, season_type=season_type, abbreviations=abbr
    )
    return StepOutput(frames={"team_game_logs": df})


def fetch_games(ctx: StepContext, season: str, season_type: str) -> StepOutput:
    """Derive one row per game from the season's stored team_game_logs; never calls the provider."""
    path = ctx.layout.family_file("team_game_logs", season, season_type)
    if not path.exists():
        return StepOutput(
            frames={"games": games.derive_games(pd.DataFrame())},
            note=f"team_game_logs not ingested for {season} {season_type}; ingest that family first",
        )
    logs = pq.read_table(path).to_pandas()
    frame = games.derive_games(logs)
    notes: list[str] = []
    incomplete = games.incomplete_game_ids(logs)
    inconsistent = games.inconsistent_game_ids(logs)
    neutral = games.neutral_site_game_ids(logs)
    if neutral:
        notes.append(f"{len(neutral)} neutral-site games (home/away slots are arbitrary)")
    if incomplete:
        notes.append(f"{len(incomplete)} games have a single team row (other score null)")
    if inconsistent:
        notes.append(f"{len(inconsistent)} games have rows disagreeing on home/away or date")
    return StepOutput(
        frames={"games": frame}, partial=bool(incomplete), note="; ".join(notes) or None
    )


def _season_game_ids(ctx: StepContext, season: str, season_type: str) -> list[str] | None:
    if ctx.game_ids is not None:
        return [str(g) for g in ctx.game_ids]
    path = ctx.layout.family_file("games", season, season_type)
    if not path.exists():
        return None
    ids = sorted(pq.read_table(path, columns=["game_id"]).to_pandas()["game_id"].astype(str))
    return ids[: ctx.games_limit] if ctx.games_limit is not None else ids


def _merge_rows(existing: pd.DataFrame, incoming: pd.DataFrame, keys: list[str]) -> pd.DataFrame:
    """Union keeping the newest copy per key; inputs untouched."""
    if existing.empty:
        return incoming.copy()
    if incoming.empty:
        return existing.copy()
    combined = pd.concat([incoming, existing], ignore_index=True)
    return combined.drop_duplicates(subset=keys, keep="first").reset_index(drop=True)


def _existing(ctx: StepContext, family: str, season: str, season_type: str) -> pd.DataFrame:
    path = ctx.layout.family_file(family, season, season_type)
    return pq.read_table(path).to_pandas() if path.exists() else pd.DataFrame()


EVENT_KEYS = ["game_id", "source_event_system", "source_event_id", "source_order"]
MAP_KEYS = ["game_id", "shots_game_event_id"]


def fetch_events(ctx: StepContext, season: str, season_type: str) -> StepOutput:
    """Play-by-play per game (explicit ids or the first N games of the season), merged into the
    season's files, plus the shot-id correspondence for the games fetched."""
    empty = {
        "events": normalize_pbp_v3({}, game_id="", season=season, season_type=season_type)[0],
        "event_participants": normalize_pbp_v3(
            {}, game_id="", season=season, season_type=season_type
        )[1],
        "event_id_map": build_event_id_map(pd.DataFrame(), pd.DataFrame()),
    }
    game_ids = _season_game_ids(ctx, season, season_type)
    if game_ids is None:
        return StepOutput(
            frames=empty,
            note="no game list: pass --game-ids or ingest the games family first (events are never part of `all`)",
        )
    payloads, failures = _collect(
        ctx, "events", "playbyplayv3", ((gid, {"game_id": gid}) for gid in game_ids)
    )
    new_events, new_participants = [], []
    for gid, payload in payloads:
        ev, pa = normalize_pbp_v3(payload, game_id=gid, season=season, season_type=season_type)
        new_events.append(ev)
        new_participants.append(pa)
    incoming_events = pd.concat(new_events, ignore_index=True) if new_events else empty["events"]
    incoming_parts = (
        pd.concat(new_participants, ignore_index=True)
        if new_participants
        else empty["event_participants"]
    )
    events_all = _merge_rows(
        _existing(ctx, "events", season, season_type), incoming_events, EVENT_KEYS
    )
    parts_all = _merge_rows(
        _existing(ctx, "event_participants", season, season_type), incoming_parts, EVENT_KEYS
    )
    shots = _existing(ctx, "shots", season, season_type)
    fetched = {gid for gid, _ in payloads}
    incoming_map = (
        build_event_id_map(incoming_events, shots[shots["game_id"].isin(fetched)])
        if not shots.empty and not incoming_events.empty
        else empty["event_id_map"]
    )
    map_all = _merge_rows(
        _existing(ctx, "event_id_map", season, season_type), incoming_map, MAP_KEYS
    )
    covered = int(events_all["game_id"].nunique()) if not events_all.empty else 0
    note = f"{len(payloads)} game(s) ingested this run; {covered} game(s) in the season file"
    if shots.empty:
        note += "; no shots file, so no id map was built"
    out = _output(
        {"events": events_all, "event_participants": parts_all, "event_id_map": map_all},
        failures,
        len(game_ids),
    )
    return StepOutput(
        frames=out.frames,
        partial=out.partial,
        note=f"{note}; {out.note}" if out.note else note,
        failures=out.failures,
    )


def fetch_lineups(ctx: StepContext, season: str, season_type: str) -> StepOutput:
    fam, ep = "lineups", "leaguedashlineups"
    base = ctx.get(fam, ep, _dash_params(season, season_type, "Base", group_quantity=5)).payload
    adv, failures = _collect(
        ctx,
        fam,
        ep,
        [("Advanced", _dash_params(season, season_type, "Advanced", group_quantity=5))],
    )
    df = lineups.normalize_lineups(
        base, adv[0][1] if adv else None, season=season, season_type=season_type
    )
    return _output({fam: df}, failures, 2)


def fetch_on_off(ctx: StepContext, season: str, season_type: str) -> StepOutput:
    team_ids = [int(t) for t in load_teams(ctx.layout)["team_id"]]
    payloads, failures = _collect(
        ctx,
        "on_off",
        "teamplayeronoffsummary",
        [(f"team {t}", _dash_params(season, season_type, "Advanced", team_id=t)) for t in team_ids],
    )
    df = on_off.normalize_on_off([p for _, p in payloads], season=season, season_type=season_type)
    return _output({"on_off": df}, failures, len(team_ids))


def fetch_defense_dash(ctx: StepContext, season: str, season_type: str) -> StepOutput:
    payloads, failures = _collect(
        ctx,
        "defense_dash",
        "leaguedashptdefend",
        [
            (
                c,
                {
                    "season": season,
                    "season_type_all_star": season_type,
                    "per_mode_simple": "Totals",
                    "defense_category": c,
                },
            )
            for c in defense_dash.DEFENSE_CATEGORIES
        ],
    )
    df = defense_dash.normalize_defense_dash(payloads, season=season, season_type=season_type)
    return _output({"defense_dash": df}, failures, len(defense_dash.DEFENSE_CATEGORIES))


def _matchup_params(season: str, season_type: str, **extra: Any) -> dict[str, Any]:
    return {
        "season": season,
        "season_type_playoffs": season_type,
        "per_mode_simple": "Totals",
        **extra,
    }


def fetch_matchups(ctx: StepContext, season: str, season_type: str) -> StepOutput:
    fam, ep = "matchups", "leagueseasonmatchups"
    try:
        payloads: list[Payload] = [ctx.get(fam, ep, _matchup_params(season, season_type)).payload]
        failures: list[str] = []
        total = 1
    except ProviderError as exc:
        log.warning("league-wide matchups failed (%s); falling back to per defensive team", exc)
        team_ids = [int(t) for t in load_teams(ctx.layout)["team_id"]]
        got, failures = _collect(
            ctx,
            fam,
            ep,
            [
                (f"def team {t}", _matchup_params(season, season_type, def_team_id_nullable=t))
                for t in team_ids
            ],
        )
        payloads, total = [p for _, p in got], len(team_ids)
        if not payloads:
            raise
    df = matchups.normalize_matchups(payloads, season=season, season_type=season_type)
    return _output({fam: df}, failures, total)


def shot_params(
    season: str, season_type: str, *, player_id: int = 0, team_id: int = 0
) -> dict[str, Any]:
    return {
        "player_id": player_id,
        "team_id": team_id,
        "context_measure_simple": "FGA",
        "season_nullable": season,
        "season_type_all_star": season_type,
    }


# stats.nba.com silently truncates shotchartdetail responses at this many rows; a full season has
# ~220,000 attempts, so the league-wide call is never complete. Shots are fetched per team instead.
PROVIDER_SHOT_ROW_CAP = 102_400


def shot_rows(payload: Payload) -> int:
    for rs in payload.get("resultSets") or []:
        if rs.get("name") == "Shot_Chart_Detail":
            return len(rs.get("rowSet") or [])
    return 0


def truncated_payloads(payloads: Iterable[Payload]) -> int:
    """How many responses hit the provider's row cap (and are therefore incomplete)."""
    return sum(1 for p in payloads if shot_rows(p) >= PROVIDER_SHOT_ROW_CAP)


def fetch_shots(ctx: StepContext, season: str, season_type: str) -> StepOutput:
    fam, ep = "shots", "shotchartdetail"
    team_table = load_teams(ctx.layout)
    team_ids = [int(t) for t in team_table["team_id"]]
    got, failures = _collect(
        ctx,
        fam,
        ep,
        [(f"team {t}", shot_params(season, season_type, team_id=t)) for t in team_ids],
    )
    payloads = [p for _, p in got]
    if not payloads:
        raise ProviderError(f"shots {season} {season_type}: every per-team request failed")
    capped = truncated_payloads(payloads)
    if capped:
        failures = [
            *failures,
            f"{capped} per-team shot responses hit the provider row cap ({PROVIDER_SHOT_ROW_CAP}); those teams are incomplete",
        ]
    frames = {
        "shots": shots.normalize_shots(
            payloads, season=season, season_type=season_type, teams=team_table
        ),
        "shot_league_zone_avg": shots.normalize_league_zone_avg(
            _first_with_league_averages(payloads), season=season, season_type=season_type
        ),
    }
    return _output(frames, failures, len(team_ids))


def _first_with_league_averages(payloads: list[Payload]) -> Payload:
    """Every shot chart response repeats the league zone averages; use the first non-empty one."""
    for p in payloads:
        for rs in p.get("resultSets") or []:
            if rs.get("name") == "LeagueAverages" and rs.get("rowSet"):
                return p
    return payloads[0]


FETCHERS: dict[str, Fetcher] = {
    "teams": fetch_teams,
    "players": fetch_players,
    "player_bios": fetch_player_bios,
    "team_season": fetch_team_season,
    "player_season": fetch_player_season,
    "combine_anthro": fetch_combine_anthro,
    "player_game_logs": fetch_player_game_logs,
    "team_game_logs": fetch_team_game_logs,
    "games": fetch_games,
    "events": fetch_events,
    "lineups": fetch_lineups,
    "on_off": fetch_on_off,
    "defense_dash": fetch_defense_dash,
    "matchups": fetch_matchups,
    "shots": fetch_shots,
}
