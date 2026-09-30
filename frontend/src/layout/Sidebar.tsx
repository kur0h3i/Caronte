import { useMemo, useState } from 'react'
import { NavLink } from 'react-router'
import { useTables } from '../api/hooks'
import { ErrorBox, Spinner } from '../components/feedback'
import { LinkIcon, SearchIcon, TableIcon, ViewIcon } from '../components/icons'
import { formatCompact, formatInt } from '../lib/format'

export function Sidebar({ conn }: { conn: string }) {
  const tables = useTables(conn)
  const [search, setSearch] = useState('')

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const all = tables.data ?? []
    return needle ? all.filter((t) => t.name.toLowerCase().includes(needle)) : all
  }, [tables.data, search])

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-surface">
      <div className="border-b border-line p-2">
        <label className="flex items-center gap-2 rounded-md border border-line bg-bg px-2 py-1.5 text-muted focus-within:border-accent">
          <SearchIcon />
          <span className="sr-only">Buscar tabla</span>
          <input
            className="w-full bg-transparent font-mono text-xs text-fg outline-none placeholder:text-faint"
            placeholder="buscar tabla…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {tables.isPending && (
          <div className="p-2">
            <Spinner />
          </div>
        )}
        {tables.isError && (
          <div className="p-2">
            <ErrorBox error={tables.error} />
          </div>
        )}
        {tables.data && visible.length === 0 && (
          <p className="p-2 font-mono text-xs text-faint">sin resultados</p>
        )}
        <ul className="space-y-px">
          {visible.map((t) => (
            <li key={t.name}>
              <NavLink
                to={`/c/${encodeURIComponent(conn)}/t/${encodeURIComponent(t.name)}`}
                title={`${t.name} · ~${formatInt(t.approx_rows)} filas · ${t.fk_count} FK`}
                className={({ isActive }) =>
                  [
                    'group flex items-center gap-2 rounded-md px-2 py-1.5 font-mono text-[13px] transition',
                    isActive
                      ? 'bg-accent/15 text-accent-soft shadow-[inset_2px_0_0_var(--c-accent)]'
                      : 'text-fg/85 hover:bg-raised hover:text-accent-soft',
                  ].join(' ')
                }
              >
                {t.kind === 'view' ? (
                  <ViewIcon className="shrink-0 text-faint" />
                ) : (
                  <TableIcon className="shrink-0 text-faint group-hover:text-accent" />
                )}
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                {t.fk_count > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-faint">
                    <LinkIcon width={11} height={11} />
                    {t.fk_count}
                  </span>
                )}
                <span className="w-12 text-right text-[11px] text-faint tabular-nums">
                  {formatCompact(t.approx_rows)}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {tables.data && (
        <footer className="border-t border-line px-3 py-2 font-mono text-[11px] text-faint">
          {tables.data.length} tablas
        </footer>
      )}
    </aside>
  )
}
