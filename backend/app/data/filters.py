"""Filtros por columna: parseo, validación y conversión a expresiones de SQLAlchemy."""

import json
import operator
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import HTTPException, status
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import String, cast
from sqlalchemy.sql.elements import ColumnElement

from app.data.models import Filter
from app.introspection.models import ColumnInfo

MAX_FILTERS = 20
MAX_VALUE_LENGTH = 1000

_filters_adapter = TypeAdapter(list[Filter])

_COMPARISONS = {
    "eq": operator.eq,
    "ne": operator.ne,
    "lt": operator.lt,
    "lte": operator.le,
    "gt": operator.gt,
    "gte": operator.ge,
}
_TRUE = {"1", "true", "t", "yes", "y", "si", "sí"}
_FALSE = {"0", "false", "f", "no", "n"}


def bad_request(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, detail)


def parse_filters(raw: str | None) -> list[Filter]:
    """`raw` es JSON: [{"column": "Name", "op": "contains", "value": "rock"}, ...]."""
    if not raw:
        return []
    try:
        filters = _filters_adapter.validate_python(json.loads(raw))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise bad_request(f"Parámetro 'filters' no válido: {exc}") from None
    if len(filters) > MAX_FILTERS:
        raise bad_request(f"Como máximo {MAX_FILTERS} filtros")
    for f in filters:
        if isinstance(f.value, str) and len(f.value) > MAX_VALUE_LENGTH:
            raise bad_request(f"Valor de filtro demasiado largo (máx. {MAX_VALUE_LENGTH})")
    return filters


def coerce_value(col: ColumnInfo, raw: Any, dialect: str) -> Any:
    """Convierte el valor al tipo Python de la columna; si no encaja, 400.

    Así el driver envía el tipo correcto (p. ej. un int y no el texto "5") y los
    errores de tipo se detectan antes de llegar a la BD.
    """
    try:
        match col.type:
            case "int":
                if isinstance(raw, bool) or (isinstance(raw, float) and not raw.is_integer()):
                    raise ValueError
                return int(raw) if isinstance(raw, int | float) else int(str(raw).strip())
            case "numeric":
                value = Decimal(str(raw).strip())
                if not value.is_finite():
                    raise ValueError
                # sqlite3 no sabe enlazar Decimal.
                return float(value) if dialect == "sqlite" else value
            case "bool":
                return _parse_bool(raw)
            case "date":
                parsed = date.fromisoformat(str(raw).strip())
                # SQLite guarda fechas como texto ISO: comparamos texto con texto.
                return parsed.isoformat() if dialect == "sqlite" else parsed
            case "datetime":
                parsed_dt = datetime.fromisoformat(str(raw).strip())
                return parsed_dt.isoformat(sep=" ") if dialect == "sqlite" else parsed_dt
            case "enum":
                value = str(raw)
                if col.enum_values and value not in col.enum_values:
                    raise ValueError
                return value
            case "json":
                raise ValueError
            case _:
                return str(raw)
    except (ValueError, TypeError, InvalidOperation):
        raise bad_request(f"Valor no válido para {col.name!r} ({col.type}): {raw!r}") from None


def _parse_bool(raw: Any) -> bool:
    if isinstance(raw, bool):
        return raw
    text = str(raw).strip().lower()
    if text in _TRUE:
        return True
    if text in _FALSE:
        return False
    raise ValueError


def build_condition(
    f: Filter,
    col: ColumnInfo,
    target: ColumnElement,
    label: ColumnElement | None,
    label_is_text: bool,
    dialect: str,
) -> ColumnElement[bool]:
    """`target` es la columna; `label`, la columna de display si es una FK con etiqueta."""
    if f.op == "is_null":
        return target.is_(None)
    if f.op == "not_null":
        return target.is_not(None)
    if f.value is None:
        raise bad_request(f"El filtro {f.op!r} sobre {col.name!r} necesita un valor")

    if f.op == "contains":
        # En una FK se busca en la etiqueta (lo que el usuario ve), no en el id.
        if label is not None:
            haystack, is_text = label, label_is_text
        else:
            haystack, is_text = target, col.type == "text" and not col.compare_as_text
        text_expr = haystack if is_text else cast(haystack, String)
        # autoescape: un "%" o "_" del usuario se busca literalmente, no como comodín.
        return text_expr.icontains(str(f.value), autoescape=True)

    if col.type == "json":
        raise bad_request(f"Las columnas JSON solo admiten 'contains' y nulos ({col.name!r})")
    value = coerce_value(col, f.value, dialect)
    compared = cast(target, String) if col.compare_as_text else target
    return _COMPARISONS[f.op](compared, value)
