import { createContext } from 'react'
import type { CellValue, FkValue, Row, TableMeta } from '../api/types'

export function isFkValue(value: CellValue): value is FkValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'id' in value
}

// Clases literales para que Tailwind las detecte al compilar.
export const PILL_COLORS = [
  'bg-violet-500/15 text-violet-700 ring-violet-500/35 dark:text-violet-300',
  'bg-fuchsia-500/15 text-fuchsia-700 ring-fuchsia-500/35 dark:text-fuchsia-300',
  'bg-sky-500/15 text-sky-700 ring-sky-500/35 dark:text-sky-300',
  'bg-emerald-500/15 text-emerald-700 ring-emerald-500/35 dark:text-emerald-300',
  'bg-amber-500/15 text-amber-700 ring-amber-500/35 dark:text-amber-300',
  'bg-rose-500/15 text-rose-700 ring-rose-500/35 dark:text-rose-300',
  'bg-indigo-500/15 text-indigo-700 ring-indigo-500/35 dark:text-indigo-300',
  'bg-teal-500/15 text-teal-700 ring-teal-500/35 dark:text-teal-300',
] as const

/** Hash estable: el mismo valor tiene el mismo color en todas las páginas. */
export function colorIndex(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0
  return Math.abs(h) % PILL_COLORS.length
}

export interface ColumnStats {
  /** Máximo |valor| de la página, para las barras proporcionales (0 = sin barra). */
  maxAbs: number
  /** Pocos valores distintos: se pintan como pastillas. */
  pills: boolean
}

export type GridStats = Map<string, ColumnStats>

export const GridStatsContext = createContext<GridStats>(new Map())

const MAX_PILL_VALUES = 12
const MAX_PILL_LENGTH = 30

/**
 * Estadísticas de la página visible. Se calculan en el navegador (sin consultas extra):
 * - números: máximo absoluto para escalar las barras (salvo PKs, FKs y columnas *id).
 * - texto: si hay pocos valores distintos y se repiten, se muestran como pastillas.
 */
export function computeStats(meta: TableMeta, rows: Row[]): GridStats {
  const fkColumns = new Set(meta.foreign_keys.flatMap((fk) => fk.columns))
  const stats: GridStats = new Map()

  for (const col of meta.columns) {
    const isKey =
      meta.primary_key.includes(col.name) || fkColumns.has(col.name) || /id$/i.test(col.name)
    let maxAbs = 0
    let pills = false

    if ((col.type === 'int' || col.type === 'numeric') && !isKey) {
      for (const row of rows) {
        const n = Math.abs(Number(row[col.name]))
        if (Number.isFinite(n) && n > maxAbs) maxAbs = n
      }
    } else if (col.type === 'text' && !fkColumns.has(col.name) && rows.length >= 8) {
      const distinct = new Set<string>()
      let short = true
      for (const row of rows) {
        const v = row[col.name]
        if (v == null) continue
        const s = String(v)
        if (s.length > MAX_PILL_LENGTH) {
          short = false
          break
        }
        distinct.add(s)
        if (distinct.size > MAX_PILL_VALUES) break
      }
      pills =
        short &&
        distinct.size > 0 &&
        distinct.size <= MAX_PILL_VALUES &&
        distinct.size <= rows.length / 3
    }
    stats.set(col.name, { maxAbs, pills })
  }
  return stats
}
