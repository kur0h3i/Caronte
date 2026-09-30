import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { Filter, FilterOp } from '../api/types'

/**
 * El estado del grid (orden, filtros, página y tamaño) vive en la URL:
 *   /c/chinook/t/track?sort=-milliseconds&filters=[...]&page=2&size=250
 * Así funcionan el botón "atrás", recargar la página y los enlaces de FK sin estado extra.
 */
export interface GridParams {
  sort: string | null
  filters: Filter[]
  page: number // 0-based (en la URL va 1-based)
  size: number
}

export const PAGE_SIZES = [50, 100, 250, 500] as const
export const DEFAULT_PAGE_SIZE = 100

const OPS: FilterOp[] = ['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'contains', 'is_null', 'not_null']

function parseFilters(raw: string | null): Filter[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (f): f is Filter =>
        typeof f === 'object' &&
        f !== null &&
        typeof f.column === 'string' &&
        OPS.includes(f.op as FilterOp),
    )
  } catch {
    return []
  }
}

export function readGridParams(sp: URLSearchParams): GridParams {
  const size = Number(sp.get('size'))
  const page = Number(sp.get('page'))
  return {
    sort: sp.get('sort') || null,
    filters: parseFilters(sp.get('filters')),
    page: Number.isInteger(page) && page > 1 ? page - 1 : 0,
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
  }
}

export function writeGridParams(params: GridParams): URLSearchParams {
  const sp = new URLSearchParams()
  if (params.sort) sp.set('sort', params.sort)
  if (params.filters.length) sp.set('filters', JSON.stringify(params.filters))
  if (params.page > 0) sp.set('page', String(params.page + 1))
  if (params.size !== DEFAULT_PAGE_SIZE) sp.set('size', String(params.size))
  return sp
}

export function useGridParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const params = useMemo(() => readGridParams(searchParams), [searchParams])

  const update = useCallback(
    (patch: Partial<GridParams>) => {
      setSearchParams(
        (prev) => {
          const next = { ...readGridParams(prev), ...patch }
          // Cambiar orden, filtros o tamaño vuelve a la primera página.
          if (!('page' in patch)) next.page = 0
          return writeGridParams(next)
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  return [params, update] as const
}

/** Enlace a una tabla con filtros aplicados (lo usan las FK clicables). */
export function tableHref(conn: string, table: string, filters: Filter[] = []): string {
  const base = `/c/${encodeURIComponent(conn)}/t/${encodeURIComponent(table)}`
  if (!filters.length) return base
  return `${base}?${writeGridParams({ sort: null, filters, page: 0, size: DEFAULT_PAGE_SIZE })}`
}
