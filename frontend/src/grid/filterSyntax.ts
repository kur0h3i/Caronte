import type { ColumnInfo, Filter, FilterOp } from '../api/types'

/**
 * Mini-sintaxis de la fila de filtros. Cada input produce una lista de filtros:
 *
 *   texto          rock          -> contains
 *                  =Rock         -> eq          !=Rock -> ne
 *   números/fechas 5 | =5        -> eq          >5  >=5  <5  <=5  !=5
 *                  10..20        -> gte 10 y lte 20
 *   fecha-hora     2024-03-01    -> todo ese día (gte 00:00 y lt día siguiente)
 *   FK             zeppelin      -> contains sobre la etiqueta     #12 -> id = 12
 *   cualquiera     null / !null  -> is_null / not_null
 */

export type ParseResult = Filter[] | 'invalid'

const INT = /^-?\d+$/
const NUM = /^-?\d+(\.\d+)?$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const DATETIME = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/
const COMPARISON = /^(>=|<=|!=|=|>|<)\s*(.+)$/
const RANGE = /^(.+?)\s*\.\.\s*(.+)$/

function valid(col: ColumnInfo, value: string): boolean {
  switch (col.type) {
    case 'int':
      return INT.test(value)
    case 'numeric':
      return NUM.test(value)
    case 'date':
      return DATE.test(value)
    case 'datetime':
      return DATETIME.test(value) && !Number.isNaN(Date.parse(value.replace(' ', 'T')))
    default:
      return true
  }
}

function nextDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

const SYMBOL_TO_OP: Record<string, FilterOp> = {
  '=': 'eq',
  '!=': 'ne',
  '>': 'gt',
  '>=': 'gte',
  '<': 'lt',
  '<=': 'lte',
}

export function parseFilterInput(col: ColumnInfo, isFk: boolean, raw: string): ParseResult {
  const column = col.name
  const text = raw.trim()
  if (!text) return []
  if (text.toLowerCase() === 'null') return [{ column, op: 'is_null' }]
  if (text.toLowerCase() === '!null') return [{ column, op: 'not_null' }]

  if (isFk) {
    const id = /^#\s*(.+)$/.exec(text)
    if (id) return valid(col, id[1]) ? [{ column, op: 'eq', value: id[1] }] : 'invalid'
    return [{ column, op: 'contains', value: text }]
  }

  if (col.type === 'text' || col.type === 'json' || col.type === 'enum' || col.type === 'bool') {
    if (col.type !== 'json') {
      if (text.startsWith('!=')) return [{ column, op: 'ne', value: text.slice(2) }]
      if (text.startsWith('=')) return [{ column, op: 'eq', value: text.slice(1) }]
    }
    return [{ column, op: 'contains', value: text }]
  }

  // int, numeric, date, datetime
  const range = RANGE.exec(text)
  if (range) {
    const [, from, to] = range
    if (!valid(col, from) || !valid(col, to)) return 'invalid'
    return [
      { column, op: 'gte', value: from },
      { column, op: 'lte', value: to },
    ]
  }
  const comparison = COMPARISON.exec(text)
  if (comparison) {
    const [, symbol, value] = comparison
    return valid(col, value) ? [{ column, op: SYMBOL_TO_OP[symbol], value }] : 'invalid'
  }
  if (!valid(col, text)) return 'invalid'
  if (col.type === 'datetime' && DATE.test(text)) {
    return [
      { column, op: 'gte', value: text },
      { column, op: 'lt', value: nextDay(text) },
    ]
  }
  return [{ column, op: 'eq', value: text }]
}

const OP_TO_SYMBOL: Partial<Record<FilterOp, string>> = {
  ne: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
}

/** Inverso aproximado: texto que se muestra en el input para filtros llegados por URL. */
export function filtersToInput(col: ColumnInfo, isFk: boolean, filters: Filter[]): string {
  if (!filters.length) return ''
  const [a, b] = filters
  if (filters.length === 2 && a.op === 'gte' && b.op === 'lte') return `${a.value}..${b.value}`
  if (
    filters.length === 2 &&
    a.op === 'gte' &&
    b.op === 'lt' &&
    nextDay(String(a.value)) === b.value
  )
    return String(a.value)
  if (filters.length > 1) return filters.map((f) => filterToText(col, isFk, f)).join(' ')
  return filterToText(col, isFk, a)
}

function filterToText(col: ColumnInfo, isFk: boolean, f: Filter): string {
  if (f.op === 'is_null') return 'null'
  if (f.op === 'not_null') return '!null'
  if (f.op === 'contains') return String(f.value ?? '')
  if (f.op === 'eq') {
    if (isFk) return `#${f.value}`
    return col.type === 'text' ? `=${f.value}` : String(f.value)
  }
  return `${OP_TO_SYMBOL[f.op]}${f.value}`
}

const OP_LABEL: Record<FilterOp, string> = {
  eq: '=',
  ne: '≠',
  lt: '<',
  lte: '≤',
  gt: '>',
  gte: '≥',
  contains: '∋',
  is_null: 'es null',
  not_null: 'no es null',
}

/** Texto corto para las "chips" de filtros activos. */
export function describeFilter(f: Filter): string {
  if (f.op === 'is_null' || f.op === 'not_null') return `${f.column} ${OP_LABEL[f.op]}`
  return `${f.column} ${OP_LABEL[f.op]} ${String(f.value)}`
}
