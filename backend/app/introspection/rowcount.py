"""Número aproximado de filas por tabla, usando las estadísticas de cada motor."""

from sqlalchemy import Connection, func, select, table, text
from sqlalchemy.exc import DBAPIError

_PG_QUERY = text(
    """
    SELECT c.relname, c.reltuples::bigint
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = COALESCE(:schema, current_schema())
      AND c.relkind IN ('r', 'p', 'm')
    """
)

_MYSQL_QUERY = text(
    """
    SELECT TABLE_NAME, TABLE_ROWS
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = COALESCE(:schema, DATABASE()) AND TABLE_TYPE = 'BASE TABLE'
    """
)


def approx_row_counts(
    conn: Connection, schema: str | None, tables: set[str]
) -> dict[str, int | None]:
    dialect = conn.dialect.name
    if dialect == "postgresql":
        # reltuples es -1 si la tabla nunca se ha analizado: lo tratamos como desconocido.
        rows = conn.execute(_PG_QUERY, {"schema": schema})
        return {name: (int(n) if n is not None and n >= 0 else None) for name, n in rows}
    if dialect in ("mysql", "mariadb"):
        rows = conn.execute(_MYSQL_QUERY, {"schema": schema})
        return {name: (int(n) if n is not None else None) for name, n in rows}
    # SQLite no guarda estadísticas fiables, pero COUNT(*) es barato en BDs de este tamaño
    # y además está acotado por el timeout por sentencia.
    counts: dict[str, int | None] = {}
    for name in tables:
        try:
            counts[name] = conn.execute(
                select(func.count()).select_from(table(name, schema=schema))
            ).scalar_one()
        except DBAPIError:
            counts[name] = None
    return counts
