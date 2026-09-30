"""Normalización de tipos SQL a un conjunto pequeño que entiende el frontend."""

from sqlalchemy import Dialect
from sqlalchemy import types as sa_types
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.dialects.postgresql import ARRAY

from app.introspection.models import NormType


def normalize_type(sa_type: sa_types.TypeEngine) -> tuple[NormType, list[str] | None]:
    """Devuelve (tipo normalizado, valores del enum si lo es).

    El orden importa: Enum hereda de String y Boolean no hereda de Integer.
    """
    if isinstance(sa_type, sa_types.Enum):
        return "enum", list(sa_type.enums)
    if isinstance(sa_type, sa_types.Boolean):
        return "bool", None
    # MySQL/MariaDB no tienen BOOLEAN real: es un alias de TINYINT(1).
    if isinstance(sa_type, TINYINT) and sa_type.display_width == 1:
        return "bool", None
    if isinstance(sa_type, sa_types.Integer):
        return "int", None
    # En SQLAlchemy 2.1 Float ya no hereda de Numeric: comprobamos ambos.
    if isinstance(sa_type, sa_types.Numeric | sa_types.Float):
        return "numeric", None
    if isinstance(sa_type, sa_types.DateTime):  # incluye TIMESTAMP
        return "datetime", None
    if isinstance(sa_type, sa_types.Date):
        return "date", None
    if isinstance(sa_type, sa_types.JSON | ARRAY):
        return "json", None
    return "text", None


def raw_type_name(sa_type: sa_types.TypeEngine, dialect: Dialect) -> str:
    """Tipo tal y como lo escribe el motor (p. ej. "VARCHAR(120)", "TINYINT(1)")."""
    try:
        return sa_type.compile(dialect=dialect)
    except Exception:  # tipos exóticos que el dialecto no sabe compilar
        return type(sa_type).__name__.upper()
