"""Deterministic report drafts (plan C-05): one section per evidence class, validated claims, Markdown.

A draft is a pure function of the data: the same shortlist and data produce byte-identical sections
and Markdown (timestamps live only in the row metadata). Claims added later are validated against
the report's own numbers and evidence; rendering groups claims by their *validated* type, so a label
is never upgraded.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Any

from app.data.db import Database
from app.data.paths import DataLayout
from app.data.repositories import players as players_repo
from app.evidence.registry import now_iso
from app.scouting.candidates import DISCLAIMER
from app.scouting.claims import Claim, ValidatedClaim, decimals_for_trait, validate_claims
from app.scouting.compute import Cohort, compute_traits
from app.scouting.fingerprint import data_fingerprint
from app.scouting.observations import reviewed_observation_traits
from app.scouting.profiles import PROFILE_FAMILIES
from app.scouting.shortlists import get_shortlist
from app.state.connection import StateDB
from app.state.ids import new_ulid

SECTION_ORDER = (
    "statistical",
    "reviewed_observation",
    "model_estimate",
    "interpretation",
    "limitations",
)
SECTION_TITLES = {
    "statistical": "Statistical measurements",
    "reviewed_observation": "Reviewed observations",
    "model_estimate": "Model estimates",
    "interpretation": "Interpretation",
    "limitations": "Limitations",
}
TRAIT_FIELDS = (
    "key",
    "label",
    "definition",
    "units",
    "higher_is_better",
    "value",
    "percentile",
    "interval",
    "sample",
    "coverage",
)


def _compact(rec: dict) -> dict:
    out = {k: rec.get(k) for k in TRAIT_FIELDS}
    out["qualified"] = bool(rec["qualification"]["met"])
    out["unsupported_reason"] = rec.get("unsupported_reason")
    return out


def _name(db: Database, pid: int) -> str:
    bio = players_repo.bio(db, pid)
    return (bio or {}).get("full_name") or f"player {pid}"


def _statistical_section(
    db: Database, players: Sequence[int], season: str, season_type: str, cohort: Cohort
) -> dict:
    rows = []
    for pid in players:
        recs = compute_traits(db, [pid], season, season_type, cohort=cohort)
        rows.append(
            {"player_id": pid, "full_name": _name(db, pid), "traits": [_compact(r) for r in recs]}
        )
    return {
        "key": "statistical",
        "title": SECTION_TITLES["statistical"],
        "players": rows,
        "method": "Season aggregates from the provider's tables through the trait registry; percentiles within the cohort; pooled across stints.",
    }


def _reviewed_section(db: Database, players: Sequence[int], season: str, season_type: str) -> dict:
    rows = []
    reasons = set()
    for pid in players:
        recs = reviewed_observation_traits(db, pid, season, season_type)
        reasons.update(r["unsupported_reason"] for r in recs if r.get("unsupported_reason"))
        rows.append(
            {
                "player_id": pid,
                "full_name": _name(db, pid),
                "traits": [
                    _compact(r)
                    | {
                        "examples": r.get("examples"),
                        "counterexamples": r.get("counterexamples"),
                        "sampling_methods": r.get("sampling_methods"),
                    }
                    for r in recs
                ],
            }
        )
    return {
        "key": "reviewed_observation",
        "title": SECTION_TITLES["reviewed_observation"],
        "players": rows,
        "unsupported": "; ".join(sorted(reasons))
        if reasons and all(all(t["unsupported_reason"] for t in p["traits"]) for p in rows)
        else None,
        "method": "Human labels on verified subjects that passed review; rates from complete or sampled event sets with coverage; curated clips are examples only.",
    }


def _limitations(fingerprint: str, cohort: Cohort) -> list[str]:
    return [
        "Scores and rankings describe match to selected criteria within one season; they are not forecasts of team improvement.",
        "Statistical traits describe production in a context (team, role, opponents) the data does not control for.",
        "Reviewed observations cover reviewed games only; coverage is part of every claim. None exist until annotations are exported.",
        "No model estimates are reported until a vision feature passes its validation gate.",
        "Nothing here addresses contracts, availability, roster fit or health.",
        f"Cohort: min_gp {cohort.min_gp}, min_minutes {cohort.min_minutes:g}, position {cohort.position or 'any'}. Data fingerprint {fingerprint}.",
    ]


def _numbers_index(sections: list[dict], season: str, season_type: str) -> dict[str, float]:
    out: dict[str, float] = {}
    for section in sections:
        if section["key"] != "statistical":
            continue
        for p in section["players"]:
            for t in p["traits"]:
                if t["value"] is not None:
                    out[f"{t['key']}|{p['player_id']}|{season}|{season_type}"] = float(t["value"])
    return out


def _numbers_from_json(raw: str) -> dict[tuple, float]:
    out = {}
    for k, v in json.loads(raw).items():
        trait, pid, season, stype = k.split("|")
        out[(trait, int(pid), season, stype)] = v
    return out


def render_markdown(report: dict[str, Any]) -> str:
    lines = [f"# {report['title']}", ""]
    season = report["season"]
    lines.append(
        f"Season {season} ({report['season_type']}). Mode: {report['llm_mode']} (deterministic draft). Status: {report['status']}."
    )
    if report.get("shortlist"):
        lines.append(
            f"Shortlist: {report['shortlist']['label']} ({report['shortlist']['shortlist_id']})."
        )
    lines.append("")
    claims_by_type: dict[str, list[dict]] = {}
    for c in report.get("claims", []):
        if c["validation_status"] == "dropped":
            continue
        claims_by_type.setdefault(c["claim_type"], []).append(c)
    for section in report["sections"]:
        key = section["key"]
        lines.append(f"## {section['title']}")
        lines.append("")
        if key == "statistical":
            for p in section["players"]:
                lines.append(f"### {p['full_name']} ({p['player_id']})")
                lines.append("")
                lines.append("| Trait | Value | Percentile | Sample |")
                lines.append("| --- | --- | --- | --- |")
                for t in p["traits"]:
                    if t["value"] is None:
                        continue
                    pct = "–" if t["percentile"] is None else f"{t['percentile']:.0f}"
                    n = t["sample"]["n"] if t.get("sample") else None
                    value = f"{t['value']:.{decimals_for_trait(t['key'])}f}"
                    lines.append(f"| {t['label']} | {value} | {pct} | {'' if n is None else n} |")
                lines.append("")
        elif key == "reviewed_observation":
            if section.get("unsupported"):
                lines.append(f"No reviewed observations are available: {section['unsupported']}.")
            else:
                for p in section["players"]:
                    for t in p["traits"]:
                        if t["value"] is not None:
                            cov = t.get("coverage") or {}
                            lines.append(
                                f"- {p['full_name']}: {t['label']} {t['value']:.3f} over {t['sample']['n']} opportunities, coverage {cov.get('games_covered')} of {cov.get('games_played')} games."
                            )
            lines.append("")
        elif key == "model_estimate":
            lines.append(section.get("note", ""))
            lines.append("")
        elif key == "interpretation":
            if section.get("text"):
                lines.append(section["text"])
                lines.append("")
        elif key == "limitations":
            for item in section["items"]:
                lines.append(f"- {item}")
            lines.append("")
        for c in claims_by_type.get(key, []):
            cites = f" [evidence: {', '.join(c['evidence_ids'])}]" if c["evidence_ids"] else ""
            flag = " (downgraded)" if c["validation_status"] == "downgraded" else ""
            lines.append(f"- {c['claim_text']}{cites}{flag}")
        if claims_by_type.get(key):
            lines.append("")
    dropped = sum(1 for c in report.get("claims", []) if c["validation_status"] == "dropped")
    if dropped:
        lines.append(
            f"_{dropped} claim(s) were dropped during validation (missing or deleted evidence, or numbers that did not match)._"
        )
        lines.append("")
    lines.extend(["---", DISCLAIMER])
    return "\n".join(lines).rstrip() + "\n"


def _claim_row(r: dict) -> dict[str, Any]:
    return {
        "claim_id": r["claim_id"],
        "order_index": r["order_index"],
        "claim_text": r["claim_text"],
        "claim_type": r["claim_type"],
        "original_type": r["original_type"],
        "player_ids": json.loads(r["player_ids_json"]),
        "time_scope": json.loads(r["time_scope_json"]),
        "evidence_ids": json.loads(r["evidence_ids_json"]),
        "numeric_refs": json.loads(r["numeric_refs_json"]),
        "limitations": json.loads(r["limitations_json"]),
        "counterevidence_ids": json.loads(r["counterevidence_ids_json"]),
        "validation_status": r["validation_status"],
        "notes": json.loads(r["validation_notes_json"]),
        "created_at": r["created_at"],
    }


def get_report(state_db: StateDB, report_id: str) -> dict[str, Any] | None:
    rows = state_db.query(
        "SELECT * FROM reports WHERE report_id = ? AND namespace = ?",
        [report_id, state_db.namespace],
    )
    if not rows:
        return None
    r = rows[0]
    claims = state_db.query(
        "SELECT * FROM report_claims WHERE report_id = ? ORDER BY order_index", [report_id]
    )
    shortlist = get_shortlist(state_db, r["shortlist_id"]) if r["shortlist_id"] else None
    return {
        "report_id": r["report_id"],
        "title": r["title"],
        "status": r["status"],
        "season": r["season"],
        "season_type": r["season_type"],
        "shortlist": shortlist,
        "sections": json.loads(r["sections_json"]),
        "claims": [_claim_row(c) for c in claims],
        "data_fingerprint": r["data_fingerprint"],
        "llm_mode": r["llm_mode"],
        "model_id": r["model_id"],
        "generated_by": r["generated_by"],
        "rendered_markdown": r["rendered_markdown"],
        "created_at": r["created_at"],
        "updated_at": r["updated_at"],
    }


def list_reports(state_db: StateDB) -> list[dict[str, Any]]:
    rows = state_db.query(
        """SELECT report_id, title, status, season, season_type, shortlist_id, llm_mode, data_fingerprint, created_at, updated_at,
                  (SELECT COUNT(*) FROM report_claims c WHERE c.report_id = r.report_id) AS claim_count
           FROM reports r WHERE namespace = ? ORDER BY created_at, report_id""",
        [state_db.namespace],
    )
    return [dict(r) for r in rows]


def _rerender(state_db: StateDB, report_id: str) -> dict[str, Any]:
    report = get_report(state_db, report_id)
    md = render_markdown(report)
    with state_db.transaction():
        state_db.execute(
            "UPDATE reports SET rendered_markdown = ?, updated_at = ? WHERE report_id = ?",
            [md, now_iso(), report_id],
        )
    report["rendered_markdown"] = md
    return report


def build_report_draft(
    db: Database,
    state_db: StateDB,
    layout: DataLayout | None,
    *,
    shortlist_id: str | None = None,
    player_ids: Sequence[int] | None = None,
    season: str | None = None,
    season_type: str = "Regular Season",
    title: str,
    cohort: Cohort | None = None,
) -> dict[str, Any]:
    shortlist = None
    if shortlist_id:
        shortlist = get_shortlist(state_db, shortlist_id)
        if shortlist is None:
            raise KeyError(shortlist_id)
        players = [e["player_id"] for e in shortlist["entries"]]
        season, season_type = shortlist["season"], shortlist["season_type"]
        if cohort is None and shortlist.get("cohort"):
            cohort = Cohort(
                **{
                    k: v
                    for k, v in shortlist["cohort"].items()
                    if k in ("population", "min_gp", "min_minutes", "position")
                }
            )
    else:
        if not player_ids or not season:
            raise ValueError("a shortlist_id, or player_ids with a season, is required")
        players = [int(p) for p in player_ids]
    cohort = cohort or Cohort()
    fingerprint = data_fingerprint(layout, season, season_type, PROFILE_FAMILIES)
    sections = [
        _statistical_section(db, players, season, season_type, cohort),
        _reviewed_section(db, players, season, season_type),
        {
            "key": "model_estimate",
            "title": SECTION_TITLES["model_estimate"],
            "players": [],
            "note": "No validated vision features exist; experimental features are not reported.",
        },
        {"key": "interpretation", "title": SECTION_TITLES["interpretation"], "text": ""},
        {
            "key": "limitations",
            "title": SECTION_TITLES["limitations"],
            "items": _limitations(fingerprint, cohort),
        },
    ]
    report_id = new_ulid()
    stamp = now_iso()
    report = {
        "report_id": report_id,
        "title": title,
        "status": "draft",
        "season": season,
        "season_type": season_type,
        "shortlist": shortlist,
        "sections": sections,
        "claims": [],
        "data_fingerprint": fingerprint,
        "llm_mode": "none",
        "model_id": None,
        "generated_by": "deterministic",
        "created_at": stamp,
        "updated_at": stamp,
    }
    report["rendered_markdown"] = render_markdown(report)
    with state_db.transaction():
        state_db.execute(
            """INSERT INTO reports (report_id, namespace, shortlist_id, title, status, season, season_type, sections_json, numbers_json,
                   data_fingerprint, llm_mode, model_id, generated_by, rendered_markdown, created_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, 'none', NULL, 'deterministic', ?, 'user', ?, ?)""",
            [
                report_id,
                state_db.namespace,
                shortlist_id,
                title,
                season,
                season_type,
                json.dumps(sections, default=str),
                json.dumps(_numbers_index(sections, season, season_type)),
                fingerprint,
                report["rendered_markdown"],
                stamp,
                stamp,
            ],
        )
    return report


def add_claims(state_db: StateDB, report_id: str, claims: Sequence[Claim]) -> dict[str, Any]:
    rows = state_db.query(
        "SELECT numbers_json FROM reports WHERE report_id = ? AND namespace = ?",
        [report_id, state_db.namespace],
    )
    if not rows:
        raise KeyError(report_id)
    numbers = _numbers_from_json(rows[0]["numbers_json"])
    validated: list[ValidatedClaim] = validate_claims(state_db, claims, numbers)
    start = (
        int(
            state_db.scalar(
                "SELECT COALESCE(MAX(order_index), -1) FROM report_claims WHERE report_id = ?",
                [report_id],
            )
            or -1
        )
        + 1
    )
    stamp = now_iso()
    with state_db.transaction():
        for i, c in enumerate(validated):
            state_db.execute(
                """INSERT INTO report_claims (claim_id, report_id, namespace, order_index, claim_text, claim_type, original_type, player_ids_json,
                       time_scope_json, evidence_ids_json, numeric_refs_json, limitations_json, counterevidence_ids_json, validation_status,
                       validation_notes_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                [
                    new_ulid(),
                    report_id,
                    state_db.namespace,
                    start + i,
                    c.text,
                    c.claim_type,
                    c.original_type,
                    json.dumps(c.player_ids),
                    json.dumps(c.time_scope),
                    json.dumps(c.evidence_ids),
                    json.dumps([r.model_dump() for r in c.numeric_refs]),
                    json.dumps(c.limitations),
                    json.dumps(c.counterevidence_ids),
                    c.validation_status,
                    json.dumps(c.notes),
                    stamp,
                ],
            )
    return _rerender(state_db, report_id)


def update_report(
    state_db: StateDB,
    report_id: str,
    *,
    title: str | None = None,
    status: str | None = None,
    interpretation: str | None = None,
) -> dict[str, Any]:
    report = get_report(state_db, report_id)
    if report is None:
        raise KeyError(report_id)
    sections = report["sections"]
    if interpretation is not None:
        for s in sections:
            if s["key"] == "interpretation":
                s["text"] = interpretation
    sets, params = (
        ["updated_at = ?", "sections_json = ?"],
        [now_iso(), json.dumps(sections, default=str)],
    )
    if title is not None:
        sets.append("title = ?")
        params.append(title)
    if status is not None:
        sets.append("status = ?")
        params.append(status)
    with state_db.transaction():
        state_db.execute(
            f"UPDATE reports SET {', '.join(sets)} WHERE report_id = ? AND namespace = ?",
            [*params, report_id, state_db.namespace],
        )
    return _rerender(state_db, report_id)
