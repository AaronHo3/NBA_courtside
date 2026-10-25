"""ULIDs for mutable rows: 48-bit millisecond timestamp + 80 random bits, Crockford base32.

Time-ordered so evidence ids sort by creation; random tail keeps ids unique within a millisecond.
"""

from __future__ import annotations

import secrets
import time

CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_TIME_CHARS = 10
_RANDOM_CHARS = 16


def _encode(value: int, length: int) -> str:
    chars = []
    for _ in range(length):
        chars.append(CROCKFORD_ALPHABET[value & 0x1F])
        value >>= 5
    return "".join(reversed(chars))


def new_ulid(now_ms: int | None = None) -> str:
    stamp = int(time.time() * 1000) if now_ms is None else now_ms
    return _encode(stamp, _TIME_CHARS) + _encode(secrets.randbits(80), _RANDOM_CHARS)
