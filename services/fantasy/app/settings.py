"""Runtime settings. Secrets (optional ESPN cookies) come only from the environment / backend/.env."""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# services/fantasy/app/settings.py -> BACKEND_DIR = services/fantasy, REPO_DIR = the courtside repo.
# Fantasy data, docs and exports live in per-service subfolders of the shared repo.
BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parents[1]
DATA_DIR = REPO_DIR / "data" / "fantasy"
DOCS_DIR = REPO_DIR / "docs" / "fantasy"
EXPORTS_DIR = REPO_DIR / "exports" / "fantasy"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_prefix="COPILOT_", extra="ignore")

    data_dir: Path = Field(default=DATA_DIR)
    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: list[str] = Field(default_factory=lambda: ["http://127.0.0.1:5173", "http://localhost:5173"])
    espn_swid: str | None = None  # optional, read-only private league import; never logged
    espn_s2: str | None = None
    refine_workers: int = 2
    default_seed: int = 20262027

    @property
    def sessions_db(self) -> Path:
        return self.data_dir / "sessions" / "sessions.sqlite"

    @property
    def demo_dir(self) -> Path:
        return self.data_dir / "demo" / "snapshot"

    @property
    def snapshots_dir(self) -> Path:
        return self.data_dir / "nba" / "snapshots"

    @property
    def live_dir(self) -> Path:
        """Per-league live status written by ESPN sync (gitignored under data/nba)."""
        return self.data_dir / "nba" / "live"

    @property
    def schedule_path(self) -> Path:
        return self.data_dir / "nba" / "normalized" / "schedule.parquet"


settings = Settings()
