"""HTTP Range support for managed derivatives (VIDEO_PIPELINE §3): 200 / 206 / 416, HEAD, chunked reads."""

from __future__ import annotations

import re
from collections.abc import Iterator
from pathlib import Path

from fastapi.responses import Response, StreamingResponse

CHUNK = 512 * 1024
_RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")


class RangeError(ValueError):
    pass


def parse_range(header: str | None, size: int) -> tuple[int, int] | None:
    """One byte range -> (start, end) inclusive; None for no header; RangeError when unsatisfiable."""
    if header is None:
        return None
    m = _RANGE.match(header.strip())
    if not m or size <= 0:
        raise RangeError(f"unsupported Range header {header!r}")
    start_s, end_s = m.groups()
    if start_s == "" and end_s == "":
        raise RangeError("empty range")
    if start_s == "":
        suffix = int(end_s)
        if suffix <= 0:
            raise RangeError("empty suffix range")
        return max(0, size - suffix), size - 1
    start = int(start_s)
    end = int(end_s) if end_s else size - 1
    if start >= size or end < start:
        raise RangeError(f"range {header!r} is outside 0-{size - 1}")
    return start, min(end, size - 1)


def _iter_file(path: Path, start: int, end: int) -> Iterator[bytes]:
    remaining = end - start + 1
    with path.open("rb") as fh:
        fh.seek(start)
        while remaining > 0:
            chunk = fh.read(min(CHUNK, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def range_response(
    path: Path, range_header: str | None, media_type: str, *, head: bool = False
) -> Response:
    size = path.stat().st_size
    base_headers = {"Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600"}
    try:
        rng = parse_range(range_header, size)
    except RangeError:
        return Response(
            status_code=416, headers={**base_headers, "Content-Range": f"bytes */{size}"}
        )
    if rng is None:
        headers = {**base_headers, "Content-Length": str(size)}
        if head:
            return Response(status_code=200, headers=headers, media_type=media_type)
        return StreamingResponse(
            _iter_file(path, 0, size - 1), status_code=200, headers=headers, media_type=media_type
        )
    start, end = rng
    headers = {
        **base_headers,
        "Content-Length": str(end - start + 1),
        "Content-Range": f"bytes {start}-{end}/{size}",
    }
    if head:
        return Response(status_code=206, headers=headers, media_type=media_type)
    return StreamingResponse(
        _iter_file(path, start, end), status_code=206, headers=headers, media_type=media_type
    )
