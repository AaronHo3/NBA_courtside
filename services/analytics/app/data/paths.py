"""On-disk layout: ``<root>/<namespace>/{parquet/<family>/..., raw/, manifest.json}``."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

Namespace = str  # "nba" (real provider data) or "demo" (synthetic)

REAL_NAMESPACE = "nba"
DEMO_NAMESPACE = "demo"


def season_type_slug(season_type: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", season_type.lower()).strip("_")


@dataclass(frozen=True)
class DataLayout:
    root: Path
    namespace: Namespace

    @property
    def namespace_dir(self) -> Path:
        return self.root / self.namespace

    @property
    def parquet_dir(self) -> Path:
        return self.namespace_dir / "parquet"

    @property
    def raw_dir(self) -> Path:
        return self.namespace_dir / "raw"

    @property
    def manifest_path(self) -> Path:
        return self.namespace_dir / "manifest.json"

    @property
    def media_dir(self) -> Path:
        """Managed media (originals, derivatives, upload spool) for this namespace."""
        return self.namespace_dir / "media"

    @property
    def state_db_path(self) -> Path:
        """Mutable scouting state (SQLite) for this namespace."""
        return self.namespace_dir / "scouting.sqlite"

    def family_dir(self, family: str) -> Path:
        return self.parquet_dir / family

    def family_glob(self, family: str) -> str:
        return str(self.family_dir(family) / "*.parquet")

    def family_file(
        self,
        family: str,
        season: str | None = None,
        season_type: str | None = None,
        suffix: str | None = None,
    ) -> Path:
        parts = [family]
        if season:
            parts.append(season)
        if season_type:
            parts.append(season_type_slug(season_type))
        if suffix:
            parts.append(suffix)
        return self.family_dir(family) / ("__".join(parts) + ".parquet")
