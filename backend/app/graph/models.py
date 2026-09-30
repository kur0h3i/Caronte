from typing import Any, Literal

from pydantic import BaseModel


class GraphTable(BaseModel):
    name: str
    kind: Literal["table", "view"]
    approx_rows: int | None
    primary_key: list[str]
    display_column: str | None
    # Se puede explorar fila a fila (PK de una sola columna).
    explorable: bool
    # Tabla pivote de una relación N:M (su PK son dos FKs): el mapa la "atraviesa".
    junction: bool


class GraphRelation(BaseModel):
    name: str | None
    from_table: str
    from_columns: list[str]
    to_table: str
    to_columns: list[str]


class SchemaGraph(BaseModel):
    tables: list[GraphTable]
    relations: list[GraphRelation]


class NodeRef(BaseModel):
    table: str
    id: Any
    label: Any


class OutgoingLink(NodeRef):
    column: str  # FK de la fila de origen


class IncomingGroup(BaseModel):
    table: str  # tabla de los vecinos
    column: str  # columna FK que apunta a la fila de origen
    via: str | None  # tabla pivote atravesada (N:M), si la hay
    total: int | None  # vecinos en total (items está limitado)
    items: list[NodeRef]


class Neighbors(BaseModel):
    node: NodeRef
    row: dict[str, Any]
    outgoing: list[OutgoingLink]
    incoming: list[IncomingGroup]
