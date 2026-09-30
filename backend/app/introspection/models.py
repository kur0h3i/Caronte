"""Modelo de esquema que usa el resto de la app (y que devuelve la API)."""

from typing import Literal

from pydantic import BaseModel

NormType = Literal["int", "numeric", "text", "bool", "date", "datetime", "json", "enum"]


class ColumnInfo(BaseModel):
    name: str
    type: NormType
    raw_type: str
    nullable: bool
    enum_values: list[str] | None = None


class ForeignKeyInfo(BaseModel):
    name: str | None
    columns: list[str]
    ref_table: str
    ref_columns: list[str]
    # Columna de la tabla referenciada que se muestra como etiqueta de la FK.
    display_column: str | None
    # Si podemos resolver la etiqueta con un LEFT JOIN (FK de una columna hacia la PK).
    joinable: bool


class TableSummary(BaseModel):
    name: str
    kind: Literal["table", "view"]
    approx_rows: int | None
    fk_count: int


class TableInfo(BaseModel):
    name: str
    kind: Literal["table", "view"]
    columns: list[ColumnInfo]
    primary_key: list[str]
    foreign_keys: list[ForeignKeyInfo]
    approx_rows: int | None

    def column(self, name: str) -> ColumnInfo | None:
        return next((c for c in self.columns if c.name == name), None)

    def fk_for_column(self, name: str) -> ForeignKeyInfo | None:
        """FK de una sola columna que sale de `name` (las compuestas no tienen etiqueta)."""
        return next((fk for fk in self.foreign_keys if fk.columns == [name]), None)

    def summary(self) -> TableSummary:
        return TableSummary(
            name=self.name,
            kind=self.kind,
            approx_rows=self.approx_rows,
            fk_count=len(self.foreign_keys),
        )


class SchemaInfo(BaseModel):
    tables: dict[str, TableInfo]
