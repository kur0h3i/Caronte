"""Mapa de datos "Estigia": el esquema como grafo y la vecindad de una fila.

Todo se construye con `fetch_rows`, así que hereda sus garantías: identificadores
validados contra la introspección, valores enlazados, límites y timeout.
"""

from typing import Any

from fastapi import HTTPException, status

from app.connections.registry import ManagedConnection
from app.data.filters import bad_request
from app.data.models import Filter
from app.data.query import fetch_rows
from app.graph.models import (
    GraphRelation,
    GraphTable,
    IncomingGroup,
    Neighbors,
    NodeRef,
    OutgoingLink,
    SchemaGraph,
)
from app.introspection.display import choose_display_column
from app.introspection.models import ForeignKeyInfo, SchemaInfo, TableInfo


def _single_fks(table: TableInfo) -> list[ForeignKeyInfo]:
    return [fk for fk in table.foreign_keys if len(fk.columns) == 1]


def is_junction(table: TableInfo) -> bool:
    """Tabla pivote N:M: su PK tiene 2+ columnas y todas son FKs (p. ej. playlist_track)."""
    fk_columns = {fk.columns[0] for fk in _single_fks(table)}
    return len(table.primary_key) >= 2 and set(table.primary_key) <= fk_columns


def schema_graph(schema: SchemaInfo, overrides: dict[str, str]) -> SchemaGraph:
    tables = [
        GraphTable(
            name=t.name,
            kind=t.kind,
            approx_rows=t.approx_rows,
            primary_key=t.primary_key,
            display_column=choose_display_column(t, overrides.get(t.name)),
            explorable=len(t.primary_key) == 1,
            junction=is_junction(t),
        )
        for t in schema.tables.values()
    ]
    relations = [
        GraphRelation(
            name=fk.name,
            from_table=t.name,
            from_columns=fk.columns,
            to_table=fk.ref_table,
            to_columns=fk.ref_columns,
        )
        for t in schema.tables.values()
        for fk in t.foreign_keys
        if fk.ref_table in schema.tables
    ]
    return SchemaGraph(tables=tables, relations=relations)


def _plain(value: Any) -> Any:
    """El valor "desnudo" de una celda: de una FK {id, label} nos quedamos con el id."""
    return value["id"] if isinstance(value, dict) and "id" in value else value


def _label(row: dict[str, Any], table: TableInfo, overrides: dict[str, str]) -> Any:
    value = row.get(choose_display_column(table, overrides.get(table.name)) or "")
    if isinstance(value, dict):
        return value.get("label") if value.get("label") is not None else value.get("id")
    return value


def neighbors(
    managed: ManagedConnection,
    schema: SchemaInfo,
    table: TableInfo,
    row_id: str,
    limit: int,
) -> Neighbors:
    if len(table.primary_key) != 1:
        raise bad_request(
            f"{table.name!r} no tiene una PK de una sola columna: no se puede explorar fila a fila"
        )
    overrides = managed.config.display_columns
    pk = table.primary_key[0]

    # El id se convierte al tipo de la PK dentro de fetch_rows (400 si no encaja).
    found = fetch_rows(
        managed, schema, table, [Filter(column=pk, op="eq", value=row_id)], None, 1, 0
    )
    if not found.rows:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"No existe {table.name} con {pk} = {row_id}"
        )
    row = found.rows[0]
    node = NodeRef(table=table.name, id=_plain(row[pk]), label=_label(row, table, overrides))

    outgoing = [
        OutgoingLink(
            table=fk.ref_table,
            column=fk.columns[0],
            id=row[fk.columns[0]]["id"],
            label=row[fk.columns[0]]["label"],
        )
        for fk in _single_fks(table)
        if isinstance(row.get(fk.columns[0]), dict) and fk.ref_table in schema.tables
    ]

    incoming: list[IncomingGroup] = []
    for source in schema.tables.values():
        for fk in _single_fks(source):
            if fk.ref_table != table.name or fk.ref_columns != [pk]:
                continue
            group = _incoming_group(managed, schema, source, fk, node.id, limit, overrides)
            if group is not None:
                incoming.append(group)

    return Neighbors(node=node, row=row, outgoing=outgoing, incoming=incoming)


def _incoming_group(
    managed: ManagedConnection,
    schema: SchemaInfo,
    source: TableInfo,
    fk: ForeignKeyInfo,
    node_id: Any,
    limit: int,
    overrides: dict[str, str],
) -> IncomingGroup | None:
    column = fk.columns[0]
    junction = is_junction(source)
    # En una pivote saltamos a "la otra" FK de la PK: pista -> playlists, no -> playlist_track.
    other = next(
        (
            o
            for o in _single_fks(source)
            if o.columns[0] in source.primary_key and o.columns[0] != column
        ),
        None,
    )
    if junction and other is None:
        return None
    if not junction and len(source.primary_key) != 1:
        return None  # sin PK simple no podemos identificar cada vecino

    page = fetch_rows(
        managed, schema, source, [Filter(column=column, op="eq", value=node_id)], None, limit, 0
    )
    if not page.rows:
        return None

    if junction:
        target = other.columns[0]
        items = [
            NodeRef(table=other.ref_table, id=_plain(r[target]), label=r[target].get("label"))
            for r in page.rows
            if isinstance(r.get(target), dict)
        ]
        return IncomingGroup(
            table=other.ref_table, column=column, via=source.name, total=page.total, items=items
        )

    source_pk = source.primary_key[0]
    items = [
        NodeRef(table=source.name, id=_plain(r[source_pk]), label=_label(r, source, overrides))
        for r in page.rows
    ]
    return IncomingGroup(table=source.name, column=column, via=None, total=page.total, items=items)
