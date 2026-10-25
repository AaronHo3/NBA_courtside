# Courtside Research: repository instructions

Local-first NBA analytics workbench: FastAPI + DuckDB over Parquet (`backend/`), React + Vite
(`frontend/`), `nba_api` ingestion with a real `nba` namespace and a synthetic `demo` namespace.
Start with `README.md`; methods in `docs/METHODOLOGY.md`, limits in `docs/LIMITATIONS.md`,
current capabilities in `docs/PLATFORM_OVERVIEW.md`.

Conventions every change must keep: percentages are fractions; counting stats are totals; null is
missing, never zero; traded players have stint rows plus one aggregate row; every row carries
`source` and `fetched_at`; the browser never contacts stats.nba.com; demo and real data never mix.
Run `make test` (pytest + vitest) before committing; do not commit `data/`.

## Scouting copilot extension (planning lives in `docs/scouting/`)

The plan for extending the platform into a scouting copilot (video evidence, assisted computer
vision, roster decision support) is in `docs/scouting/README.md`. It is the entry point for any
session touching scouting, evidence, media, annotations, jobs, the copilot, or CV.

Resume/update protocol for those sessions:

1. Read this file, then `docs/scouting/README.md`, then `docs/scouting/PROGRESS.md` and the
   decisions it lists (`docs/scouting/DECISIONS.md`).
2. Check `git status` and the current code; reconcile `PROGRESS.md` with reality before working.
3. Pick the next unblocked task from `docs/scouting/IMPLEMENTATION_PLAN.md`, read its linked design
   sections, write the failing test first, implement, verify.
4. Record a `DEC-nn` entry when architecture changes. Mark tasks complete only when acceptance
   criteria pass; distinguish mocked / implemented / tested / validated.
5. Before ending the session update `PROGRESS.md`: changed files, test commands with actual
   results, capability checks performed, partial work, blockers, the exact next task id, and the
   copy-paste continuation instruction. Progress must never live only in chat.

Provider endpoints beyond those already ingested are candidates until a recorded response exists;
never download provider media, scrape, or bypass access restrictions.
