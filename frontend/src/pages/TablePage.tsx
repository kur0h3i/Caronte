import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useParams } from 'react-router'
import { useRows, useTableMeta } from '../api/hooks'
import type { Filter, RowsParams, TableMeta } from '../api/types'
import { ErrorBox, Spinner } from '../components/feedback'
import { CloseIcon, FilterIcon, RefreshIcon, TableIcon, ViewIcon } from '../components/icons'
import { DataGrid } from '../grid/DataGrid'
import { describeFilter } from '../grid/filterSyntax'
import { useGridParams } from '../grid/params'
import { formatInt } from '../lib/format'

export function TablePage() {
  const { conn = '', table = '' } = useParams()
  const [params, setParams] = useGridParams()
  const meta = useTableMeta(conn, table)
  const rowsParams = useMemo<RowsParams>(
    () => ({
      limit: params.size,
      offset: params.page * params.size,
      sort: params.sort ?? undefined,
      filters: params.filters,
    }),
    [params],
  )
  const rows = useRows(conn, table, rowsParams)
  const queryClient = useQueryClient()

  if (meta.isPending) {
    return (
      <div className="p-4">
        <Spinner />
      </div>
    )
  }
  if (meta.isError) {
    return (
      <div className="p-4">
        <ErrorBox error={meta.error} />
      </div>
    )
  }

  return (
    <>
      <Toolbar
        meta={meta.data}
        total={rows.data?.total}
        filters={params.filters}
        onRemoveFilter={(index) =>
          setParams({ filters: params.filters.filter((_, i) => i !== index) })
        }
        onClearFilters={() => setParams({ filters: [] })}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ['rows', conn, table] })}
      />
      {rows.isError && (
        <div className="flex items-start gap-3 border-b border-line p-3">
          <ErrorBox error={rows.error} />
          <button
            type="button"
            className="shrink-0 rounded border border-line px-2 py-1 font-mono text-xs text-muted hover:border-accent hover:text-accent-soft"
            onClick={() => setParams({ filters: [], sort: null })}
          >
            restablecer vista
          </button>
        </div>
      )}
      <DataGrid
        key={`${conn}/${table}`}
        meta={meta.data}
        data={rows.isError ? undefined : rows.data}
        params={params}
        onParamsChange={setParams}
        isFetching={rows.isFetching}
      />
    </>
  )
}

interface ToolbarProps {
  meta: TableMeta
  total: number | null | undefined
  filters: Filter[]
  onRemoveFilter: (index: number) => void
  onClearFilters: () => void
  onRefresh: () => void
}

function Toolbar({
  meta,
  total,
  filters,
  onRemoveFilter,
  onClearFilters,
  onRefresh,
}: ToolbarProps) {
  const KindIcon = meta.kind === 'view' ? ViewIcon : TableIcon
  return (
    <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface/60 px-4 py-2">
      <h2 className="flex items-center gap-2 font-mono text-base font-semibold">
        <KindIcon className="text-accent" />
        {meta.name}
      </h2>
      <span className="font-mono text-xs text-faint">
        {filters.length ? formatInt(total) : `~${formatInt(total ?? meta.approx_rows)}`} filas ·{' '}
        {meta.columns.length} columnas
        {meta.foreign_keys.length > 0 && ` · ${meta.foreign_keys.length} FK`}
      </span>

      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterIcon className="text-accent" width={14} height={14} />
          {filters.map((f, i) => (
            <span
              key={`${f.column}-${f.op}-${i}`}
              className="flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 py-0.5 pr-1 pl-2.5 font-mono text-[11px] text-accent-soft"
            >
              {describeFilter(f)}
              <button
                type="button"
                aria-label={`Quitar filtro ${describeFilter(f)}`}
                className="rounded-full p-0.5 hover:bg-accent/25"
                onClick={() => onRemoveFilter(i)}
              >
                <CloseIcon width={11} height={11} />
              </button>
            </span>
          ))}
          <button
            type="button"
            className="font-mono text-[11px] text-muted underline-offset-2 hover:text-accent-soft hover:underline"
            onClick={onClearFilters}
          >
            limpiar
          </button>
        </div>
      )}

      <button
        type="button"
        title="Recargar filas"
        className="ml-auto rounded-md p-1.5 text-muted transition hover:bg-raised hover:text-accent-soft"
        onClick={onRefresh}
      >
        <RefreshIcon />
      </button>
    </div>
  )
}
