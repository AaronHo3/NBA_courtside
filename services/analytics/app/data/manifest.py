"""Dataset manifest: what exists, when it was fetched, from where, and whether it succeeded."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.data.paths import DataLayout

Status = Literal["ok", "missing", "stale", "failed", "partial"]


class ManifestEntry(BaseModel):
    family: str
    season: str | None = None
    season_type: str | None = None
    status: Status
    rows: int = 0
    fetched_at: datetime | None = None
    source: str
    path: str | None = None
    error: str | None = None
    note: str | None = None

    @property
    def key(self) -> tuple[str, str | None, str | None]:
        return (self.family, self.season, self.season_type)


class Manifest(BaseModel):
    namespace: str
    generated_at: datetime | None = None
    entries: list[ManifestEntry] = Field(default_factory=list)

    @classmethod
    def load(cls, layout: DataLayout) -> Manifest:
        if layout.manifest_path.exists():
            return cls.model_validate_json(layout.manifest_path.read_text())
        return cls(namespace=layout.namespace)

    def save(self, layout: DataLayout) -> None:
        layout.manifest_path.parent.mkdir(parents=True, exist_ok=True)
        updated = self.model_copy(update={"generated_at": datetime.now(UTC)})
        layout.manifest_path.write_text(json.dumps(updated.model_dump(mode="json"), indent=2))

    def upsert(self, entry: ManifestEntry) -> Manifest:
        others = [e for e in self.entries if e.key != entry.key]
        return self.model_copy(update={"entries": [*others, entry]})

    def find(
        self, family: str, season: str | None = None, season_type: str | None = None
    ) -> ManifestEntry | None:
        for e in self.entries:
            if e.key == (family, season, season_type):
                return e
        return None

    def has_usable_data(self) -> bool:
        return any(e.status in ("ok", "partial") and e.rows > 0 for e in self.entries)

    def seasons(self) -> list[str]:
        return sorted(
            {e.season for e in self.entries if e.season and e.status in ("ok", "partial")},
            reverse=True,
        )

    def coverage(self) -> dict[str, dict[str, dict[str, str]]]:
        """season -> season_type -> family -> status (seasonal entries only)."""
        out: dict[str, dict[str, dict[str, str]]] = {}
        for e in self.entries:
            if e.season is None:
                continue
            out.setdefault(e.season, {}).setdefault(e.season_type or "", {})[e.family] = e.status
        return out
