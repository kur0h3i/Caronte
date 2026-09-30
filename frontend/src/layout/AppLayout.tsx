import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router'
import { useConnections, useLogout, useMe } from '../api/hooks'
import {
  ConstellationIcon,
  DatabaseIcon,
  LogoMark,
  LogoutIcon,
  MoonIcon,
  SunIcon,
  TableIcon,
} from '../components/icons'
import { useTheme } from '../theme/theme'

function tabClass(active: boolean) {
  return `flex items-center gap-1.5 rounded-md px-2.5 py-1 transition ${
    active ? 'bg-accent/15 text-accent-soft' : 'text-muted hover:text-accent-soft'
  }`
}

export function AppLayout() {
  const { conn } = useParams()
  const isMap = useLocation().pathname.endsWith('/estigia')
  const connections = useConnections()
  const me = useMe()
  const logout = useLogout()
  const navigate = useNavigate()
  const { theme, toggle: toggleTheme } = useTheme()

  return (
    <div className="flex h-full flex-col">
      <header className="relative flex h-12 shrink-0 items-center gap-4 border-b border-line bg-surface px-4">
        <Link to="/" className="flex items-center gap-2 font-mono font-semibold tracking-tight">
          <LogoMark />
          <span>
            caronte<span className="text-accent">_</span>
          </span>
        </Link>

        <label className="flex items-center gap-2 text-muted">
          <DatabaseIcon />
          <span className="sr-only">Conexión</span>
          <select
            className="rounded-md border border-line bg-bg px-2 py-1 font-mono text-sm text-fg outline-none hover:border-accent/60 focus:border-accent"
            value={conn ?? ''}
            onChange={(e) => navigate(`/c/${encodeURIComponent(e.target.value)}`)}
          >
            {!conn && <option value="">— conexión —</option>}
            {connections.data?.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} · {c.dialect}
              </option>
            ))}
          </select>
        </label>

        {conn && (
          <nav className="flex items-center gap-0.5 rounded-lg border border-line bg-bg p-0.5 font-mono text-xs">
            <Link to={`/c/${encodeURIComponent(conn)}`} className={tabClass(!isMap)}>
              <TableIcon width={13} height={13} /> tablas
            </Link>
            <Link
              to={`/c/${encodeURIComponent(conn)}/estigia`}
              className={tabClass(isMap)}
              title="Estigia: mapa de datos y sus relaciones"
            >
              <ConstellationIcon width={13} height={13} /> estigia
            </Link>
          </nav>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            className="rounded-md p-2 text-muted transition hover:bg-raised hover:text-accent-soft"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <span className="px-2 font-mono text-xs text-faint">{me.data?.username}</span>
          <button
            type="button"
            onClick={() => logout.mutate()}
            title="Cerrar sesión"
            className="rounded-md p-2 text-muted transition hover:bg-raised hover:text-danger"
          >
            <LogoutIcon />
          </button>
        </div>
        {/* Línea de acento bajo la cabecera */}
        <div className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-linear-to-r from-transparent via-accent/70 to-transparent" />
      </header>
      <div className="flex min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
