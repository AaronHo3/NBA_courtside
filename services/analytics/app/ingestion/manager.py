"""Background ingestion runner owned by the API process (one run at a time)."""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from typing import Any

from app.config import Settings
from app.data.paths import REAL_NAMESPACE, DataLayout
from app.ingestion import pipeline
from app.ingestion.pipeline import IngestionPlan, RunReport, StepResult
from app.ingestion.providers.base import StatsProvider

log = logging.getLogger("nba.ingestion.manager")

OnComplete = Callable[[RunReport | None], None]


class IngestionBusyError(RuntimeError):
    pass


class IngestionManager:
    def __init__(
        self,
        settings: Settings,
        *,
        provider: StatsProvider | None = None,
        on_complete: OnComplete | None = None,
    ) -> None:
        self.settings = settings
        self.layout = DataLayout(settings.data_dir, REAL_NAMESPACE)
        self._provider = provider
        self._on_complete = on_complete
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self.running: bool = False
        self.last_run: dict[str, Any] | None = None
        self.provider_reachable: bool | None = None
        self.progress: list[dict[str, Any]] = []

    @property
    def provider(self) -> StatsProvider:
        if self._provider is None:
            from app.ingestion.providers.nba_api_provider import NbaApiProvider

            self._provider = NbaApiProvider(self.settings)
        return self._provider

    def set_on_complete(self, callback: OnComplete | None) -> None:
        self._on_complete = callback

    def probe(self, timeout: float = 10.0) -> bool:
        self.provider_reachable = bool(self.provider.probe(timeout))
        return self.provider_reachable

    def start(
        self,
        seasons: Sequence[str],
        season_types: Sequence[str] = ("Regular Season",),
        families: Sequence[str] = ("all",),
        refresh: bool = False,
        players_limit: int | None = None,
        game_ids: Sequence[str] | None = None,
        games_limit: int | None = None,
    ) -> dict[str, Any]:
        plan = IngestionPlan(tuple(seasons), tuple(season_types), tuple(families))
        summary = plan.summary()  # validates families before we claim the run slot
        with self._lock:
            if self.running:
                raise IngestionBusyError("an ingestion run is already in progress")
            self.running = True
            self.progress = []
            self.last_run = {
                "started_at": datetime.now(UTC).isoformat(),
                "finished_at": None,
                "plan": summary,
                "ok": 0,
                "failed": 0,
                "error": None,
                "refresh": refresh,
            }
        self._thread = threading.Thread(
            target=self._run,
            args=(plan, refresh, players_limit, tuple(game_ids) if game_ids else None, games_limit),
            name="nba-ingestion",
            daemon=True,
        )
        self._thread.start()
        return summary

    def _on_step(self, result: StepResult) -> None:
        self.progress = [*self.progress, result.as_dict()]

    def _run(
        self,
        plan: IngestionPlan,
        refresh: bool,
        players_limit: int | None,
        game_ids: tuple[str, ...] | None = None,
        games_limit: int | None = None,
    ) -> None:
        report: RunReport | None = None
        error: str | None = None
        try:
            report = pipeline.run(
                self.layout,
                self.provider,
                plan,
                refresh=refresh,
                progress=self._on_step,
                players_limit=players_limit,
                game_ids=game_ids,
                games_limit=games_limit,
            )
        except Exception as exc:  # noqa: BLE001 - surfaced through last_run
            log.exception("ingestion run crashed")
            error = f"{type(exc).__name__}: {exc}"
        finally:
            self._finish(report, error)

    def _finish(self, report: RunReport | None, error: str | None) -> None:
        base = dict(self.last_run or {})
        if report is not None:
            base.update(report.summary())
        base.update({"finished_at": datetime.now(UTC).isoformat(), "error": error})
        with self._lock:
            self.last_run = base
            self.running = False
        if self._on_complete is not None:
            try:
                self._on_complete(report)
            except Exception:  # noqa: BLE001
                log.exception("on_complete callback failed")

    def wait(self, timeout: float | None = None) -> bool:
        if self._thread is None:
            return True
        self._thread.join(timeout)
        return not self._thread.is_alive()

    def fetch_player_shots(self, player_id: int, season: str, season_type: str) -> dict[str, Any]:
        with self._lock:
            if self.running:
                raise IngestionBusyError("an ingestion run is in progress; retry when it finishes")
        result = pipeline.fetch_player_shots(
            self.layout, self.provider, player_id, season, season_type
        )
        if self._on_complete is not None:
            self._on_complete(None)
        return result
