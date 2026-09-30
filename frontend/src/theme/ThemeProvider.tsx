import { type ReactNode, useCallback, useMemo, useState } from 'react'
import { applyTheme, getStoredTheme, STORAGE_KEY, type Theme, ThemeContext } from './theme'

/** El oscuro es el predeterminado; el claro se recuerda en localStorage. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Modo privado o almacenamiento bloqueado: el tema no se recordará.
      }
      return next
    })
  }, [])

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle])
  return <ThemeContext value={value}>{children}</ThemeContext>
}
