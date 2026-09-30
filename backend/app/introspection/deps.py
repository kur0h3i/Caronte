from fastapi import Depends, Request

from app.connections.deps import get_connection
from app.connections.errors import translate_db_errors
from app.connections.registry import ManagedConnection
from app.introspection.models import SchemaInfo, TableInfo
from app.security.identifiers import resolve_table


def get_schema(request: Request, conn: ManagedConnection = Depends(get_connection)) -> SchemaInfo:
    with translate_db_errors(conn.name, conn.statement_timeout):
        return request.app.state.schema_cache.get(conn)


def get_table(table_name: str, schema: SchemaInfo = Depends(get_schema)) -> TableInfo:
    return resolve_table(schema, table_name)
