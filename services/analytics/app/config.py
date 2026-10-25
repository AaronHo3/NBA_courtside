"""Application settings (environment-driven; see .env.example)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# services/analytics/app/config.py -> SERVICE_ROOT = services/analytics, REPO_ROOT = the courtside repo.
SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parents[1]
DEFAULT_DATA_DIR = REPO_ROOT / "data" / "analytics"

NamespaceSetting = Literal["auto", "nba", "demo"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(SERVICE_ROOT / ".env",),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    nba_data_dir: Path = Field(default=DEFAULT_DATA_DIR)
    nba_namespace: NamespaceSetting = "auto"
    nba_request_delay_seconds: float = 1.5
    nba_request_timeout_seconds: float = 30.0
    nba_max_retries: int = 4
    nba_proxy: str | None = None
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    log_level: str = "INFO"
    # Public deployments: hide ingestion routes and refuse on-demand provider fetches. Ingestion
    # runs on a trusted machine and the data directory is synced to the host.
    public_read_only: bool = False
    # Comma-separated browser origins allowed to call the API cross-origin (same-origin via the
    # nginx proxy needs none of these).
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    # Evidence: configured video source adapters and how long a verified external reference stays fresh.
    video_sources: str = "nba_stats_events"
    media_reference_stale_after_days: int = 30
    # Managed media bounds (Phase B): uploads, processing and retention.
    media_max_upload_bytes: int = 4 * 1024**3
    media_max_duration_ms: int = 4 * 60 * 60 * 1000
    media_max_pixels: int = 3840 * 2160
    media_purge_after_days: int = 7
    # Durable jobs: run inline in the API process (tests, single-command dev) or via `make worker`.
    jobs_inline: bool = False
    jobs_lease_seconds: float = 60.0
    jobs_poll_seconds: float = 2.0
    jobs_worker_stale_seconds: float = 60.0
    # Hard caps on result sizes returned by the API.
    max_rows: int = 5000
    max_shot_rows: int = 20000

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def data_dir(self) -> Path:
        d = self.nba_data_dir
        return d if d.is_absolute() else (REPO_ROOT / d).resolve()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
