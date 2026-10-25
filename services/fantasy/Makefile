# Fantasy service (was fantasy_draft_simulator/backend). Run from this directory or via `make -C services/fantasy`.
# Data lives in <repo>/data/fantasy, docs it writes in <repo>/docs/fantasy, exports in <repo>/exports/fantasy.
.PHONY: api demo refresh health test lint validate evaluate research season link sync performance build-snapshot openapi bench export import

API_PORT ?= 8002
SESSION ?=
FILE ?=
LEAGUE ?=

api:
	uv run uvicorn app.main:app --reload --host 127.0.0.1 --port $(API_PORT)

demo:
	uv run python -m app.cli demo

refresh:
	uv run python -m app.cli refresh

health:
	uv run python -m app.cli health

test:
	uv run pytest

lint:
	uv run ruff check app tests

validate:
	uv run python -m app.cli validate

evaluate:
	uv run python -m app.cli evaluate-draft

research:
	uv run python -m app.cli research

season:
	uv run python -m app.cli season $(SESSION) --out ../../exports/fantasy/season_week.xlsx

link:
	uv run python -m app.cli espn-link $(SESSION) $(LEAGUE) --apply

sync:
	uv run python -m app.cli espn-sync $(SESSION)

performance:
	uv run python -m app.cli performance $(SESSION)

build-snapshot:
	uv run python -m app.cli build-snapshot

bench:
	uv run python -m app.cli bench

export:
	uv run python -m app.cli export $(SESSION)

import:
	uv run python -m app.cli import-session $(FILE)

# Regenerate the fantasy UI's typed client (frontend/src/fantasy/api) from the live OpenAPI schema.
openapi:
	uv run python -m app.cli openapi > ../../frontend/src/fantasy/api/openapi.json
	cd ../../frontend && npx -y openapi-typescript@7 src/fantasy/api/openapi.json -o src/fantasy/api/schema.d.ts
