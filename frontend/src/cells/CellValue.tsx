import { use } from 'react'
import type { CellValue as Value, ColumnInfo, ForeignKeyInfo, JsonValue } from '../api/types'
import { BoolCell, NullCell, NumberCell, Pill, TextCell } from './basic'
import { DateCell } from './DateCell'
import { FkCell } from './FkCell'
import { JsonCell } from './JsonCell'
import { colorIndex, GridStatsContext, isFkValue } from './values'

interface Props {
  value: Value
  col: ColumnInfo
  fk?: ForeignKeyInfo
}

/** Elige cómo pintar una celda según el tipo normalizado de la columna. */
export function CellValue({ value, col, fk }: Props) {
  const stats = use(GridStatsContext).get(col.name)

  if (value === null || value === undefined) return <NullCell />
  if (fk && isFkValue(value)) return <FkCell value={value} fk={fk} />

  switch (col.type) {
    case 'bool':
      return typeof value === 'boolean' ? (
        <BoolCell value={value} />
      ) : (
        <TextCell text={String(value)} />
      )
    case 'int':
    case 'numeric':
      return <NumberCell value={value as number | string} maxAbs={stats?.maxAbs ?? 0} />
    case 'enum': {
      const text = String(value)
      const index = col.enum_values?.indexOf(text) ?? -1
      return <Pill text={text} color={index >= 0 ? index % 8 : colorIndex(text)} />
    }
    case 'date':
    case 'datetime':
      return <DateCell value={String(value)} dateOnly={col.type === 'date'} />
    case 'json':
      return <JsonCell value={value as JsonValue} />
    default: {
      const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
      if (stats?.pills) return <Pill text={text} color={colorIndex(text)} />
      return <TextCell text={text} />
    }
  }
}
