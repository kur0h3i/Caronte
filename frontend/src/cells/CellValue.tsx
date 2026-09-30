import type { CellValue as Value, ColumnInfo, ForeignKeyInfo } from '../api/types'
import { isFkValue } from './values'

interface Props {
  value: Value
  col: ColumnInfo
  fk?: ForeignKeyInfo
}

export function CellValue({ value, fk }: Props) {
  if (value === null || value === undefined) {
    return <span className="text-faint italic">NULL</span>
  }
  if (fk && isFkValue(value)) {
    return (
      <span className="truncate">
        {value.label != null && String(value.label)}{' '}
        <span className="text-faint">#{String(value.id)}</span>
      </span>
    )
  }
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return (
    <span className="truncate" title={text.length > 30 ? text : undefined}>
      {text}
    </span>
  )
}
