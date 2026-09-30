from fastapi import APIRouter, Depends, Query, Request

from app.config import MAX_LIMIT
from app.connections.deps import get_connection
from app.connections.registry import ManagedConnection
from app.data.filters import parse_filters
from app.data.models import RowsResponse
from app.data.query import fetch_rows
from app.introspection.deps import get_schema, get_table
from app.introspection.models import SchemaInfo, TableInfo

router = APIRouter(tags=["data"])


@router.get("/connections/{conn_name}/tables/{table_name}/rows", response_model=RowsResponse)
def table_rows(
    request: Request,
    limit: int | None = Query(None, ge=1, le=MAX_LIMIT, description=f"Máximo {MAX_LIMIT}"),
    offset: int = Query(0, ge=0, le=10**12),
    sort: str | None = Query(
        None, max_length=300, description="Columna por la que ordenar; prefijo '-' = descendente"
    ),
    filters: str | None = Query(
        None,
        max_length=20_000,
        description='JSON: [{"column": "Name", "op": "contains", "value": "rock"}]. '
        "Operadores: eq, ne, lt, lte, gt, gte, contains, is_null, not_null.",
    ),
    conn: ManagedConnection = Depends(get_connection),
    schema: SchemaInfo = Depends(get_schema),
    table: TableInfo = Depends(get_table),
) -> RowsResponse:
    return fetch_rows(
        conn,
        schema,
        table,
        filters=parse_filters(filters),
        sort=sort,
        limit=limit or request.app.state.settings.default_limit,
        offset=offset,
    )
