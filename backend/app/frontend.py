"""Sirve el frontend compilado (producción): un único contenedor para API y web."""

import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger(__name__)


def mount_frontend(app: FastAPI, static_dir: Path) -> None:
    root = static_dir.resolve()
    index = root / "index.html"
    if not index.is_file():
        logger.warning("No hay frontend compilado en %s: solo se sirve la API", root)
        return

    # Ficheros con hash en el nombre (Vite): se pueden cachear para siempre.
    if (root / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=root / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Ruta de API desconocida")
        candidate = (root / path).resolve()
        # Ficheros sueltos de public/ (favicon.svg...), sin salir nunca de static_dir.
        if path and candidate.is_file() and candidate.is_relative_to(root):
            return FileResponse(candidate)
        # Cualquier otra ruta es del router de React: devolvemos index.html.
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
