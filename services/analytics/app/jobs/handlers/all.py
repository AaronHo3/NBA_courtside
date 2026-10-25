"""Import every built-in handler so the registry is populated (imported by the worker and the API)."""

from app.jobs.handlers import (  # noqa: F401
    detect_shot_boundaries,
    export_snapshot,
    make_playback,
    make_thumbnails,
    probe_media,
    purge_media,
)
