"""Structured claims and their validation (COPILOT §4, DEC-13).

A claim is text plus its support: evidence ids, numeric references, scope. Validation never
upgrades a claim: unsupported statistical or observational claims become interpretations, claims
whose only support is missing are dropped, and every change is recorded in ``notes``.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Literal

from pydantic import BaseModel, Field

from app.evidence.evidence_items import get_evidence
from app.scouting.traits import TRAIT_INDEX
from app.state.connection import StateDB

ClaimType = Literal[
    "statistical", "reviewed_observation", "model_estimate", "interpretation", "limitation"
]
ValidationStatus = Literal["valid", "downgraded", "dropped"]
NumbersIndex = Mapping[tuple[str, int, str | None, str | None], float | None]
REVIEWED = ("reviewed_ok", "reviewed_corrected")
UNSUPPORTED_PATTERNS = (
    r"\bafford",
    r"\bsalary\b",
    r"\bcap\b",
    r"\bapron\b",
    r"\bcontract",
    r"\bextension\b",
    r"\btrade",
    r"\bavailab",
    r"\bfree agen",
    r"\bwins? (?:would|will|added|shares)",
    r"\bprojected wins\b",
    r"\bbuyout\b",
    r"\bluxury tax\b",
)


class NumericRef(BaseModel):
    trait_key: str
    player_id: int
    value: float
    units: str | None = None
    tool_call_id: str | None = None


class Claim(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    claim_type: ClaimType
    player_ids: list[int] = Field(default_factory=list)
    time_scope: dict = Field(default_factory=dict)
    evidence_ids: list[str] = Field(default_factory=list)
    numeric_refs: list[NumericRef] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    counterevidence_ids: list[str] = Field(default_factory=list)


class ValidatedClaim(Claim):
    original_type: ClaimType
    validation_status: ValidationStatus
    notes: list[str] = Field(default_factory=list)


def decimals_for_trait(key: str) -> int:
    units = TRAIT_INDEX[key].units if key in TRAIT_INDEX else ""
    if units.startswith("fraction"):
        return 3
    if units == "ratio":
        return 2
    if units == "count":
        return 0
    return 1


def is_unsupported_request(text: str) -> bool:
    """Contracts, availability, trades, affordability, projected wins: no dataset or model supports these."""
    lowered = text.lower()
    return any(re.search(p, lowered) for p in UNSUPPORTED_PATTERNS)


def _check_evidence(
    state_db: StateDB | None, ids: Sequence[str], notes: list[str]
) -> tuple[list[str], dict[str, dict]]:
    kept: list[str] = []
    rows: dict[str, dict] = {}
    for eid in ids:
        row = get_evidence(state_db, eid) if state_db is not None else None
        if row is None:
            notes.append(f"evidence {eid} not found in this namespace; citation dropped")
            continue
        if row["status"] in ("deleted", "superseded"):
            notes.append(f"evidence {eid} is {row['status']}; citation dropped")
            continue
        if row["status"] == "stale":
            notes.append(f"evidence {eid} is stale (its source has not been re-verified)")
        kept.append(eid)
        rows[eid] = row
    return kept, rows


def _check_numbers(
    claim: Claim, numbers: NumbersIndex, notes: list[str]
) -> tuple[list[NumericRef], bool]:
    season = claim.time_scope.get("season")
    season_type = claim.time_scope.get("season_type", "Regular Season")
    kept: list[NumericRef] = []
    all_ok = True
    for ref in claim.numeric_refs:
        expected = numbers.get((ref.trait_key, ref.player_id, season, season_type))
        if expected is None:
            notes.append(
                f"{ref.trait_key} for player {ref.player_id} is not among the tool results for {season}"
            )
            all_ok = False
            continue
        tolerance = 0.5 * 10 ** (-decimals_for_trait(ref.trait_key)) + 1e-12
        if abs(float(expected) - ref.value) > tolerance:
            notes.append(f"{ref.trait_key} {ref.value} does not match the computed {expected:.4f}")
            all_ok = False
            continue
        kept.append(ref)
    return kept, all_ok


def _validate_one(state_db: StateDB | None, claim: Claim, numbers: NumbersIndex) -> ValidatedClaim:
    notes: list[str] = []
    if claim.claim_type == "limitation":
        return ValidatedClaim(
            **claim.model_dump(),
            original_type=claim.claim_type,
            validation_status="valid",
            notes=notes,
        )
    evidence, rows = _check_evidence(state_db, claim.evidence_ids, notes)
    counter, _ = _check_evidence(state_db, claim.counterevidence_ids, notes)
    refs, numbers_ok = _check_numbers(claim, numbers, notes)
    ctype: ClaimType = claim.claim_type
    status: ValidationStatus = "valid"
    cited_something = bool(claim.evidence_ids or claim.numeric_refs)
    has_support = bool(evidence or refs)

    if ctype == "statistical":
        if not refs:
            if cited_something and not has_support:
                status = "dropped"
            else:
                ctype, status = "interpretation", "downgraded"
                notes.append("no verified numbers; kept as interpretation")
        elif not numbers_ok:
            ctype, status = "interpretation", "downgraded"
            notes.append("some numbers did not match; kept as interpretation")
    elif ctype == "reviewed_observation":
        reviewed = [
            e
            for e in evidence
            if rows[e]["evidence_class"] == "reviewed_observation"
            and rows[e]["review_status"] in REVIEWED
        ]
        if not reviewed:
            ctype, status = "interpretation", "downgraded"
            notes.append("no reviewed observation cited; kept as interpretation")
    elif ctype == "model_estimate":
        ctype, status = "interpretation", "downgraded"
        notes.append(
            "no validated model feature exists yet; experimental estimates are reported as interpretation"
        )
    elif ctype == "interpretation":
        if cited_something and not has_support:
            status = "dropped"
    return ValidatedClaim(
        **{
            **claim.model_dump(),
            "claim_type": ctype,
            "evidence_ids": evidence,
            "numeric_refs": refs,
            "counterevidence_ids": counter,
        },
        original_type=claim.claim_type,
        validation_status=status,
        notes=notes,
    )


def validate_claims(
    state_db: StateDB | None, claims: Sequence[Claim], numbers: NumbersIndex
) -> list[ValidatedClaim]:
    return [_validate_one(state_db, c, numbers) for c in claims]
