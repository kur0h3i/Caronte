import type { ColumnInfo, ForeignKeyInfo } from '../api/types'

const WIDTH_BY_TYPE: Record<ColumnInfo['type'], number> = {
  int: 100,
  numeric: 130,
  bool: 90,
  date: 130,
  datetime: 170,
  enum: 130,
  json: 240,
  text: 220,
}

/** Ancho inicial de una columna (luego el usuario puede redimensionarla). */
export function defaultWidth(col: ColumnInfo, fk: ForeignKeyInfo | undefined): number {
  const byType = fk ? 210 : WIDTH_BY_TYPE[col.type]
  const forHeader = col.name.length * 8 + 44
  return Math.min(Math.max(byType, forHeader), 340)
}
