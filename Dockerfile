# syntax=docker/dockerfile:1
# Imagen única: la API (FastAPI) sirve también el frontend compilado.

# --- 1. Frontend: compila React/Vite a ficheros estáticos -------------------------
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- 2. Dependencias de Python en un virtualenv (con uv y el lockfile) -------------
FROM python:3.12-slim AS deps
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
RUN pip install --no-cache-dir uv==0.8.17
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# --- 3. Imagen final: solo el venv, el código y el frontend -------------------------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    CARONTE_STATIC_DIR=/app/static \
    CARONTE_PORT=8000
RUN useradd --system --uid 10001 --home-dir /app caronte
WORKDIR /app
COPY --from=deps /app/.venv ./.venv
COPY backend/app ./app
COPY --from=frontend /build/dist ./static

USER caronte
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
    CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"CARONTE_PORT\"]}/api/health')"]
# Forma shell (con exec) para poder usar ${CARONTE_PORT}: útil con network_mode: host.
CMD ["sh", "-c", "exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port \"${CARONTE_PORT}\" --proxy-headers"]
