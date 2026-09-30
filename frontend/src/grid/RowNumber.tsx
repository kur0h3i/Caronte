import { Link, useParams } from 'react-router'
import type { CellValue } from '../api/types'
import { isFkValue } from '../cells/values'

/** Nº de fila; en tablas con PK simple es un enlace que abre esa fila en Estigia. */
export function RowNumber({ n, table, pk }: { n: number; table: string; pk: CellValue }) {
  const { conn = '' } = useParams()
  const id = isFkValue(pk) ? pk.id : pk
  if (id == null || typeof id === 'object') {
    return <span className="w-full text-right text-faint tabular-nums">{n}</span>
  }
  const qs = new URLSearchParams({ table, id: String(id) })
  return (
    <Link
      to={`/c/${encodeURIComponent(conn)}/estigia?${qs}`}
      title="Ver esta fila y sus relaciones en Estigia"
      className="w-full text-right text-faint tabular-nums hover:text-accent-soft hover:underline"
    >
      {n}
    </Link>
  )
}
