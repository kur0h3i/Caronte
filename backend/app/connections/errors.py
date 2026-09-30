import logging
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from fastapi import HTTPException, status
from sqlalchemy.exc import DBAPIError

logger = logging.getLogger(__name__)

# Códigos de error de "sentencia interrumpida por tiempo" en MariaDB (1969) y MySQL (3024).
_MYSQL_TIMEOUT_CODES = {1969, 3024}


def is_timeout(exc: DBAPIError) -> bool:
    orig = exc.orig
    if isinstance(orig, psycopg.errors.QueryCanceled):
        return True
    if isinstance(orig, sqlite3.OperationalError) and "interrupted" in str(orig):
        return True
    args = getattr(orig, "args", ())
    return bool(args) and args[0] in _MYSQL_TIMEOUT_CODES


@contextmanager
def translate_db_errors(connection_name: str, timeout: float) -> Iterator[None]:
    """Convierte errores del driver en respuestas HTTP comprensibles."""
    try:
        yield
    except DBAPIError as exc:
        if is_timeout(exc):
            raise HTTPException(
                status.HTTP_504_GATEWAY_TIMEOUT,
                f"La consulta superó el tiempo límite ({timeout:g} s)",
            ) from None
        logger.warning("Error de BD en %s: %s", connection_name, exc)
        first_line = (str(exc.orig).strip().splitlines() or ["desconocido"])[0][:300]
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"Error de base de datos ({connection_name}): {first_line}"
        ) from None
