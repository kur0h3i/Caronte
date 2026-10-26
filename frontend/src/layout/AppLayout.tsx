import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router'
import { useConnections, useLogout, useMe, useTables } from '../api/hooks'
import {
  ConstellationIcon,
  DatabaseIcon,
  LogoMark,
  LogoutIcon,
  MoonIcon,
  SunIcon,
  TableIcon,
} from '../components/icons'
import { HudPanel, StatusRibbon } from '../components/hud'
import { formatCompact } from '../lib/format'
import { isWorkRoute, resolveCalm, setCalmOverride, useCalmOverride } from '../theme/calm'
import { useTheme } from '../theme/theme'

function tabClass(active: boolean) {
  return `flex items-center gap-1.5 border border-l-[3px] px-2.5 py-1 transition ${
    active
      ? 'border-accent border-l-danger bg-accent/10 text-accent-soft'
      : 'border-transparent border-l-line text-muted hover:border-accent/60 hover:text-accent-soft'
  }`
}

export function AppLayout() {
  const { conn } = useParams()
  const { pathname } = useLocation()
  const isMap = pathname.endsWith('/estigia')
  const compact = isWorkRoute(pathname)
  const connections = useConnections()
  const tables = useTables(conn ?? '')
  const me = useMe()
  const logout = useLogout()
  const navigate = useNavigate()
  const { theme, toggle: toggleTheme } = useTheme()
  const calm = resolveCalm(useCalmOverride(), pathname)

  const list = tables.data ?? []
  const rows = list.reduce((sum, t) => sum + (t.approx_rows ?? 0), 0)
  const ticker = [
    `usuario ${me.data?.username ?? '…'}`,
    `${connections.data?.length ?? 0} conexiones: ${connections.data?.map((c) => c.name).join(' · ') ?? '…'}`,
    conn && list.length
      ? `${conn}: ${list.length} tablas · ~${formatCompact(rows)} filas · ${list.reduce((n, t) => n + t.fk_count, 0)} relaciones`
      : 'sin conexión abierta',
    'consultas de solo lectura',
  ].join('   ·   ')

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <StatusRibbon ticker={ticker} />

      <HudPanel
        pad={false}
        className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2"
      >
        <Link to="/" className="flex items-center gap-3">
          <LogoMark size={compact ? 30 : 44} />
          <h1 data-t="CARONTE" className={`hud-title ${compact ? 'text-2xl' : 'text-3xl'}`}>
            CARONTE
          </h1>
        </Link>
        {!compact && (
          <p className="hidden font-mono text-xs leading-snug text-muted 2xl:block">
            explorador de bases de datos · solo lectura
            <br />
            nodo: {location.host}
          </p>
        )}

        <label className="flex items-center gap-2 text-muted">
          <DatabaseIcon />
          <span className="sr-only">Conexión</span>
          <select
            className="border border-line border-b-accent bg-accent/5 px-2 py-1 font-mono text-sm text-fg outline-none hover:border-accent/60 focus:border-accent"
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
          <nav className="flex items-center gap-1 font-mono text-xs">
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
          {theme === 'dark' && (
            <button
              type="button"
              onClick={() => setCalmOverride(calm ? 'full' : 'calm')}
              aria-pressed={calm}
              title="Modo sereno: fondo tenue y sin brillos, para leer datos"
              className="border border-accent px-2 py-1 font-mono text-xs text-accent transition hover:bg-accent/15 aria-pressed:bg-accent aria-pressed:text-on-accent"
            >
              {calm ? 'MODO SERENO' : 'MODO COMPLETO'}
            </button>
          )}
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
      </HudPanel>

      <div className="flex min-h-0 flex-1 gap-2">
        <Outlet />
      </div>
    </div>
  )
}
