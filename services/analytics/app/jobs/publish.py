"""Atomic publication of job outputs: files move into place, then the rows commit in one transaction.

If the row transaction fails, the moved files are moved back so nothing half-published remains.
"""

from __future__ import annotations

import os
from collections.abc import Callable, Sequence
from pathlib import Path

from app.state.connection import StateDB


def atomic_publish(
    db: StateDB, *, moves: Sequence[tuple[Path, Path]], rows: Callable[[], None]
) -> None:
    done: list[tuple[Path, Path]] = []
    try:
        for src, dst in moves:
            dst.parent.mkdir(parents=True, exist_ok=True)
            os.replace(src, dst)
            done.append((src, dst))
        with db.transaction():
            rows()
    except BaseException:
        for src, dst in reversed(done):
            try:
                os.replace(dst, src)
            except OSError:
                pass
        raise
