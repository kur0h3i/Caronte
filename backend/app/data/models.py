from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

FilterOp = Literal["eq", "ne", "lt", "lte", "gt", "gte", "contains", "is_null", "not_null"]


class Filter(BaseModel):
    """Un filtro simple sobre una columna. El valor viaja siempre como parámetro enlazado."""

    model_config = ConfigDict(extra="forbid")

    column: str = Field(max_length=256)
    op: FilterOp
    value: str | int | float | bool | None = Field(default=None)


class RowsResponse(BaseModel):
    columns: list[str]
    # Cada FK de una columna llega como {"id": ..., "label": ...}.
    rows: list[dict[str, Any]]
    # Total con los filtros aplicados; null si el recuento superó el timeout.
    total: int | None
    limit: int
    offset: int
