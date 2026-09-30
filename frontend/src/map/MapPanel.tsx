import { Link } from 'react-router'
import type { CellValue, SchemaGraph } from '../api/types'
import { isFkValue } from '../cells/values'
import { Spinner } from '../components/feedback'
import { CloseIcon, LinkIcon, TableIcon } from '../components/icons'
import { tableHref } from '../grid/params'
import { formatInt } from '../lib/format'
import { useTheme } from '../theme/theme'
import { type MapModel, type NodeData, rowNodeId, tableNodeId } from './model'
import { tableColor } from './palette'

interface Props {
  conn: string
  node: NodeData
  model: MapModel
  graph: SchemaGraph
  busy: boolean
  onClose: () => void
  onSelect: (id: string) => void
  onSeed: (table: string) => void
  onExpand: (id: string) => void
}

const button =
  'rounded-md border border-line px-2.5 py-1.5 font-mono text-xs text-muted transition hover:border-accent hover:text-accent-soft disabled:opacity-50'

function cellText(value: CellValue | undefined): string {
  if (value === null || value === undefined) return '∅'
  if (isFkValue(value)) return `${value.label ?? ''} #${value.id}`.trim()
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

export function MapPanel({
  conn,
  node,
  model,
  graph,
  busy,
  onClose,
  onSelect,
  onSeed,
  onExpand,
}: Props) {
  const { theme } = useTheme()
  const color = tableColor(theme, node.colorIndex)
  const info = model.tables.get(node.table)

  return (
    <aside className="absolute top-3 right-3 bottom-3 z-10 flex w-80 flex-col overflow-hidden rounded-xl border border-line bg-surface/90 shadow-[0_0_40px_-12px_var(--c-accent)] backdrop-blur">
      <header className="flex items-start gap-2 border-b border-line p-3">
        <span
          className="mt-1 size-3 shrink-0 rounded-full"
          style={{ background: color, boxShadow: `0 0 10px ${color}` }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-semibold" title={node.label}>
            {node.kind === 'table' ? node.table : node.label}
          </p>
          <p className="truncate font-mono text-[11px] text-faint">
            {node.kind === 'table'
              ? `${info?.kind === 'view' ? 'vista' : info?.junction ? 'tabla pivote (N:M)' : 'tabla'} · ~${formatInt(info?.approx_rows)} filas`
              : `${node.table} #${node.rowId}`}
          </p>
        </div>
        <button
          type="button"
          aria-label="Cerrar panel"
          className="rounded p-1 text-muted hover:bg-raised hover:text-fg"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 font-mono text-xs">
        {node.kind === 'table' ? (
          <TableDetails node={node} model={model} graph={graph} onSelect={onSelect} />
        ) : (
          <RowDetails node={node} model={model} onSelect={onSelect} />
        )}
      </div>

      <footer className="flex flex-wrap gap-2 border-t border-line p-3">
        {busy && <Spinner label="consultando…" />}
        {!busy && node.kind === 'table' && info?.explorable && (
          <button type="button" className={button} onClick={() => onSeed(node.table)}>
            {model.seeded.get(node.table) ? 'más filas' : 'sembrar filas'}
          </button>
        )}
        {!busy && node.kind === 'row' && !node.expanded && (
          <button type="button" className={button} onClick={() => onExpand(node.id)}>
            desplegar relaciones
          </button>
        )}
        <Link
          className={button}
          to={
            node.kind === 'row' && info?.primary_key[0]
              ? tableHref(conn, node.table, [
                  { column: info.primary_key[0], op: 'eq', value: node.rowId },
                ])
              : tableHref(conn, node.table)
          }
        >
          abrir en la tabla →
        </Link>
      </footer>
    </aside>
  )
}

function TableDetails(props: {
  node: NodeData
  model: MapModel
  graph: SchemaGraph
  onSelect: (id: string) => void
}) {
  const { node, model, graph, onSelect } = props
  const outgoing = graph.relations.filter((r) => r.from_table === node.table)
  const incoming = graph.relations.filter((r) => r.to_table === node.table)
  const info = model.tables.get(node.table)

  return (
    <>
      {info?.display_column && (
        <p className="text-muted">
          etiqueta: <span className="text-fg">{info.display_column}</span>
        </p>
      )}
      <RelationList
        title="apunta a"
        items={outgoing.map((r) => ({
          key: r.name ?? r.from_columns[0],
          table: r.to_table,
          via: r.from_columns.join(', '),
        }))}
        onSelect={(t) => onSelect(tableNodeId(t))}
      />
      <RelationList
        title="referenciada por"
        items={incoming.map((r) => ({
          key: `${r.from_table}.${r.from_columns[0]}`,
          table: r.from_table,
          via: r.from_columns.join(', '),
        }))}
        onSelect={(t) => onSelect(tableNodeId(t))}
      />
      {!info?.explorable && (
        <p className="rounded-md border border-dashed border-line p-2 text-faint">
          {info?.junction
            ? 'Tabla pivote: el mapa la atraviesa y enlaza directamente las filas de las tablas que une.'
            : 'Sin PK de una sola columna: no se puede explorar fila a fila.'}
        </p>
      )}
      <p className="text-faint">Doble clic en la tabla del mapa también siembra filas.</p>
    </>
  )
}

function RelationList(props: {
  title: string
  items: { key: string; table: string; via: string }[]
  onSelect: (table: string) => void
}) {
  if (!props.items.length) return null
  return (
    <section>
      <h4 className="mb-1.5 text-[11px] tracking-wide text-faint uppercase">{props.title}</h4>
      <ul className="space-y-1">
        {props.items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-raised hover:text-accent-soft"
              onClick={() => props.onSelect(item.table)}
            >
              <TableIcon width={12} height={12} className="shrink-0 text-faint" />
              <span className="truncate">{item.table}</span>
              <span className="ml-auto shrink-0 text-faint">{item.via}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function RowDetails(props: { node: NodeData; model: MapModel; onSelect: (id: string) => void }) {
  const { node, model, onSelect } = props
  const row = model.rows.get(node.id)
  const neighbors = model.neighbors.get(node.id)

  return (
    <>
      {neighbors && (
        <section className="space-y-1">
          <h4 className="mb-1.5 text-[11px] tracking-wide text-faint uppercase">relaciones</h4>
          {neighbors.outgoing.map((o) => (
            <button
              key={`o-${o.column}`}
              type="button"
              className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-raised hover:text-accent-soft"
              onClick={() => onSelect(rowNodeId(o.table, o.id))}
            >
              <LinkIcon width={12} height={12} className="shrink-0 text-accent" />
              <span className="truncate">{cellText(o.label)}</span>
              <span className="ml-auto shrink-0 text-faint">→ {o.table}</span>
            </button>
          ))}
          {neighbors.incoming.map((g) => (
            <div
              key={`i-${g.table}-${g.column}-${g.via}`}
              className="flex items-center gap-1.5 px-1.5 py-1 text-muted"
            >
              <span className="text-accent">←</span>
              <span className="truncate">
                {g.table}
                {g.via && <span className="text-faint"> vía {g.via}</span>}
              </span>
              <span className="ml-auto shrink-0 text-faint">
                {g.items.length}
                {g.total != null && g.total > g.items.length ? ` de ${formatInt(g.total)}` : ''}
              </span>
            </div>
          ))}
          {!neighbors.outgoing.length && !neighbors.incoming.length && (
            <p className="text-faint">Fila aislada: sin relaciones.</p>
          )}
        </section>
      )}

      {row ? (
        <section>
          <h4 className="mb-1.5 text-[11px] tracking-wide text-faint uppercase">campos</h4>
          <dl className="space-y-1">
            {Object.entries(row).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[minmax(0,40%)_1fr] gap-2">
                <dt className="truncate text-faint" title={key}>
                  {key}
                </dt>
                <dd
                  className={`truncate ${value == null ? 'text-faint italic' : 'text-fg'}`}
                  title={cellText(value)}
                >
                  {cellText(value)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : (
        <p className="text-faint">Despliega la fila para ver sus campos y relaciones.</p>
      )}
    </>
  )
}
