import { cssVar, type Theme } from '../theme/theme'
import type { MapColors } from './engine'

// Un color por tabla: neones sobre fondo oscuro, tonos más profundos sobre fondo claro.
const PALETTE_DARK = [
  '#a855f7',
  '#e879f9',
  '#38bdf8',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#818cf8',
  '#2dd4bf',
  '#f472b6',
  '#a3e635',
  '#60a5fa',
  '#fb923c',
]
const PALETTE_LIGHT = [
  '#7c3aed',
  '#c026d3',
  '#0284c7',
  '#059669',
  '#d97706',
  '#e11d48',
  '#4f46e5',
  '#0d9488',
  '#db2777',
  '#65a30d',
  '#2563eb',
  '#ea580c',
]

export function readMapColors(theme: Theme): MapColors {
  return {
    bg: cssVar('--c-bg'),
    fg: cssVar('--c-fg'),
    muted: cssVar('--c-muted'),
    line: cssVar('--c-line'),
    accent: cssVar('--c-accent'),
    accentSoft: cssVar('--c-accent-soft'),
    palette: theme === 'dark' ? PALETTE_DARK : PALETTE_LIGHT,
    dark: theme === 'dark',
  }
}

export function tableColor(theme: Theme, index: number): string {
  const palette = theme === 'dark' ? PALETTE_DARK : PALETTE_LIGHT
  return palette[index % palette.length]
}
