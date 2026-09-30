const compact = new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 })
const integer = new Intl.NumberFormat('es')

/** 3503 -> "3,5 mil"; null -> "?" */
export function formatCompact(n: number | null | undefined): string {
  return n == null ? '?' : compact.format(n)
}

export function formatInt(n: number | null | undefined): string {
  return n == null ? '?' : integer.format(n)
}
