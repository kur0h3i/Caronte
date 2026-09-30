"""Lee el esquema completo de una conexión con `sqlalchemy.inspect()`."""

import re
from contextlib import suppress

from sqlalchemy import Connection, Dialect, inspect, text
from sqlalchemy import types as sa_types
from sqlalchemy.engine.reflection import ObjectKind

from app.connections.registry import ManagedConnection
from app.introspection.display import choose_display_column
from app.introspection.models import ColumnInfo, ForeignKeyInfo, SchemaInfo, TableInfo
from app.introspection.rowcount import approx_row_counts
from app.introspection.types import normalize_type, raw_type_name

_MARIADB_JSON_CHECK = re.compile(r"\s*json_valid\(`([^`]+)`\)\s*", re.IGNORECASE)


def load_schema(managed: ManagedConnection) -> SchemaInfo:
    schema = managed.schema
    dialect = managed.engine.dialect
    with managed.engine.connect() as conn:
        insp = inspect(conn)
        table_names = set(insp.get_table_names(schema=schema))
        view_names = set(insp.get_view_names(schema=schema))
        with suppress(NotImplementedError):  # solo Postgres tiene vistas materializadas
            view_names |= set(insp.get_materialized_view_names(schema=schema))

        columns = insp.get_multi_columns(schema=schema, kind=ObjectKind.ANY)
        pks = insp.get_multi_pk_constraint(schema=schema, kind=ObjectKind.TABLE)
        fks = insp.get_multi_foreign_keys(schema=schema, kind=ObjectKind.TABLE)
        json_columns = _mariadb_json_columns(conn, schema)
        approx = approx_row_counts(conn, schema, table_names)

    tables: dict[str, TableInfo] = {}
    for (_schema, name), cols in columns.items():
        if name not in view_names and name not in table_names:
            continue
        pk = pks.get((_schema, name)) or {}
        tables[name] = TableInfo(
            name=name,
            kind="view" if name in view_names else "table",
            columns=[_column_info(name, c, json_columns, dialect) for c in cols],
            primary_key=list(pk.get("constrained_columns") or []),
            foreign_keys=[],
            approx_rows=approx.get(name),
        )

    # Segunda pasada: las FKs necesitan conocer las columnas de la tabla referenciada.
    lower_index = {n.lower(): t for n, t in tables.items()}
    overrides = managed.config.display_columns
    for (_schema, name), fk_list in fks.items():
        if name not in tables:
            continue
        for fk in fk_list:
            same_schema = fk.get("referred_schema") in (None, schema)
            ref_name = fk["referred_table"]
            ref = (
                (tables.get(ref_name) or lower_index.get(ref_name.lower())) if same_schema else None
            )
            display = choose_display_column(ref, overrides.get(ref.name)) if ref else None
            tables[name].foreign_keys.append(
                ForeignKeyInfo(
                    name=fk.get("name"),
                    columns=list(fk["constrained_columns"]),
                    ref_table=ref.name if ref else ref_name,
                    ref_columns=list(fk["referred_columns"]),
                    display_column=display,
                    # Solo unimos contra la PK: garantiza que el LEFT JOIN no duplica filas.
                    joinable=bool(
                        ref
                        and display
                        and len(fk["constrained_columns"]) == 1
                        and list(fk["referred_columns"]) == ref.primary_key
                    ),
                )
            )

    return SchemaInfo(tables=dict(sorted(tables.items(), key=lambda kv: kv[0].lower())))


def _column_info(
    table: str, col: dict, json_columns: set[tuple[str, str]], dialect: Dialect
) -> ColumnInfo:
    norm, enum_values = normalize_type(col["type"])
    if (table, col["name"]) in json_columns:
        norm = "json"
    return ColumnInfo(
        name=col["name"],
        type=norm,
        raw_type=raw_type_name(col["type"], dialect),
        nullable=bool(col.get("nullable", True)),
        enum_values=enum_values,
        compare_as_text=norm == "enum"
        or (norm == "text" and not isinstance(col["type"], sa_types.String)),
    )


def _mariadb_json_columns(conn: Connection, schema: str | None) -> set[tuple[str, str]]:
    """MariaDB guarda JSON como LONGTEXT + CHECK (json_valid(col)): lo detectamos así."""
    if not getattr(conn.dialect, "is_mariadb", False):
        return set()
    rows = conn.execute(
        text(
            "SELECT TABLE_NAME, CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS "
            "WHERE CONSTRAINT_SCHEMA = COALESCE(:schema, DATABASE())"
        ),
        {"schema": schema},
    )
    found = set()
    for table_name, clause in rows:
        match = _MARIADB_JSON_CHECK.fullmatch(clause or "")
        if match:
            found.add((table_name, match.group(1)))
    return found
