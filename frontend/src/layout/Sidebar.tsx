import { useMemo, useState } from 'react'
import { NavLink } from 'react-router'
import { useTables } from '../api/hooks'
import { ErrorBox, Spinner } from '../components/feedback'
import { HudPanel, Led } from '../components/hud'
import { SearchIcon } from '../components/icons'
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
    <HudPanel
      pad={false}
      className="flex w-64 shrink-0 flex-col p-3 pb-2"
      title="TABLAS"
      aside={tables.data ? `${tables.data.length} en línea` : undefined}
    >
      <div className="mb-2">
        <label className="flex items-center gap-2 border border-line border-b-accent bg-accent/5 px-2 py-1.5 text-muted focus-within:border-accent">
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

      <nav className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
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
        <ul className="space-y-1">
          {visible.map((t, i) => (
            <li key={t.name}>
              <NavLink
                to={`/c/${encodeURIComponent(conn)}/t/${encodeURIComponent(t.name)}`}
                title={`${t.name} · ~${formatInt(t.approx_rows)} filas · ${t.fk_count} FK`}
                className={({ isActive }) => `hud-item ${isActive ? 'on' : ''}`}
              >
                <span className="code">T-{String(i + 1).padStart(2, '0')}</span>
                <span className="name !font-mono !text-[13px] !tracking-normal">{t.name}</span>
                <Led tone={t.kind === 'view' ? 'warn' : undefined} />
                <span className="desc">
                  {t.kind === 'view' ? 'vista' : 'tabla'} · ~{formatCompact(t.approx_rows)} filas
                  {t.fk_count > 0 && ` · ${t.fk_count} FK`}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </HudPanel>
  )
}
