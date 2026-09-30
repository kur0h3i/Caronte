const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
const fullDate = new Intl.DateTimeFormat('es', { dateStyle: 'full' })
const fullDateTime = new Intl.DateTimeFormat('es', { dateStyle: 'full', timeStyle: 'medium' })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86400],
  ['month', 30 * 86400],
  ['week', 7 * 86400],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
]

/** "2024-01-31" o "2024-01-31T10:00:00" -> Date (sin zona = hora local). */
export function parseDbDate(value: string, dateOnly: boolean): Date | null {
  if (dateOnly) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
  }
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : new Date(time)
}

/** "hace 3 días", "en 2 meses", "ayer"... Las fechas sin hora no bajan de días. */
export function relativeTime(date: Date, dateOnly: boolean): string {
  const now = new Date()
  if (dateOnly) now.setHours(0, 0, 0, 0)
  const seconds = (date.getTime() - now.getTime()) / 1000
  const smallest = dateOnly ? 'day' : 'second'
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size || unit === smallest) {
      return rtf.format(Math.round(seconds / size), unit)
    }
  }
  return ''
}

export function absoluteDate(date: Date, dateOnly: boolean): string {
  return (dateOnly ? fullDate : fullDateTime).format(date)
}
