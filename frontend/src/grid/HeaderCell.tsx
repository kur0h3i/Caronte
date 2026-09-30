import type { ColumnInfo, ForeignKeyInfo } from '../api/types'
import { ArrowDownIcon, ArrowUpIcon, KeyIcon, LinkIcon } from '../components/icons'

interface Props {
  col: ColumnInfo
  fk?: ForeignKeyInfo
  isPk: boolean
  sorted: false | 'asc' | 'desc'
  canSort: boolean
  onToggleSort?: (event: unknown) => void
}

export function HeaderCell({ col, fk, isPk, sorted, canSort, onToggleSort }: Props) {
  const title = [
    col.name,
    col.raw_type,
    col.nullable ? null : 'NOT NULL',
    fk ? `→ ${fk.ref_table}.${fk.ref_columns.join(', ')} (etiqueta: ${fk.display_column})` : null,
    canSort ? 'clic para ordenar' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <button
      type="button"
      onClick={onToggleSort}
      disabled={!canSort}
      title={title}
      className="group flex h-full w-full min-w-0 flex-col justify-center px-2 text-left enabled:cursor-pointer enabled:hover:bg-raised"
    >
      <span
        className={`flex w-full min-w-0 items-center gap-1 font-mono text-xs font-semibold ${
          sorted ? 'text-accent-soft' : 'text-fg'
        }`}
      >
        {isPk && <KeyIcon width={12} height={12} className="shrink-0 text-accent" />}
        <span className="truncate">{col.name}</span>
        {sorted === 'asc' && <ArrowUpIcon width={12} height={12} className="shrink-0" />}
        {sorted === 'desc' && <ArrowDownIcon width={12} height={12} className="shrink-0" />}
      </span>
      <span className="flex w-full min-w-0 items-center gap-1 font-mono text-[10px] text-faint">
        {fk ? (
          <>
            <LinkIcon width={10} height={10} className="shrink-0" />
            <span className="truncate">{fk.ref_table}</span>
          </>
        ) : (
          <span className="truncate">{col.type}</span>
        )}
      </span>
    </button>
  )
}
