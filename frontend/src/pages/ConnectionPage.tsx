import { type ReactNode, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useConnections, useTables } from '../api/hooks'
import type { TableSummary } from '../api/types'
import { EChart, type EChartOption } from '../components/EChart'
import { ErrorBox, Spinner } from '../components/feedback'
import { HudPanel } from '../components/hud'
import { DatabaseIcon } from '../components/icons'
import { blip } from '../lib/blip'
import { formatCompact, formatInt } from '../lib/format'
import { cssVar, useTheme } from '../theme/theme'

/** Vista general de una conexión: cifras y gráfica de filas por tabla. */
export default function ConnectionPage() {
  const { conn = '' } = useParams()
  const tables = useTables(conn)
  const connections = useConnections()
  const dialect = connections.data?.find((c) => c.name === conn)?.dialect

  if (tables.isPending) {
    return (
      <div className="p-6">
        <Spinner />
      </div>
    )
  }
  if (tables.isError) {
    return (
      <div className="p-6">
        <ErrorBox error={tables.error} />
      </div>
    )
  }

  const list = tables.data
  const views = list.filter((t) => t.kind === 'view').length
  const rows = list.reduce((sum, t) => sum + (t.approx_rows ?? 0), 0)
  const relations = list.reduce((sum, t) => sum + t.fk_count, 0)

  const top = [...list]
    .filter((t) => t.approx_rows != null)
    .sort((a, b) => (b.approx_rows ?? 0) - (a.approx_rows ?? 0))
  const linked = [...list].filter((t) => t.fk_count > 0).sort((a, b) => b.fk_count - a.fk_count)
  // Nombres de la BD como texto de React (nunca HTML).
  const logLines: ReactNode[] = [
    <>
      <b>caronte</b> conexión <em>{conn}</em> abierta{dialect && ` · ${dialect}`}
    </>,
    <>
      <b>esquema</b> {list.length - views} tablas · {views} vistas
    </>,
    ...top.slice(0, 3).map((t) => (
      <>
        <b>{t.name}</b> ~{formatInt(t.approx_rows)} filas
      </>
    )),
    ...linked.slice(0, 3).map((t) => (
      <>
        <b>{t.name}</b> {t.fk_count} relaciones (FK)
      </>
    )),
    <>
      <b>modo</b> <u>solo lectura</u>
    </>,
  ]

  return (
    <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
      <div className="grid min-w-0 gap-3">
        <HudPanel title="CONEXIÓN" aside="vista general">
          <div className="flex flex-wrap items-center gap-3">
            <DatabaseIcon width={26} height={26} className="text-accent" />
            <h3 className="font-mono text-2xl font-semibold">{conn}</h3>
            <div className="flex flex-wrap gap-1.5">
              {dialect && <span className="hud-tag">{dialect}</span>}
              <span className="hud-tag y">solo lectura</span>
              {relations > 0 && <span className="hud-tag r">{formatInt(relations)} FK</span>}
            </div>
          </div>
          <div className="hud-kv mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="tablas" value={formatInt(list.length - views)} />
            <Stat label="vistas" value={formatInt(views)} />
            <Stat label="filas (aprox.)" value={formatCompact(rows)} title={formatInt(rows)} />
            <Stat label="relaciones (FK)" value={formatInt(relations)} />
          </div>
        </HudPanel>

        <HudPanel title="FILAS POR TABLA" aside="clic en una barra para abrirla">
          <RowsChart conn={conn} tables={list} />
        </HudPanel>
      </div>

      <div className="grid min-w-0 gap-3">
        <HudPanel title="ESCANEO" aside={`${list.length} objetos`}>
          <div className="hud-radar" aria-hidden="true">
            {list.slice(0, 14).map((t, i) => (
              <i
                key={t.name}
                style={{
                  left: `${blip(t.name, 7) * 100}%`,
                  top: `${blip(t.name, 13) * 100}%`,
                  animationDelay: `${(i % 5) * 0.4}s`,
                }}
              />
            ))}
          </div>
        </HudPanel>
        <HudPanel title="CONSOLA" aside="esquema">
          <div className="hud-log">
            {logLines.map((l, i) => (
              <p key={i} className={i === logLines.length - 1 ? 'hud-cur' : ''}>
                {l}
              </p>
            ))}
          </div>
        </HudPanel>
      </div>
    </div>
  )
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div title={title}>
      <small>{label}</small>
      <b className="tabular-nums">{value}</b>
    </div>
  )
}

const MAX_BARS = 30

function RowsChart({ conn, tables }: { conn: string; tables: TableSummary[] }) {
  const navigate = useNavigate()
  const { theme } = useTheme()

  const top = useMemo(
    () =>
      tables
        .filter((t) => t.approx_rows != null)
        .sort((a, b) => (b.approx_rows ?? 0) - (a.approx_rows ?? 0))
        .slice(0, MAX_BARS)
        .reverse(),
    [tables],
  )

  const option = useMemo<EChartOption>(() => {
    // `theme` en las dependencias: al cambiar de tema se releen las variables CSS.
    void theme
    const accent = cssVar('--c-accent')
    const soft = cssVar('--c-accent-soft')
    const muted = cssVar('--c-muted')
    const line = cssVar('--c-line')
    const surface = cssVar('--c-raised')
    const fg = cssVar('--c-fg')
    return {
      animationDuration: 600,
      grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: surface,
        borderColor: accent,
        textStyle: { color: fg, fontFamily: 'JetBrains Mono Variable, monospace', fontSize: 12 },
        valueFormatter: (v: unknown) => `~${formatInt(Number(v))} filas`,
      },
      xAxis: {
        type: 'value',
        axisLabel: { color: muted, formatter: (v: number) => formatCompact(v) },
        splitLine: { lineStyle: { color: line, type: 'dashed' } },
      },
      yAxis: {
        type: 'category',
        data: top.map((t) => t.name),
        axisLabel: { color: fg, fontFamily: 'JetBrains Mono Variable, monospace', fontSize: 11 },
        axisLine: { lineStyle: { color: line } },
        axisTick: { show: false },
      },
      series: [
        {
          type: 'bar',
          data: top.map((t) => t.approx_rows),
          barMaxWidth: 18,
          cursor: 'pointer',
          itemStyle: {
            borderRadius: [0, 4, 4, 0],
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 1,
              y2: 0,
              colorStops: [
                { offset: 0, color: accent },
                { offset: 1, color: soft },
              ],
            },
          },
          emphasis: { itemStyle: { shadowBlur: 12, shadowColor: accent } },
          label: {
            show: true,
            position: 'right',
            color: muted,
            fontSize: 10,
            formatter: (p: { value: number }) => formatCompact(p.value),
          },
        },
      ],
    }
  }, [top, theme])

  if (!top.length) {
    return <p className="font-mono text-xs text-faint">Sin estadísticas de filas.</p>
  }
  return (
    <EChart
      option={option}
      className="w-full"
      style={{ height: Math.max(160, top.length * 26 + 24) }}
      onClick={(p) =>
        navigate(`/c/${encodeURIComponent(conn)}/t/${encodeURIComponent(top[p.dataIndex].name)}`)
      }
    />
  )
}
