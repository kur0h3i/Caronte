import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { JsonValue } from '../api/types'
import { CloseIcon } from '../components/icons'

/** JSON plegado en la celda; al hacer clic se abre un árbol desplegable flotante. */
export function JsonCell({ value }: { value: JsonValue }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const preview = JSON.stringify(value)
  return (
    <>
      <button
        type="button"
        className="flex min-w-0 items-center gap-1.5 text-left hover:text-accent-soft"
        title="Ver JSON"
        onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
      >
        <span className="shrink-0 rounded bg-accent/15 px-1 text-[10px] text-accent-soft">
          {Array.isArray(value) ? `[${value.length}]` : typeof value === 'object' ? '{…}' : 'json'}
        </span>
        <span className="truncate text-muted">{preview}</span>
      </button>
      {anchor && <JsonPopover value={value} anchor={anchor} onClose={() => setAnchor(null)} />}
    </>
  )
}

function JsonPopover(props: { value: JsonValue; anchor: DOMRect; onClose: () => void }) {
  const { value, anchor, onClose } = props
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  const width = 420
  const left = Math.min(anchor.left, window.innerWidth - width - 12)
  const below = anchor.bottom + 360 < window.innerHeight
  const style = below
    ? { left, top: anchor.bottom + 4, width }
    : { left, bottom: window.innerHeight - anchor.top + 4, width }

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Contenido JSON"
      className="fixed z-50 max-h-[360px] overflow-auto rounded-lg border border-accent/40 bg-surface p-3 font-mono text-xs shadow-[0_10px_40px_-10px_var(--c-accent)]"
      style={style}
    >
      <button
        type="button"
        aria-label="Cerrar"
        className="sticky top-0 float-right rounded p-0.5 text-muted hover:bg-raised hover:text-fg"
        onClick={onClose}
      >
        <CloseIcon width={14} height={14} />
      </button>
      <JsonTree value={value} depth={0} />
    </div>,
    document.body,
  )
}

function JsonTree({ value, depth, name }: { value: JsonValue; depth: number; name?: string }) {
  const key = name !== undefined && <span className="text-accent-soft">{name}: </span>

  if (value === null || typeof value !== 'object') {
    return (
      <div className="pl-4 leading-5">
        {key}
        <JsonScalar value={value} />
      </div>
    )
  }

  const entries: [string, JsonValue][] = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value)
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}']

  return (
    <details open={depth < 2} className="group pl-4 leading-5 [&>summary]:list-none">
      <summary className="-ml-4 cursor-pointer select-none hover:text-accent-soft">
        <span className="inline-block w-4 text-faint transition group-open:rotate-90">▸</span>
        {key}
        <span className="text-faint">
          {open}
          <span className="group-open:hidden">
            {' '}
            {entries.length} {Array.isArray(value) ? 'elementos' : 'claves'} {close}
          </span>
        </span>
      </summary>
      {entries.map(([k, v]) => (
        <JsonTree key={k} name={k} value={v} depth={depth + 1} />
      ))}
      <div className="-ml-4 pl-4 text-faint">{close}</div>
    </details>
  )
}

function JsonScalar({ value }: { value: JsonValue }) {
  if (value === null) return <span className="text-faint italic">null</span>
  if (typeof value === 'string') return <span className="text-ok">"{value}"</span>
  if (typeof value === 'number')
    return <span className="text-sky-600 dark:text-sky-300">{value}</span>
  return <span className="text-amber-600 dark:text-amber-300">{String(value)}</span>
}
