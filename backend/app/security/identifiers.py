"""Validación de identificadores SQL contra la lista obtenida por introspección.

Nunca se interpola un nombre de tabla o columna que venga del usuario: primero se busca
en el esquema reflejado (coincidencia exacta) y, si no está, la API responde 400. Los
nombres válidos se pasan luego a SQLAlchemy, que es quien los entrecomilla según el motor.
"""

from fastapi import HTTPException, status

from app.introspection.models import ColumnInfo, SchemaInfo, TableInfo


class InvalidIdentifierError(HTTPException):
    def __init__(self, kind: str, name: str):
        super().__init__(status.HTTP_400_BAD_REQUEST, f"{kind} desconocida: {name!r}")


def resolve_table(schema: SchemaInfo, name: str) -> TableInfo:
    table = schema.tables.get(name)
    if table is None:
        raise InvalidIdentifierError("Tabla", name)
    return table


def resolve_column(table: TableInfo, name: str) -> ColumnInfo:
    column = table.column(name)
    if column is None:
        raise InvalidIdentifierError("Columna", name)
    return column
