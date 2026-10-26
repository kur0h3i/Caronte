import { type ReactNode, useEffect, useState } from 'react'

/** Panel HUD con esquinas luminosas y título opcional (maqueta cerbero-os.html). */
export function HudPanel({
  title,
  aside,
  className = '',
  pad = true,
  children,
}: {
  title?: string
  aside?: ReactNode
  className?: string
  pad?: boolean
  children: ReactNode
}) {
  return (
    <section className={`hud-panel ${pad ? 'p-4' : ''} ${className}`}>
      {title && (
        <h2 className="hud-h2">
          {title}
          {aside != null && <i>{aside}</i>}
        </h2>
      )}
      {children}
    </section>
  )
}

export function Led({ tone }: { tone?: 'warn' | 'live' }) {
  return <span className={`hud-led ${tone ?? ''}`} aria-hidden="true" />
}

/** Cinta superior: enlace, reloj y cinta con datos reales de la sesión. */
export function StatusRibbon({ ticker }: { ticker: string }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="hud-bar">
      <span className="flex items-center gap-2">
        <Led tone="live" /> ENLACE SEGURO · SOLO LECTURA
      </span>
      <span>{now.toLocaleTimeString('es-ES')}</span>
      <div className="hud-ticker">
        <span>{ticker}</span>
      </div>
    </div>
  )
}
