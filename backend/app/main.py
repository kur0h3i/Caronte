"""Punto de entrada. Arranque: `uvicorn app.main:create_app --factory`."""

import logging
import os
from collections.abc import Mapping
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI

from app.config import Settings
from app.connections.registry import ConnectionRegistry
from app.connections.router import router as connections_router
from app.introspection.cache import SchemaCache
from app.introspection.router import router as introspection_router

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


def create_app(
    settings: Settings | None = None, environ: Mapping[str, str] | None = None
) -> FastAPI:
    settings = settings or Settings()
    registry = ConnectionRegistry.from_settings(
        settings, os.environ if environ is None else environ
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        registry.dispose()

    app = FastAPI(
        title="Caronte",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    app.state.settings = settings
    app.state.registry = registry
    app.state.schema_cache = SchemaCache(ttl=settings.schema_cache_ttl)

    public = APIRouter(prefix="/api")

    @public.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    api = APIRouter(prefix="/api")
    api.include_router(connections_router)
    api.include_router(introspection_router)

    app.include_router(public)
    app.include_router(api)
    return app
