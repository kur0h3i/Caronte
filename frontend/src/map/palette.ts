import { cssVar, type Theme } from '../theme/theme'
import type { MapColors } from './engine'

// Un color por tabla: neones sobre fondo oscuro, tonos más profundos sobre fondo claro.
const PALETTE_DARK = [
  '#00f0ff',
  '#ff2e88',
  '#7a3df0',
  '#fcee0a',
  '#38bdf8',
  '#34d399',
  '#fb923c',
  '#a3e635',
  '#e879f9',
  '#2dd4bf',
  '#f472b6',
  '#60a5fa',
  '#818cf8',
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
