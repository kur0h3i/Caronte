"""Consulta de filas con SQLAlchemy Core.

Los identificadores ya validados se convierten en objetos `table()`/`column()`: es
SQLAlchemy quien los entrecomilla según el motor. Los valores de filtros, `limit` y
`offset` viajan como parámetros enlazados.

Cada FK de una columna hacia la PK de otra tabla se resuelve con un LEFT JOIN a su
columna de display, de modo que la fila trae `{id, label}` sin consultas extra.
"""

import logging
from dataclasses import dataclass

from sqlalchemy import Row, Select, func, select
from sqlalchemy import column as sql_column
from sqlalchemy import table as sql_table
from sqlalchemy.exc import DBAPIError
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.selectable import FromClause, TableClause

from app.connections.errors import translate_db_errors
from app.connections.registry import ManagedConnection
from app.data.filters import bad_request, build_condition
from app.data.models import Filter, RowsResponse
from app.data.serialize import serialize_value
from app.introspection.models import ForeignKeyInfo, NormType, SchemaInfo, TableInfo
from app.security.identifiers import resolve_column

logger = logging.getLogger(__name__)


@dataclass
class _FkLabel:
    fk: ForeignKeyInfo
    # Columna de display en el alias del JOIN (None si no hay JOIN).
    label: ColumnElement | None = None
    label_type: NormType = "text"
    label_is_text: bool = False
    alias: FromClause | None = None
    onclause: ColumnElement[bool] | None = None
    # Posición de la etiqueta en la SELECT (tras las columnas de la tabla).
    position: int = -1
    # La columna de display es la propia PK referenciada: la etiqueta es el id.
    label_is_id: bool = False


class RowsQuery:
    def __init__(self, table: TableInfo, schema: SchemaInfo, db_schema: str | None, dialect: str):
        self.table = table
        self.dialect = dialect
        self.base: TableClause = sql_table(
            table.name, *(sql_column(c.name) for c in table.columns), schema=db_schema
        )
        self.labels: dict[str, _FkLabel] = {}
        self._joined: list[str] = []

        taken = {name.lower() for name in schema.tables}
        for index, col in enumerate(table.columns):
            fk = table.fk_for_column(col.name)
            if fk is None:
                continue
            entry = _FkLabel(fk=fk)
            self.labels[col.name] = entry
            if not fk.joinable or fk.display_column is None:
                continue
            ref = schema.tables[fk.ref_table]
            ref_col = fk.ref_columns[0]
            if fk.display_column == ref_col:
                entry.label_is_id = True
                continue
            alias = sql_table(
                ref.name, sql_column(ref_col), sql_column(fk.display_column), schema=db_schema
            ).alias(_unique_alias(f"caronte_fk{index}", taken))
            display = ref.column(fk.display_column)
            entry.alias = alias
            entry.label = alias.c[fk.display_column]
            entry.label_type = display.type
            entry.label_is_text = display.type == "text" and not display.compare_as_text
            entry.onclause = self.base.c[col.name] == alias.c[ref_col]
            entry.position = len(self._joined)
            self._joined.append(col.name)

    def conditions(self, filters: list[Filter]) -> tuple[list[ColumnElement[bool]], set[str]]:
        """Devuelve las condiciones WHERE y las FKs cuyo JOIN necesitan."""
        conditions, needs_join = [], set()
        for f in filters:
            col = resolve_column(self.table, f.column)
            entry = self.labels.get(col.name)
            label = entry.label if entry is not None and f.op == "contains" else None
            if label is not None:
                needs_join.add(col.name)
            conditions.append(
                build_condition(
                    f,
                    col,
                    self.base.c[col.name],
                    label,
                    entry.label_is_text if entry else False,
                    self.dialect,
                )
            )
        return conditions, needs_join

    def ordering(self, sort: str | None) -> list[ColumnElement]:
        """`sort` = "Columna" o "-Columna". Siempre desempata por la PK para paginar estable."""
        order: list[ColumnElement] = []
        sort_name = None
        if sort:
            descending = sort.startswith("-")
            sort_name = sort.removeprefix("-")
            col = resolve_column(self.table, sort_name)
            if col.type == "json":
                raise bad_request(f"No se puede ordenar por una columna JSON ({col.name!r})")
            entry = self.labels.get(col.name)
            # Una FK se ordena por su etiqueta, que es lo que se ve en pantalla.
            has_label = entry is not None and entry.label is not None
            expr = entry.label if has_label else self.base.c[col.name]
            order.append(expr.desc() if descending else expr.asc())
        order.extend(self.base.c[pk].asc() for pk in self.table.primary_key if pk != sort_name)
        return order

    def _from(self, joins: list[str]) -> FromClause:
        clause: FromClause = self.base
        for name in joins:
            entry = self.labels[name]
            clause = clause.outerjoin(entry.alias, entry.onclause)
        return clause

    def rows_statement(
        self,
        conditions: list[ColumnElement[bool]],
        order: list[ColumnElement],
        limit: int,
        offset: int,
    ) -> Select:
        columns = [self.base.c[c.name] for c in self.table.columns]
        columns += [self.labels[name].label for name in self._joined]
        return (
            select(*columns)
            .select_from(self._from(self._joined))
            .where(*conditions)
            .order_by(*order)
            .limit(limit)
            .offset(offset)
        )

    def count_statement(self, conditions: list[ColumnElement[bool]], joins: set[str]) -> Select:
        needed = [name for name in self._joined if name in joins]
        return select(func.count()).select_from(self._from(needed)).where(*conditions)

    def to_dict(self, row: Row) -> dict:
        width = len(self.table.columns)
        out = {}
        for index, col in enumerate(self.table.columns):
            value = serialize_value(row[index], col.type)
            entry = self.labels.get(col.name)
            if entry is None or value is None:
                out[col.name] = value
                continue
            if entry.label is not None:
                label = serialize_value(row[width + entry.position], entry.label_type)
            else:
                label = value if entry.label_is_id else None
            out[col.name] = {"id": value, "label": label}
        return out


def _unique_alias(candidate: str, taken: set[str]) -> str:
    name, n = candidate, 0
    while name.lower() in taken:
        n += 1
        name = f"{candidate}_{n}"
    taken.add(name.lower())
    return name


def fetch_rows(
    managed: ManagedConnection,
    schema: SchemaInfo,
    table: TableInfo,
    filters: list[Filter],
    sort: str | None,
    limit: int,
    offset: int,
) -> RowsResponse:
    query = RowsQuery(table, schema, managed.schema, managed.dialect)
    conditions, filter_joins = query.conditions(filters)
    statement = query.rows_statement(conditions, query.ordering(sort), limit, offset)

    with translate_db_errors(managed.name, managed.statement_timeout):
        with managed.engine.connect() as conn:
            result = conn.execute(statement).all()
        rows = [query.to_dict(r) for r in result]

    if len(rows) < limit and (rows or offset == 0):
        total: int | None = offset + len(rows)  # última página: no hace falta COUNT(*)
    else:
        total = _count(managed, table.name, query.count_statement(conditions, filter_joins))

    return RowsResponse(
        columns=[c.name for c in table.columns],
        rows=rows,
        total=total,
        limit=limit,
        offset=offset,
    )


def _count(managed: ManagedConnection, table_name: str, statement: Select) -> int | None:
    # En tablas enormes el COUNT(*) puede agotar el timeout: mejor sin total que sin filas.
    try:
        with managed.engine.connect() as conn:
            return conn.execute(statement).scalar_one()
    except DBAPIError as exc:
        logger.info("Recuento omitido en %s.%s: %s", managed.name, table_name, exc.orig)
        return None
