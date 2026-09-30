import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useConnections, useTables } from '../api/hooks'
import type { TableSummary } from '../api/types'
import { EChart, type EChartOption } from '../components/EChart'
import { ErrorBox, Spinner } from '../components/feedback'
import { DatabaseIcon } from '../components/icons'
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

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <header className="mb-6 flex items-center gap-3">
        <DatabaseIcon width={22} height={22} className="text-accent" />
        <h2 className="font-mono text-xl font-semibold">{conn}</h2>
        {dialect && (
          <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-[11px] text-accent-soft">
            {dialect}
          </span>
        )}
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="tablas" value={formatInt(list.length - views)} />
        <Stat label="vistas" value={formatInt(views)} />
        <Stat label="filas (aprox.)" value={formatCompact(rows)} title={formatInt(rows)} />
        <Stat label="relaciones (FK)" value={formatInt(relations)} />
      </div>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h3 className="mb-2 font-mono text-sm text-muted">filas por tabla</h3>
        <RowsChart conn={conn} tables={list} />
      </section>

      <p className="mt-4 font-mono text-xs text-faint">
        Elige una tabla en la barra lateral o haz clic en una barra.
      </p>
    </div>
  )
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div
      className="rounded-xl border border-line bg-surface p-4 transition hover:border-accent/50"
      title={title}
    >
      <div className="font-mono text-2xl font-semibold text-accent-soft tabular-nums">{value}</div>
      <div className="mt-1 font-mono text-xs text-muted">{label}</div>
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
