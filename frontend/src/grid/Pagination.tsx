import type { ReactNode } from 'react'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from '../components/icons'
import { formatInt } from '../lib/format'
import { PAGE_SIZES } from './params'

interface Props {
  page: number
  size: number
  total: number | null | undefined
  rowsOnPage: number
  canPrev: boolean
  canNext: boolean
  pageCount: number | null
  onPage: (page: number) => void
  onSize: (size: number) => void
}

function PagerButton(props: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="rounded p-1.5 text-muted transition enabled:hover:bg-raised enabled:hover:text-accent-soft disabled:opacity-30"
    >
      {props.children}
    </button>
  )
}

export function Pagination(p: Props) {
  const from = p.rowsOnPage === 0 ? 0 : p.page * p.size + 1
  const to = p.page * p.size + p.rowsOnPage

  return (
    <footer className="flex h-10 shrink-0 items-center gap-3 border-t border-line bg-surface px-3 font-mono text-xs text-muted">
      <span className="tabular-nums">
        filas <span className="text-fg">{formatInt(from)}</span>–
        <span className="text-fg">{formatInt(to)}</span> de{' '}
        <span className="text-fg">{p.total == null ? '?' : formatInt(p.total)}</span>
      </span>

      <div className="ml-auto flex items-center gap-1">
        <PagerButton label="Primera página" disabled={!p.canPrev} onClick={() => p.onPage(0)}>
          <ChevronsLeftIcon />
        </PagerButton>
        <PagerButton
          label="Página anterior"
          disabled={!p.canPrev}
          onClick={() => p.onPage(p.page - 1)}
        >
          <ChevronLeftIcon />
        </PagerButton>
        <label className="flex items-center gap-1.5 px-1">
          <span>pág.</span>
          <input
            key={p.page}
            className="h-6 w-14 rounded border border-line bg-bg px-1 text-center text-fg outline-none focus:border-accent"
            defaultValue={p.page + 1}
            inputMode="numeric"
            aria-label="Número de página"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              const n = Number(e.currentTarget.value)
              if (Number.isInteger(n) && n >= 1) {
                p.onPage(Math.min(n, p.pageCount ?? n) - 1)
              }
            }}
          />
          <span>/ {p.pageCount == null ? '?' : formatInt(p.pageCount)}</span>
        </label>
        <PagerButton
          label="Página siguiente"
          disabled={!p.canNext}
          onClick={() => p.onPage(p.page + 1)}
        >
          <ChevronRightIcon />
        </PagerButton>
        <PagerButton
          label="Última página"
          disabled={!p.canNext || p.pageCount == null}
          onClick={() => p.pageCount != null && p.onPage(p.pageCount - 1)}
        >
          <ChevronsRightIcon />
        </PagerButton>
      </div>

      <label className="flex items-center gap-1.5">
        <select
          className="h-6 rounded border border-line bg-bg px-1 text-fg outline-none focus:border-accent"
          value={p.size}
          aria-label="Filas por página"
          onChange={(e) => p.onSize(Number(e.target.value))}
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span>por página</span>
      </label>
    </footer>
  )
}
