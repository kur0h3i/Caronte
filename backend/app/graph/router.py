from fastapi import APIRouter, Depends, Query

from app.connections.deps import get_connection
from app.connections.registry import ManagedConnection
from app.graph.models import Neighbors, SchemaGraph
from app.graph.service import neighbors, schema_graph
from app.introspection.deps import get_schema, get_table
from app.introspection.models import SchemaInfo, TableInfo

router = APIRouter(tags=["graph"])


@router.get("/connections/{conn_name}/graph", response_model=SchemaGraph)
def connection_graph(
    conn: ManagedConnection = Depends(get_connection),
    schema: SchemaInfo = Depends(get_schema),
) -> SchemaGraph:
    """Tablas (nodos) y FKs (aristas) de la conexión."""
    return schema_graph(schema, conn.config.display_columns)


@router.get("/connections/{conn_name}/tables/{table_name}/neighbors", response_model=Neighbors)
def row_neighbors(
    row_id: str = Query(alias="id", max_length=200, description="Valor de la PK de la fila"),
    limit: int = Query(12, ge=1, le=50, description="Vecinos máximos por relación"),
    conn: ManagedConnection = Depends(get_connection),
    schema: SchemaInfo = Depends(get_schema),
    table: TableInfo = Depends(get_table),
) -> Neighbors:
    """La fila, las filas a las que apunta (FKs) y las que la referencian."""
    return neighbors(conn, schema, table, row_id, limit)
