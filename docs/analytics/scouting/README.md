# Scouting copilot: planning entry point

Courtside Research (this repository) is a local-first NBA analytics workbench. This directory holds
the durable plan for extending it into a **basketball scouting copilot**: statistics -> candidate
shortlist -> relevant clips -> reviewed evidence -> cited scouting report, with assisted computer
vision added progressively and roster modelling documented for later.

Planning status: complete as of 2026-10-08. **No feature code exists yet**; every feature task in
[PROGRESS.md](PROGRESS.md) is `not started`.

## Product objective

A user can (1) describe a role or team need, (2) find and compare qualified candidates using the
existing statistics, (3) retrieve relevant video evidence, (4) review and correct player identities,
event alignment and behavioural annotations, (5) build scouting profiles that keep statistical
measurements, reviewed observations, model estimates and interpretations apart, (6) ask an AI
copilot for evidence-backed comparisons and reports, and later (7) add validated computer-vision
features and roster modelling.

The first version must be useful **without** automated full-game tracking, without any video on
disk (external references only), and without an LLM key.

## Scope boundaries (binding)

- Extend the existing app; reuse its analytics, repositories, envelope, URL state, namespace rules.
- Existing pages and APIs keep working with no video files, no ffmpeg, no CV runtime, no LLM key.
- Respect provider terms: no scraping, no downloading provider media, no DRM circumvention;
  endpoints are candidates until recorded (DEC-07).
- Real (`nba`) and synthetic (`demo`) namespaces never mix: games, media, annotations, identities,
  jobs, profiles, shortlists, sessions, citations, reports.
- Rankings are "match to criteria", not predictions. Numbers come from deterministic code; the
  model explains and cites.

## Document map (canonical homes; other docs link, never restate)

| Document | Canonical for |
| --- | --- |
| [CURRENT_STATE.md](CURRENT_STATE.md) | Verified repository facts, reusable entry points, gaps, discrepancies with the brief's overview |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Components, data flow, process topology, durable worker, CV isolation, integration points |
| [DATA_MODEL.md](DATA_MODEL.md) | Every new table/family: fields, keys, lifecycle, authority, namespace isolation, examples |
| [VIDEO_PIPELINE.md](VIDEO_PIPELINE.md) | Source adapters, permissions, upload safety, derivatives, alignment rules, annotation vocabulary, sampling, possession/lineup rules |
| [PROFILES_AND_RANKING.md](PROFILES_AND_RANKING.md) | Trait registry, trait record shape, role templates, candidate search semantics, coverage rules, interpretation limits |
| [COPILOT.md](COPILOT.md) | Agent loop, provider abstraction, typed tools, claims and validation, budgets, streaming, evals |
| [CV_ROADMAP.md](CV_ROADMAP.md) | CV stages, first task and rationale, splits, interfaces, licensing, limitations, promotion gates |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Ordered phases and tasks with ids, dependencies, files, acceptance criteria, tests |
| [PROGRESS.md](PROGRESS.md) | Status ledger, validation results, capability log, exact next task, continuation prompt |
| [DECISIONS.md](DECISIONS.md) | Decisions (DEC-nn), assumptions, open questions, deferred choices |
| [LABELING_GUIDE.md](LABELING_GUIDE.md) | How to annotate: one observable action per row, identity before `verified`, sampling method, vocabulary v1 quick reference, review and deletion rules |
| [PILOT.md](PILOT.md) | Pilot protocol: scope, allowed footage, nine-step checklist, metrics M1–M7, what the pilot decides; status of pilot data |

Related existing docs: `docs/METHODOLOGY.md`, `docs/LIMITATIONS.md`, `docs/DATA_SOURCES.md`,
`docs/PLATFORM_OVERVIEW.md`, `docs/superpowers/specs/2026-10-08-nba-analytics-design.md`.

## Phase overview

| Phase | Outcome | Tasks |
| --- | --- | --- |
| A Event-linked evidence | `games`/`events` families, event id mapping, external video references, shot -> event -> evidence in the UI | A-01…A-08 |
| B Evidence review and authorised media | SQLite media registry, durable worker, uploads with permissions, playback, segments/anchors, annotations with revisions, snapshots, review UI, pilot protocol | B-01…B-10 |
| C Scouting profiles and comparison | trait registry, role templates, candidate search, profiles, shortlists, deterministic reports with validated citations, workspace UI | C-01…C-06 |
| D Scouting copilot | provider abstraction with no-key mode, typed tools, agent loop, Anthropic provider + streaming, claim validation, chat UI, evals | D-01…D-06 |
| E Narrow assisted CV | separate `cv/` runtime, licensing, shot-release detection, CVAT I/O, bounded tracking + identity review, court calibration | E-01…E-07 |
| F Advanced roster modelling | rotations, possessions, lineup stints, contracts source, adjusted impact, complementarity (documented only) | F-01…F-06 |

Dependencies: C-01/C-02 can start alongside Phase A; D needs C-05 and B-08; E needs B-02/B-04 and
labelled pilot clips; F is not scheduled.

Initial MVP = Phases A–D with external references and uploaded footage only
(DECISIONS DEC-08, DEC-16 pilot: 2024-25, ~8 players, ~12 games, 150–250 reviewed segments; the
pilot data do not exist yet).

## Resume protocol (follow at the start of every scouting session)

1. Read the repository instructions (`CLAUDE.md` at the root; global rules apply).
2. Read this file.
3. Read [PROGRESS.md](PROGRESS.md) and the decisions it lists as relevant.
4. Inspect `git status`, `git log --oneline | head`, and the current code for the task area.
5. Reconcile the ledger with reality: do the files PROGRESS claims exist? Do the recorded test
   results still hold (`make test`)? Correct PROGRESS first if not.
6. Select the next unblocked task (PROGRESS "Exact next task", or the first `not started` task
   whose dependencies are `tested`/`done`).
7. Read the task in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) **and** the design sections it
   links before writing code.

During implementation:
- Work in coherent, bounded tasks; write the failing test first; do not rewrite unrelated behaviour.
- Add a DECISIONS entry when architecture changes; never silently diverge from a selected decision.
- Mark a task complete only when its acceptance criteria are satisfied; distinguish `mocked`,
  `implemented`, `tested`, `validated` in PROGRESS.
- Record test commands **and actual results**; "test command identified" is not "tests pass".
- Record every source capability check (endpoint, params, date, result) in PROGRESS.
- Update `docs/METHODOLOGY.md` / `docs/LIMITATIONS.md` when new estimates or limitations appear.

Before ending a session:
- Update PROGRESS.md (status, changed files, validation results, partial work, blockers, exact next
  task id, copy-paste continuation instruction).
- Never leave progress only in chat.

## Commands relevant to the plan (verified today)

```bash
make test            # pytest with coverage + vitest
make lint            # ruff + oxlint
make build           # tsc -b + vite build
make e2e             # Playwright (API must be running)
cd backend && uv run pytest -q tests/<area>   # targeted
cd backend && uv run python -m app.ingestion.cli probe   # provider reachability (network)
```

Commands that tasks will add: `make worker`, `cli probe-capabilities`, `cli evidence link-events`,
`uv sync --group copilot`, `uv run --project cv ...`.
