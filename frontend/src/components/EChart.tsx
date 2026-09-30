import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { type CSSProperties, useEffect, useEffectEvent, useRef } from 'react'

// Importación modular: solo lo que usamos (barras, ejes, tooltip y canvas), no todo ECharts.
echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

export type EChartOption = echarts.EChartsCoreOption

interface Props {
  option: EChartOption
  className?: string
  style?: CSSProperties
  onClick?: (params: { name: string; dataIndex: number }) => void
}

export function EChart({ option, className, style, onClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const handleClick = useEffectEvent((params: { name: string; dataIndex: number }) =>
    onClick?.(params),
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = echarts.init(el, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    chart.on('click', (p) => handleClick(p as { name: string; dataIndex: number }))
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(el)
    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, true)
  }, [option])

  return <div ref={containerRef} className={className} style={style} />
}
