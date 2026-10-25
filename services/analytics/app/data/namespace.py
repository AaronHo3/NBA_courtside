"""Decide which namespace (real ``nba`` or synthetic ``demo``) the API serves."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.config import Settings
from app.data.manifest import Manifest
from app.data.paths import DEMO_NAMESPACE, REAL_NAMESPACE, DataLayout


@dataclass(frozen=True)
class NamespaceDecision:
    namespace: str
    reason: str

    @property
    def is_demo(self) -> bool:
        return self.namespace == DEMO_NAMESPACE


def resolve_namespace(settings: Settings, root: Path | None = None) -> NamespaceDecision:
    root = root or settings.data_dir
    if settings.nba_namespace in (REAL_NAMESPACE, DEMO_NAMESPACE):
        return NamespaceDecision(
            settings.nba_namespace, f"forced by NBA_NAMESPACE={settings.nba_namespace}"
        )
    real = Manifest.load(DataLayout(root, REAL_NAMESPACE))
    if real.has_usable_data():
        return NamespaceDecision(REAL_NAMESPACE, "real provider data present in manifest")
    demo = Manifest.load(DataLayout(root, DEMO_NAMESPACE))
    if demo.has_usable_data():
        return NamespaceDecision(
            DEMO_NAMESPACE,
            "no real provider data ingested yet; serving labelled synthetic demo data",
        )
    return NamespaceDecision(DEMO_NAMESPACE, "no data found; run `make demo-data` or `make ingest`")
