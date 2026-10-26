import { useSyncExternalStore } from 'react'

// Modo sereno: por defecto depende de la pantalla (tablas y mapa = sereno; login y
// vista general = completo). Si el usuario pulsa el botón, su elección manda en todas.
const KEY = 'caronte-calm'
type Override = 'calm' | 'full' | null

let override: Override = read()
const listeners = new Set<() => void>()

function read(): Override {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'calm' || v === 'full' ? v : null
  } catch {
    return null
  }
}

export function isWorkRoute(pathname: string): boolean {
  return /\/t\/[^/]+$|\/estigia$/.test(pathname)
}

export function setCalmOverride(next: 'calm' | 'full') {
  override = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // Almacenamiento bloqueado: la elección vale solo hasta recargar.
  }
  listeners.forEach((l) => l())
}

export function useCalmOverride(): Override {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => override,
  )
}

export function resolveCalm(o: Override, pathname: string): boolean {
  return o ? o === 'calm' : isWorkRoute(pathname)
}
