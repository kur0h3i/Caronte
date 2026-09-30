import type { ReactNode } from 'react'

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-xs text-muted" role="status">
      <span className="size-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
      {label}
    </div>
  )
}

export function ErrorBox({ error, children }: { error?: Error | null; children?: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-xs text-danger"
    >
      {children ?? error?.message ?? 'Error desconocido'}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="font-mono text-sm text-accent-soft">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  )
}
