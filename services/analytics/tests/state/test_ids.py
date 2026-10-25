"""ULIDs: 26 Crockford base32 characters, time-ordered, unique."""

import time

from app.state.ids import CROCKFORD_ALPHABET, new_ulid


def test_shape_and_alphabet():
    u = new_ulid()
    assert len(u) == 26
    assert set(u) <= set(CROCKFORD_ALPHABET)


def test_later_ids_sort_after_earlier_ones():
    a = new_ulid()
    time.sleep(0.002)
    b = new_ulid()
    assert a < b


def test_ids_are_unique_within_the_same_millisecond():
    ids = {new_ulid() for _ in range(2000)}
    assert len(ids) == 2000
