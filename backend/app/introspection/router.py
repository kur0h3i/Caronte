from fastapi import APIRouter, Depends

from app.introspection.deps import get_schema, get_table
from app.introspection.models import SchemaInfo, TableInfo, TableSummary

router = APIRouter(tags=["introspection"])


@router.get("/connections/{conn_name}/tables", response_model=list[TableSummary])
def list_tables(schema: SchemaInfo = Depends(get_schema)) -> list[TableSummary]:
    return [t.summary() for t in schema.tables.values()]


@router.get("/connections/{conn_name}/tables/{table_name}/meta", response_model=TableInfo)
def table_meta(table: TableInfo = Depends(get_table)) -> TableInfo:
    return table
