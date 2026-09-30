import type { CellValue, FkValue } from '../api/types'

export function isFkValue(value: CellValue): value is FkValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'id' in value
}
