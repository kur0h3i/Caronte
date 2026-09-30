"""Conversión de valores del driver a JSON que el frontend pueda pintar sin perder datos."""

import json
import math
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.introspection.models import NormType

# Enteros mayores pierden precisión en JavaScript: se envían como texto.
MAX_SAFE_INT = 2**53 - 1
BINARY_PREVIEW = 32


def serialize_value(value: Any, norm_type: NormType) -> Any:
    if value is None:
        return None
    if norm_type == "bool" and isinstance(value, int | bool | str):
        return _to_bool(value)
    if norm_type == "json" and isinstance(value, str | bytes):
        # MariaDB y SQLite devuelven el JSON como texto.
        try:
            return _jsonable(json.loads(value))
        except ValueError:
            return _jsonable(value)
    if norm_type == "datetime" and isinstance(value, str) and len(value) >= 19 and value[10] == " ":
        # SQLite: "2024-01-31 10:00:00" -> ISO 8601 que cualquier navegador entiende.
        return f"{value[:10]}T{value[11:]}"
    return _jsonable(value)


def _to_bool(value: int | bool | str) -> bool | str:
    if isinstance(value, str):
        low = value.strip().lower()
        if low in {"1", "true", "t"}:
            return True
        if low in {"0", "false", "f"}:
            return False
        return value
    return bool(value)


def _jsonable(value: Any) -> Any:
    if isinstance(value, bool | str):
        return value
    if isinstance(value, int):
        return value if abs(value) <= MAX_SAFE_INT else str(value)
    if isinstance(value, float):
        return value if math.isfinite(value) else str(value)
    if isinstance(value, Decimal):
        # Texto para no perder precisión (importes, NUMERIC(38,10)...).
        return format(value, "f") if value.is_finite() else str(value)
    if isinstance(value, datetime | date | time):
        return value.isoformat()
    if isinstance(value, timedelta):
        return str(value)
    if isinstance(value, bytes | bytearray | memoryview):
        data = bytes(value)
        suffix = "…" if len(data) > BINARY_PREVIEW else ""
        return f"0x{data[:BINARY_PREVIEW].hex()}{suffix} ({len(data)} bytes)"
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, list | tuple | set):
        return [_jsonable(v) for v in value]
    return str(value)
