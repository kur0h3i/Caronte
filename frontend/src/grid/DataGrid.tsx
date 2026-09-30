import {
  columnResizingFeature,
  columnSizingFeature,
  createColumnHelper,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type PaginationState,
  type SortingState,
  type Updater,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef } from 'react'
import type { Filter, Row, RowsResponse, TableMeta } from '../api/types'
import { CellValue } from '../cells/CellValue'
import { computeStats, GridStatsContext } from '../cells/values'
import { EmptyState, Spinner } from '../components/feedback'
import { defaultWidth } from './columns'
import { FilterCell } from './FilterCell'
import { HeaderCell } from './HeaderCell'
import { Pagination } from './Pagination'
import type { GridParams } from './params'
import { RowNumber } from './RowNumber'

// Solo registramos las features que usamos. Orden y paginación son "manuales":
// la tabla no reordena ni recorta nada, solo refleja el estado y avisa de cambios;
// quien ordena y pagina es el servidor.
const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnSizingFeature,
  columnResizingFeature,
})
const helper = createColumnHelper<typeof features, Row>()

const EMPTY_ROWS: Row[] = []
const ROW_HEIGHT = 32

function resolve<T>(updater: Updater<T>, current: T): T {
  return typeof updater === 'function' ? (updater as (old: T) => T)(current) : updater
}

interface Props {
  meta: TableMeta
  data: RowsResponse | undefined
  params: GridParams
  onParamsChange: (patch: Partial<GridParams>) => void
  isFetching: boolean
}

export function DataGrid({ meta, data, params, onParamsChange, isFetching }: Props) {
  const fkByColumn = useMemo(
    () =>
      new Map(
        meta.foreign_keys.filter((fk) => fk.columns.length === 1).map((fk) => [fk.columns[0], fk]),
      ),
    [meta],
  )
  const offset = params.page * params.size
  const stats = useMemo(() => computeStats(meta, data?.rows ?? EMPTY_ROWS), [meta, data])

  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: '__rownum',
          header: '#',
          size: 58,
          enableResizing: false,
          enableSorting: false,
          cell: (ctx) =>
            meta.primary_key.length === 1 ? (
              <RowNumber
                n={offset + ctx.row.index + 1}
                table={meta.name}
                pk={ctx.row.original[meta.primary_key[0]]}
              />
            ) : (
              <span className="w-full text-right text-faint tabular-nums">
                {offset + ctx.row.index + 1}
              </span>
            ),
        }),
        ...meta.columns.map((col) =>
          helper.accessor((row) => row[col.name], {
            id: col.name,
            size: defaultWidth(col, fkByColumn.get(col.name)),
            minSize: 60,
            maxSize: 900,
            enableSorting: col.type !== 'json',
            cell: (ctx) => (
              <CellValue value={ctx.getValue()} col={col} fk={fkByColumn.get(col.name)} />
            ),
          }),
        ),
      ]),
    [meta, fkByColumn, offset],
  )

  const sorting = useMemo<SortingState>(
    () =>
      params.sort ? [{ id: params.sort.replace(/^-/, ''), desc: params.sort.startsWith('-') }] : [],
    [params.sort],
  )
  const pagination = useMemo<PaginationState>(
    () => ({ pageIndex: params.page, pageSize: params.size }),
    [params.page, params.size],
  )

  const table = useTable({
    features,
    columns,
    data: data?.rows ?? EMPTY_ROWS,
    state: { sorting, pagination },
    onSortingChange: (updater) => {
      const [first] = resolve(updater, sorting)
      onParamsChange({ sort: first ? `${first.desc ? '-' : ''}${first.id}` : null })
    },
    onPaginationChange: (updater) => {
      const next = resolve(updater, pagination)
      onParamsChange({ page: next.pageIndex, size: next.pageSize })
    },
    manualSorting: true,
    manualPagination: true,
    rowCount: data?.total ?? undefined,
    // Si el recuento superó el timeout no sabemos cuántas páginas hay.
    pageCount: data && data.total == null ? -1 : undefined,
    autoResetPageIndex: false,
    enableMultiSort: false,
    sortDescFirst: false,
    columnResizeMode: 'onChange',
  })

  const rows = table.getRowModel().rows
  const scrollRef = useRef<HTMLDivElement>(null)
  // No usamos React Compiler: el aviso de "librería incompatible" no nos afecta.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  // Al cambiar de página, orden o filtros, volvemos arriba.
  const resultKey = `${meta.name}|${params.page}|${params.size}|${params.sort}|${JSON.stringify(params.filters)}`
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [resultKey])

  function setColumnFilters(column: string, next: Filter[]) {
    onParamsChange({ filters: [...params.filters.filter((f) => f.column !== column), ...next] })
  }

  const pageCount = data?.total == null ? null : Math.max(1, Math.ceil(data.total / params.size))
  const canNext =
    pageCount == null ? (data?.rows.length ?? 0) === params.size : params.page < pageCount - 1

  return (
    <GridStatsContext value={stats}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
          {isFetching && (
            <div className="pointer-events-none sticky top-0 left-0 z-20 h-0.5 w-full overflow-hidden">
              <div className="h-full w-1/3 animate-[caronte-load_1s_ease-in-out_infinite] bg-accent" />
            </div>
          )}
          <table className="grid border-collapse" style={{ width: table.getTotalSize() }}>
            <thead className="sticky top-0 z-10 grid bg-surface shadow-[0_1px_0_var(--c-line)]">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id} className="flex">
                  {group.headers.map((header) => {
                    const col = meta.columns.find((c) => c.name === header.column.id)
                    return (
                      <th
                        key={header.id}
                        className="relative flex h-11 border-r border-line/60 p-0 font-normal"
                        style={{ width: header.getSize() }}
                      >
                        {col ? (
                          <HeaderCell
                            col={col}
                            fk={fkByColumn.get(col.name)}
                            isPk={meta.primary_key.includes(col.name)}
                            sorted={header.column.getIsSorted()}
                            canSort={header.column.getCanSort()}
                            onToggleSort={header.column.getToggleSortingHandler()}
                          />
                        ) : (
                          <span className="flex w-full items-center justify-end px-2 font-mono text-xs text-faint">
                            #
                          </span>
                        )}
                        {header.column.getCanResize() && (
                          <div
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                            onDoubleClick={() => header.column.resetSize()}
                            className={`absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-accent/60 ${
                              header.column.getIsResizing() ? 'bg-accent' : ''
                            }`}
                          />
                        )}
                      </th>
                    )
                  })}
                </tr>
              ))}
              <tr className="flex border-t border-line/60">
                {table.getFlatHeaders().map((header) => {
                  const col = meta.columns.find((c) => c.name === header.column.id)
                  return (
                    <th
                      key={header.id}
                      className="flex border-r border-line/60 px-1 py-1 font-normal"
                      style={{ width: header.getSize() }}
                    >
                      {col && (
                        <FilterCell
                          col={col}
                          isFk={fkByColumn.has(col.name)}
                          filters={params.filters.filter((f) => f.column === col.name)}
                          onChange={(next) => setColumnFilters(col.name, next)}
                        />
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody className="relative grid" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((item) => {
                const row = rows[item.index]
                return (
                  <tr
                    key={row.id}
                    data-index={item.index}
                    className="absolute flex w-full border-b border-line/40 hover:bg-accent/[0.06]"
                    style={{ transform: `translateY(${item.start}px)`, height: ROW_HEIGHT }}
                  >
                    {row.getAllCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="flex items-center overflow-hidden border-r border-line/30 px-2 font-mono text-xs whitespace-nowrap"
                        style={{ width: cell.column.getSize() }}
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>

          {!data && isFetching && (
            <div className="p-6">
              <Spinner />
            </div>
          )}
          {data && data.rows.length === 0 && (
            <div className="h-48">
              <EmptyState title="Sin filas">
                {params.filters.length
                  ? 'Ninguna fila cumple los filtros.'
                  : 'La tabla está vacía.'}
              </EmptyState>
            </div>
          )}
        </div>

        <Pagination
          page={params.page}
          size={params.size}
          total={data?.total}
          rowsOnPage={data?.rows.length ?? 0}
          pageCount={pageCount}
          canPrev={params.page > 0}
          canNext={canNext}
          onPage={(page) => table.setPageIndex(page)}
          onSize={(size) => table.setPageSize(size)}
        />
      </div>
    </GridStatsContext>
  )
}
