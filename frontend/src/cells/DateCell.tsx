import { absoluteDate, parseDbDate, relativeTime } from '../lib/dates'
import { TextCell } from './basic'

export function DateCell({ value, dateOnly }: { value: string; dateOnly: boolean }) {
  const date = parseDbDate(value, dateOnly)
  if (!date) return <TextCell text={value} />
  return (
    <span className="truncate" title={`${absoluteDate(date, dateOnly)}\n${value}`}>
      {relativeTime(date, dateOnly)}
      <span className="ml-1.5 text-faint">{value.slice(0, 10)}</span>
    </span>
  )
}
