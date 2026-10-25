"""Upload intake (VIDEO_PIPELINE §3): spool, hash, sniff, promote, register, permission, probe job."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, BinaryIO

from app.config import Settings
from app.data.paths import DataLayout
from app.evidence import ffmpeg as ff
from app.evidence.registry import add_permission, register_managed_asset
from app.evidence.storage import MediaStore
from app.jobs.inline import enqueue_and_maybe_run
from app.jobs.models import Job
from app.state.connection import StateDB
from app.state.ids import new_ulid

ACCEPTED_EXTENSIONS = ("mp4", "mov", "mkv", "webm", "m4v")
ALLOWED_OPERATIONS = (
    "view",
    "playback_derivative",
    "thumbnail",
    "cv_processing",
    "redistribute",
    "external_model",
)
PROBE_VERSION = 1
_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")


class UploadRejectedError(ValueError):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class UploadResult:
    asset: dict[str, Any]
    permission: dict[str, Any]
    job: Job | None
    created: bool


def sanitize_filename(name: str | None) -> str | None:
    if not name:
        return None
    base = Path(name).name
    cleaned = _UNSAFE.sub("_", base).strip("._")
    return cleaned[:120] or None


def extension_of(name: str | None) -> str:
    ext = Path(name or "").suffix.lower().lstrip(".")
    if ext not in ACCEPTED_EXTENSIONS:
        raise UploadRejectedError(
            415, f"unsupported container '.{ext}'; accepted: {', '.join(ACCEPTED_EXTENSIONS)}"
        )
    return ext


def parse_operations(raw: str | None) -> list[str]:
    ops = [o.strip() for o in (raw or "").split(",") if o.strip()]
    bad = [o for o in ops if o not in ALLOWED_OPERATIONS]
    if bad:
        raise UploadRejectedError(
            422, f"unknown operations {bad}; allowed: {', '.join(ALLOWED_OPERATIONS)}"
        )
    return ops


def store_upload(
    *,
    settings: Settings,
    layout: DataLayout,
    state_db: StateDB,
    stream: BinaryIO,
    filename: str | None,
    declared_size: int | None,
    permission_source: str,
    authorization_ref: str | None,
    allowed_operations: list[str],
    notes: str | None,
) -> UploadResult:
    limit = settings.media_max_upload_bytes
    if declared_size is not None and declared_size > limit:
        raise UploadRejectedError(
            413, f"upload of {declared_size} bytes exceeds the limit of {limit} bytes"
        )
    ext = extension_of(filename)
    store = MediaStore(layout)
    try:
        spooled = store.write_atomic(f"incoming/{new_ulid()}.{ext}", stream, max_bytes=limit)
    except ValueError as exc:
        raise UploadRejectedError(413, str(exc)) from exc
    container = None
    try:
        if ff.ffmpeg_available() is not None:
            try:
                probe = ff.run_ffprobe(spooled.path)
            except ff.MediaToolError as exc:
                raise UploadRejectedError(415, f"the file is not readable media: {exc}") from exc
            container = (probe.get("format") or {}).get("format_name")
        key = store.promote_original(spooled.path, spooled.sha256, ext)
    except BaseException:
        spooled.path.unlink(missing_ok=True)
        raise
    asset = register_managed_asset(
        state_db,
        sha256=spooled.sha256,
        storage_key=key,
        original_filename=sanitize_filename(filename),
        byte_size=spooled.byte_size,
        container=container,
    )
    permission = add_permission(
        state_db,
        asset_id=asset["asset_id"],
        source=permission_source,
        allowed_operations=allowed_operations,
        permission_status="known" if allowed_operations else "unknown",
        authorization_ref=authorization_ref,
        notes=notes,
    )
    job = enqueue_and_maybe_run(
        settings,
        layout,
        state_db,
        "probe_media",
        {"asset_id": asset["asset_id"]},
        idempotency_key=f"asset:{asset['asset_id']}:probe:v{PROBE_VERSION}",
    )
    return UploadResult(
        asset=asset, permission=permission, job=job, created=bool(asset.get("created"))
    )
