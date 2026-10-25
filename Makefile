# Courtside: one frontend (frontend/) in front of two FastAPI services with separate Python envs.
#   make install      -> uv sync (both services) + npm ci (frontend)
#   make dev          -> analytics API :8001, fantasy API :8002, Courtside UI :5173 (/ and /fantasy)
#   make e2e-fantasy  -> fantasy copilot Playwright suite (own throwaway API on :8010, Vite on :5175)
# Override ports: make dev ANALYTICS_PORT=8011 FANTASY_PORT=8012 FRONTEND_PORT=5183
.PHONY: install dev analytics fantasy web demo-data fantasy-demo \
        test test-analytics test-fantasy test-frontend typecheck lint build e2e e2e-fantasy

ANALYTICS_PORT ?= 8001
FANTASY_PORT ?= 8002
FRONTEND_PORT ?= 5173

ANALYTICS_URL = http://127.0.0.1:$(ANALYTICS_PORT)
FANTASY_URL = http://127.0.0.1:$(FANTASY_PORT)

install:
	cd services/analytics && uv sync
	cd services/fantasy && uv sync
	cd frontend && npm ci

# All three processes in one terminal; Ctrl-C stops them all.
dev:
	@echo "analytics API  $(ANALYTICS_URL)/docs"
	@echo "fantasy API    $(FANTASY_URL)/docs"
	@echo "Courtside      http://127.0.0.1:$(FRONTEND_PORT)  (analytics)   http://127.0.0.1:$(FRONTEND_PORT)/fantasy  (copilot)"
	@echo "proxy          /api/analytics/* -> :$(ANALYTICS_PORT)   /api/fantasy/* -> :$(FANTASY_PORT)"
	@trap 'kill 0' INT TERM; \
	(cd services/analytics && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port $(ANALYTICS_PORT)) & \
	(cd services/fantasy && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port $(FANTASY_PORT)) & \
	(cd frontend && ANALYTICS_BACKEND=$(ANALYTICS_URL) FANTASY_BACKEND=$(FANTASY_URL) npm run dev -- --host 127.0.0.1 --port $(FRONTEND_PORT) --strictPort) & \
	wait

analytics:
	cd services/analytics && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port $(ANALYTICS_PORT)

fantasy:
	cd services/fantasy && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port $(FANTASY_PORT)

web:
	cd frontend && ANALYTICS_BACKEND=$(ANALYTICS_URL) FANTASY_BACKEND=$(FANTASY_URL) npm run dev -- --host 127.0.0.1 --port $(FRONTEND_PORT) --strictPort

# Data helpers (service-specific CLIs live in services/*/Makefile).
demo-data:
	$(MAKE) -C services/analytics demo-data

fantasy-demo:
	$(MAKE) -C services/fantasy demo

# Checks
test: test-analytics test-fantasy test-frontend

test-analytics:
	cd services/analytics && uv run pytest -q --cov=app --cov-report=term-missing

test-fantasy:
	cd services/fantasy && uv run pytest

test-frontend:
	cd frontend && npx vitest run && npx tsc -b

typecheck:
	cd frontend && npx tsc -b

lint:
	cd services/analytics && uv run ruff check app tests
	cd services/fantasy && uv run ruff check app tests
	cd frontend && npm run lint

build:
	cd frontend && npm run build

# Playwright: the analytics smoke tests expect `make dev` to be running (they go through the Vite proxy).
e2e:
	cd frontend && npx playwright test

# Fantasy copilot suite: boots its own fantasy API (:8010) on a temp data dir and a Vite server (:5175).
e2e-fantasy:
	cd frontend && npx playwright test -c playwright.fantasy.config.ts
