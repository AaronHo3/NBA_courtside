FROM python:3.13-slim
WORKDIR /app
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY app ./app
ENV NBA_DATA_DIR=/data API_HOST=0.0.0.0 API_PORT=8000
EXPOSE 8000
# generate the labelled demo dataset on first start if no data exists, then serve
CMD ["sh", "-c", "[ -f /data/demo/manifest.json ] || uv run python -m app.demo.generate; uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]
