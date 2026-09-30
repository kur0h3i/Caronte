import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { api } from '../api/client'
import { keys } from '../api/keys'
import { ErrorBox, Spinner } from '../components/feedback'
import { CloseIcon, RefreshIcon, SearchIcon } from '../components/icons'
import { MapEngine, type SimNode } from '../map/engine'
import { MapPanel } from '../map/MapPanel'
import { MapModel, tableNodeId } from '../map/model'
import { readMapColors, tableColor } from '../map/palette'
import { useTheme } from '../theme/theme'

const SEED_ROWS = 12
const PER_TABLE_OPTIONS = [12, 50, 100, 250, 500] as const
const ALL_KEY = 'caronte-estigia-todas'
const PER_TABLE_KEY = 'caronte-estigia-por-tabla'
const SEED_CONCURRENCY = 4

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function savePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // almacenamiento bloqueado: la preferencia no se recordará
  }
}

/**
 * Estigia: mapa de datos al estilo del grafo de Obsidian.
 * Las tablas son astros unidos por sus FKs; las filas brotan a su alrededor al sembrarlas
 * o al desplegar las relaciones de otra fila, y así se puede "seguir el hilo" por la BD.
 */
export default function EstigiaPage() {
  const { conn = '' } = useParams()
  const [searchParams] = useSearchParams()
  const { theme } = useTheme()
  const queryClient = useQueryClient()
  const graph = useQuery({ queryKey: ['graph', conn], queryFn: () => api.graph(conn) })

  const [model] = useState(() => new MapModel())
  const version = useSyncExternalStore(model.subscribe, model.getVersion)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [particles, setParticles] = useState(true)
  const [search, setSearch] = useState('')
  const [allRows, setAllRows] = useState(() => readPref(ALL_KEY) === '1')
  const [perTable, setPerTable] = useState<number>(() => {
    const n = Number(readPref(PER_TABLE_KEY))
    return (PER_TABLE_OPTIONS as readonly number[]).includes(n) ? n : 50
  })
  const [seeding, setSeeding] = useState<{ done: number; total: number } | null>(null)
  const seedRun = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<MapEngine | null>(null)

  /**
   * Siembra `limit` filas de cada tabla. Las pivote (N:M) no se pintan: sus filas solo unen
   * los dos extremos. Las FKs entre filas sembradas se convierten en hilos del mapa.
   */
  async function seedAll(limit: number) {
    const run = ++seedRun.current
    model.clearRows()
    const all = [...model.tables.values()].filter((t) => t.kind === 'table')
    const queue = [...all.filter((t) => t.explorable), ...all.filter((t) => t.junction)]
    const failed: string[] = []
    setSeeding({ done: 0, total: queue.length })
    let next = 0
    const worker = async () => {
      while (next < queue.length) {
        const table = queue[next++]
        const params = { limit, offset: 0 }
        try {
          const page = await queryClient.fetchQuery({
            queryKey: keys.rows(conn, table.name, params),
            queryFn: () => api.rows(conn, table.name, params),
          })
          if (run !== seedRun.current) return
          if (table.junction) model.linkJunctionRows(table.name, page.rows)
          else model.seedRows(table.name, page.rows)
        } catch {
          failed.push(table.name)
        }
        if (run === seedRun.current) setSeeding((s) => s && { ...s, done: s.done + 1 })
      }
    }
    await Promise.all(Array.from({ length: SEED_CONCURRENCY }, worker))
    if (run !== seedRun.current) return
    setSeeding(null)
    if (failed.length) setError(`No se pudieron sembrar: ${failed.join(', ')}`)
    setTimeout(() => engineRef.current?.fit(), 900)
  }

  function toggleAllRows() {
    const next = !allRows
    setAllRows(next)
    savePref(ALL_KEY, next ? '1' : '0')
    if (next) void seedAll(perTable)
    else {
      seedRun.current++
      setSeeding(null)
      model.clearRows()
    }
  }

  function changePerTable(n: number) {
    setPerTable(n)
    savePref(PER_TABLE_KEY, String(n))
    if (allRows) void seedAll(n)
  }

  async function seedTable(table: string) {
    const info = model.tables.get(table)
    if (!info?.explorable) {
      setError(
        info?.junction
          ? `${table} es una tabla pivote: se recorre desplegando las filas que une.`
          : `${table} no tiene una PK de una sola columna: no se puede explorar fila a fila.`,
      )
      return
    }
    const params = { limit: SEED_ROWS, offset: model.seeded.get(table) ?? 0 }
    setBusyId(tableNodeId(table))
    try {
      const page = await queryClient.fetchQuery({
        queryKey: keys.rows(conn, table, params),
        queryFn: () => api.rows(conn, table, params),
      })
      model.seedRows(table, page.rows)
      if (!page.rows.length) setError(`No hay más filas en ${table}.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  async function expandRow(id: string) {
    const node = model.nodes.get(id)
    if (!node || node.kind !== 'row' || node.rowId === undefined) return
    if (node.expanded) {
      engineRef.current?.centerOn(id)
      return
    }
    setBusyId(id)
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ['neighbors', conn, node.table, node.rowId],
        queryFn: () => api.neighbors(conn, node.table, node.rowId!),
        staleTime: 60_000,
      })
      model.applyNeighbors(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  function select(id: string | null) {
    setSelectedId(id)
    if (id) engineRef.current?.centerOn(id, 0.9)
  }

  // El motor se crea una vez; sus eventos llaman siempre a la versión actual de los handlers.
  const onSelect = useEffectEvent((node: SimNode | null) => setSelectedId(node?.id ?? null))
  const onActivate = useEffectEvent((node: SimNode) => {
    if (node.kind === 'table') void seedTable(node.table)
    else void expandRow(node.id)
  })
  useEffect(() => {
    const dark = document.documentElement.classList.contains('dark')
    const engine = new MapEngine(
      canvasRef.current!,
      { select: (n) => onSelect(n), activate: (n) => onActivate(n) },
      readMapColors(dark ? 'dark' : 'light'),
    )
    engineRef.current = engine
    return () => {
      engine.destroy()
      engineRef.current = null
    }
  }, [])

  // Esquema cargado -> esqueleto de tablas. Con ?table=&id= se abre directamente esa fila.
  const focusTable = searchParams.get('table')
  const focusId = searchParams.get('id')
  // Con "todas las filas" activado, el mapa se despliega entero al abrirlo.
  const autoSeed = useEffectEvent(() => {
    if (allRows) void seedAll(perTable)
  })
  useEffect(() => {
    if (!graph.data) return
    model.loadSchema(graph.data)
    if (!focusTable || !focusId || !model.tables.get(focusTable)?.explorable) {
      queueMicrotask(() => autoSeed())
      return
    }
    let cancelled = false
    queryClient
      .fetchQuery({
        queryKey: ['neighbors', conn, focusTable, focusId],
        queryFn: () => api.neighbors(conn, focusTable, focusId),
        staleTime: 60_000,
      })
      .then(
        (data) => {
          if (cancelled) return
          const nodeId = model.applyNeighbors(data)
          setSelectedId(nodeId)
          setTimeout(() => engineRef.current?.centerOn(nodeId, 1.2), 500)
        },
        (e: Error) => !cancelled && setError(e.message),
      )
    return () => {
      cancelled = true
    }
  }, [graph.data, model, conn, focusTable, focusId, queryClient])

  useEffect(() => {
    engineRef.current?.setData(model.nodeList(), model.linkList())
  }, [version, model])
  useEffect(() => engineRef.current?.setColors(readMapColors(theme)), [theme])
  useEffect(() => engineRef.current?.setParticles(particles), [particles])
  useEffect(() => engineRef.current?.setSelected(selectedId), [selectedId])

  const matches = useMemo(() => {
    void version
    const needle = search.trim().toLowerCase()
    if (!needle) return []
    // Primero la coincidencia exacta, luego las que empiezan igual, luego el resto.
    const rank = (label: string) =>
      label === needle ? 0 : label.startsWith(needle) ? 1 : label.includes(needle) ? 2 : 3
    return model
      .nodeList()
      .map((n) => ({ n, r: rank(n.label.toLowerCase()) }))
      .filter(({ r }) => r < 3)
      .sort((a, b) => a.r - b.r || Number(a.n.kind === 'row') - Number(b.n.kind === 'row'))
      .slice(0, 8)
      .map(({ n }) => n)
  }, [search, model, version])

  const legend = useMemo(() => {
    void version
    return [...model.tables.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [model, version])

  const selected = selectedId ? model.nodes.get(selectedId) : undefined
  const rowCount = useMemo(() => {
    void version
    return model.rowCount
  }, [model, version])

  return (
    <div className="relative min-w-0 flex-1 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full"
        aria-label="Mapa de datos: tablas y filas conectadas por sus relaciones"
      />

      {/* Barra superior: buscador y controles */}
      <div className="absolute top-3 left-3 z-10 flex items-start gap-2">
        <div className="relative w-72">
          <label className="flex items-center gap-2 rounded-lg border border-line bg-surface/85 px-2.5 py-1.5 text-muted backdrop-blur focus-within:border-accent">
            <SearchIcon />
            <span className="sr-only">Buscar en el mapa</span>
            <input
              className="w-full bg-transparent font-mono text-xs text-fg outline-none placeholder:text-faint"
              placeholder="buscar nodo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches[0]) {
                  select(matches[0].id)
                  setSearch('')
                }
              }}
            />
          </label>
          {matches.length > 0 && (
            <ul className="absolute mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface/95 font-mono text-xs shadow-lg backdrop-blur">
              {matches.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-raised hover:text-accent-soft"
                    onClick={() => {
                      select(n.id)
                      setSearch('')
                    }}
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: tableColor(theme, n.colorIndex) }}
                    />
                    <span className="truncate">{n.label}</span>
                    <span className="ml-auto shrink-0 text-faint">
                      {n.kind === 'table' ? 'tabla' : n.table}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface/85 p-1 font-mono text-[11px] backdrop-blur">
          <button
            type="button"
            className="rounded px-2 py-1 text-muted hover:bg-raised hover:text-accent-soft"
            onClick={() => engineRef.current?.fit()}
          >
            encajar
          </button>
          <button
            type="button"
            aria-pressed={particles}
            className={`rounded px-2 py-1 hover:bg-raised ${particles ? 'text-accent-soft' : 'text-muted'}`}
            onClick={() => setParticles((p) => !p)}
          >
            partículas
          </button>
          <button
            type="button"
            title="Quitar todas las filas y dejar solo las tablas"
            className="flex items-center gap-1 rounded px-2 py-1 text-muted hover:bg-raised hover:text-accent-soft disabled:opacity-40"
            disabled={rowCount === 0}
            onClick={() => {
              seedRun.current++
              setSeeding(null)
              model.clearRows()
              setSelectedId(null)
            }}
          >
            <RefreshIcon width={12} height={12} /> limpiar
          </button>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface/85 p-1 font-mono text-[11px] backdrop-blur">
          <button
            type="button"
            aria-pressed={allRows}
            title="Siembra filas de todas las tablas y las une por sus FKs. Se recuerda al volver."
            className={`rounded px-2 py-1 hover:bg-raised ${
              allRows ? 'bg-accent/15 text-accent-soft' : 'text-muted hover:text-accent-soft'
            }`}
            onClick={toggleAllRows}
          >
            ✦ todas las filas
          </button>
          <label className="flex items-center gap-1 pr-1 text-faint">
            <select
              className="rounded border border-line bg-bg px-1 py-0.5 text-fg outline-none focus:border-accent"
              value={perTable}
              aria-label="Filas por tabla"
              onChange={(e) => changePerTable(Number(e.target.value))}
            >
              {PER_TABLE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            / tabla
          </label>
          {seeding && (
            <span className="px-1 text-accent-soft tabular-nums">
              sembrando {seeding.done}/{seeding.total}…
            </span>
          )}
        </div>
      </div>

      {/* Leyenda: un color por tabla */}
      <div className="absolute bottom-3 left-3 z-10 max-h-[45%] w-52 overflow-y-auto rounded-lg border border-line bg-surface/80 p-2 font-mono text-[11px] backdrop-blur">
        <p className="mb-1 px-1 text-faint">
          {legend.length} tablas · {rowCount} filas
        </p>
        {legend.map((t) => (
          <button
            key={t.name}
            type="button"
            className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-muted hover:bg-raised hover:text-fg"
            onClick={() => select(tableNodeId(t.name))}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{
                background: tableColor(theme, model.colorOf(t.name)),
                boxShadow: `0 0 6px ${tableColor(theme, model.colorOf(t.name))}`,
              }}
            />
            <span className="truncate">{t.name}</span>
            {t.junction && <span className="ml-auto text-faint">⇄</span>}
          </button>
        ))}
      </div>

      {/* Ayuda inicial */}
      {graph.data && rowCount === 0 && !selected && (
        <p className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-line bg-surface/80 px-4 py-1.5 text-center font-mono text-[11px] text-muted backdrop-blur">
          clic: detalles · doble clic en una tabla: sembrar filas · doble clic en una fila:
          desplegar relaciones · arrastra y usa la rueda
        </p>
      )}

      {graph.isPending && (
        <div className="absolute inset-0 grid place-items-center">
          <Spinner label="trazando el mapa…" />
        </div>
      )}
      {graph.isError && (
        <div className="absolute top-16 left-3 z-10">
          <ErrorBox error={graph.error} />
        </div>
      )}
      {error && (
        <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-danger/40 bg-surface/95 px-3 py-2 font-mono text-xs text-danger shadow-lg">
          {error}
          <button type="button" aria-label="Cerrar aviso" onClick={() => setError(null)}>
            <CloseIcon width={12} height={12} />
          </button>
        </div>
      )}

      {selected && graph.data && (
        <MapPanel
          key={selected.id}
          conn={conn}
          node={selected}
          model={model}
          graph={graph.data}
          busy={busyId === selected.id}
          onClose={() => setSelectedId(null)}
          onSelect={(id) => select(id)}
          onSeed={(table) => void seedTable(table)}
          onExpand={(id) => void expandRow(id)}
        />
      )}
    </div>
  )
}
