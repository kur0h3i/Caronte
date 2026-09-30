// Espejo de los modelos Pydantic del backend (app/*/models.py).

export type NormType = 'int' | 'numeric' | 'text' | 'bool' | 'date' | 'datetime' | 'json' | 'enum'

export interface User {
  username: string
}

export interface Connection {
  name: string
  dialect: 'postgresql' | 'mysql' | 'mariadb' | 'sqlite'
}

export interface TableSummary {
  name: string
  kind: 'table' | 'view'
  approx_rows: number | null
  fk_count: number
}

export interface ColumnInfo {
  name: string
  type: NormType
  raw_type: string
  nullable: boolean
  enum_values: string[] | null
}

export interface ForeignKeyInfo {
  name: string | null
  columns: string[]
  ref_table: string
  ref_columns: string[]
  display_column: string | null
  joinable: boolean
}

export interface TableMeta {
  name: string
  kind: 'table' | 'view'
  columns: ColumnInfo[]
  primary_key: string[]
  foreign_keys: ForeignKeyInfo[]
  approx_rows: number | null
}

export type FilterOp =
  'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains' | 'is_null' | 'not_null'

export interface Filter {
  column: string
  op: FilterOp
  value?: string | number | boolean | null
}

export interface FkValue {
  id: CellValue
  label: CellValue
}

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type CellValue = JsonValue | FkValue

export type Row = Record<string, CellValue>

export interface RowsResponse {
  columns: string[]
  rows: Row[]
  total: number | null
  limit: number
  offset: number
}

export interface RowsParams {
  limit: number
  offset: number
  sort?: string
  filters?: Filter[]
}
