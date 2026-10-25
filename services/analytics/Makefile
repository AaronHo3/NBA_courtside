# Analytics service (was nba_advanced_statistics/backend). Run from this directory or via `make -C services/analytics`.
# Data lives in <repo>/data/analytics (override with NBA_DATA_DIR in ./.env).
.PHONY: api worker demo-data ingest ingest-status test lint verify

API_PORT ?= 8001
SEASONS ?= 2024-25
FAMILIES ?= all
SEASON ?= 2025-26

api:
	uv run uvicorn app.main:app --reload --host 127.0.0.1 --port $(API_PORT)

# Durable media/snapshot worker for the real namespace (or JOBS_INLINE=1 in .env for one-process dev).
worker:
	uv run python -m app.jobs.worker --namespace nba

# Deterministic, visibly-labeled synthetic dataset (namespace: demo).
demo-data:
	uv run python -m app.demo.generate

# Real provider ingestion (namespace: nba). Example: make ingest SEASONS="2024-25 2023-24"
ingest:
	uv run python -m app.ingestion.cli run --seasons $(SEASONS) --families $(FAMILIES)

ingest-status:
	uv run python -m app.ingestion.cli status

test:
	uv run pytest -q --cov=app --cov-report=term-missing

lint:
	uv run ruff check app tests

verify:
	uv run python -m app.verify --season $(SEASON)
