import { PILL_COLORS } from './values'

export function NullCell() {
  return (
    <span className="rounded border border-dashed border-faint/50 px-1 text-[10px] tracking-wide text-faint uppercase italic">
      null
    </span>
  )
}

export function BoolCell({ value }: { value: boolean }) {
  return value ? (
    <span className="flex items-center gap-1 text-ok">
      <span aria-hidden>●</span> true
    </span>
  ) : (
    <span className="flex items-center gap-1 text-faint">
      <span aria-hidden>○</span> false
    </span>
  )
}

export function TextCell({ text }: { text: string }) {
  return (
    <span className="truncate" title={text.length > 24 ? text : undefined}>
      {text}
    </span>
  )
}

export function Pill({ text, color }: { text: string; color: number }) {
  return (
    <span
      className={`truncate rounded-full px-2 py-px text-[11px] ring-1 ring-inset ${PILL_COLORS[color]}`}
      title={text}
    >
      {text}
    </span>
  )
}

/** Número alineado a la derecha con una barra proporcional al máximo de la página. */
export function NumberCell({ value, maxAbs }: { value: number | string; maxAbs: number }) {
  const n = Number(value)
  const pct = maxAbs > 0 && Number.isFinite(n) ? Math.min(100, (Math.abs(n) / maxAbs) * 100) : 0
  return (
    <span className="relative flex h-5 w-full items-center justify-end">
      {pct > 0 && (
        <span
          className={`absolute inset-y-0.5 left-0 rounded-sm ${
            n < 0 ? 'bg-danger/25' : 'bg-accent/25 dark:bg-accent/20'
          }`}
          style={{ width: `${pct}%` }}
        />
      )}
      <span className="relative truncate tabular-nums">{String(value)}</span>
    </span>
  )
}
