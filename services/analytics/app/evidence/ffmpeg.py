"""ffmpeg / ffprobe as bounded subprocesses: detection, probing, timeouts, cancellation.

Every call runs in its own process group so a timeout or cancellation kills the whole tree; callers
(jobs) pass a ``threading.Event`` for cancellation. Nothing here runs inside an HTTP request.
"""

from __future__ import annotations

import json
import os
import shutil
import signal
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path

POLL_SECONDS = 0.1


class MediaToolError(RuntimeError):
    pass


class MediaToolTimeoutError(MediaToolError):
    pass


class MediaToolCancelledError(MediaToolError):
    pass


@dataclass(frozen=True)
class ToolInfo:
    ffmpeg: str
    ffprobe: str
    version: str


def _version(binary: str) -> str | None:
    try:
        out = subprocess.run(
            [binary, "-version"], capture_output=True, text=True, timeout=5, check=False
        )
    except (OSError, subprocess.SubprocessError):
        return None
    first = out.stdout.splitlines()[0] if out.stdout else ""
    return first.split(" version ", 1)[1].split(" ")[0] if " version " in first else (first or None)


def ffmpeg_available() -> ToolInfo | None:
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        return None
    version = _version(ffmpeg)
    return ToolInfo(ffmpeg, ffprobe, version or "unknown") if version else None


def _run(
    cmd: list[str], *, timeout_s: float, cancel: threading.Event | None
) -> subprocess.CompletedProcess[str]:
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True
    )
    deadline = time.monotonic() + timeout_s
    try:
        while True:
            try:
                out, err = proc.communicate(timeout=POLL_SECONDS)
                return subprocess.CompletedProcess(cmd, proc.returncode, out, err)
            except subprocess.TimeoutExpired:
                if cancel is not None and cancel.is_set():
                    _kill(proc)
                    raise MediaToolCancelledError(f"{cmd[0]} cancelled") from None
                if time.monotonic() > deadline:
                    _kill(proc)
                    raise MediaToolTimeoutError(f"{cmd[0]} exceeded {timeout_s:g}s") from None
    finally:
        if proc.poll() is None:
            _kill(proc)


def _kill(proc: subprocess.Popen) -> None:
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    try:
        proc.communicate(timeout=5)
    except subprocess.TimeoutExpired:
        pass


def run_ffmpeg(args: list[str], *, timeout_s: float, cancel: threading.Event | None = None) -> str:
    info = ffmpeg_available()
    if info is None:
        raise MediaToolError("ffmpeg is not installed")
    result = _run(
        [info.ffmpeg, "-hide_banner", "-nostdin", "-y", *args], timeout_s=timeout_s, cancel=cancel
    )
    if result.returncode != 0:
        raise MediaToolError(f"ffmpeg failed ({result.returncode}): {result.stderr[-800:]}")
    return result.stderr


def run_ffprobe(path: Path, *, timeout_s: float = 60) -> dict:
    info = ffmpeg_available()
    if info is None:
        raise MediaToolError("ffprobe is not installed")
    result = _run(
        [
            info.ffprobe,
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(path),
        ],
        timeout_s=timeout_s,
        cancel=None,
    )
    if result.returncode != 0:
        raise MediaToolError(f"ffprobe failed ({result.returncode}): {result.stderr[-800:]}")
    try:
        doc = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise MediaToolError("ffprobe returned invalid JSON") from exc
    if not doc.get("streams"):
        raise MediaToolError("ffprobe found no streams (not a media file?)")
    return doc


def _ratio(text: str | None) -> tuple[int, int] | None:
    if not text or "/" not in text:
        return None
    num, den = text.split("/", 1)
    try:
        n, d = int(num), int(den)
    except ValueError:
        return None
    return (n, d) if d else None


def frame_rate(stream: dict) -> tuple[int, int] | None:
    return _ratio(stream.get("avg_frame_rate")) or _ratio(stream.get("r_frame_rate"))


def time_base(stream: dict) -> tuple[int, int] | None:
    return _ratio(stream.get("time_base"))


def duration_ms(probe: dict) -> int | None:
    fmt = probe.get("format") or {}
    raw = fmt.get("duration")
    if raw is None:
        for s in probe.get("streams", []):
            if s.get("duration"):
                raw = s["duration"]
                break
    try:
        return int(round(float(raw) * 1000)) if raw is not None else None
    except (TypeError, ValueError):
        return None
