"""Punto de entrada. Arranque: `uvicorn app.main:create_app --factory`."""

import logging
import os
from collections.abc import Mapping
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI

from app.config import Settings
from app.connections.registry import ConnectionRegistry
from app.connections.router import router as connections_router
from app.data.router import router as data_router
from app.introspection.cache import SchemaCache
from app.introspection.router import router as introspection_router
from app.security.auth import LoginThrottle, SessionStore, require_session
from app.security.headers import SecurityHeadersMiddleware
from app.security.router import router as auth_router

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
    app.state.sessions = SessionStore(ttl=settings.session_ttl)
    app.state.login_throttle = LoginThrottle()
    app.add_middleware(SecurityHeadersMiddleware)

    public = APIRouter(prefix="/api")

    @public.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    public.include_router(auth_router)

    # Todo lo que toca bases de datos exige sesión.
    api = APIRouter(prefix="/api", dependencies=[Depends(require_session)])
    api.include_router(connections_router)
    api.include_router(introspection_router)
    api.include_router(data_router)

    app.include_router(public)
    app.include_router(api)
    return app
