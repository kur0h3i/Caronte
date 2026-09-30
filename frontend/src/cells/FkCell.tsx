import { Link, useParams } from 'react-router'
import type { FkValue, ForeignKeyInfo } from '../api/types'
import { tableHref } from '../grid/params'

/** FK como "etiqueta #id"; al hacer clic abre la tabla referenciada filtrada por ese id. */
export function FkCell({ value, fk }: { value: FkValue; fk: ForeignKeyInfo }) {
  const { conn = '' } = useParams()
  const id = String(value.id)
  const label = value.label == null ? null : String(value.label)
  const href = tableHref(conn, fk.ref_table, [{ column: fk.ref_columns[0], op: 'eq', value: id }])

  return (
    <Link
      to={href}
      title={`${label ?? ''} → ${fk.ref_table} #${id}`}
      className="group/fk flex min-w-0 items-center gap-1.5 rounded-sm decoration-accent/60 underline-offset-2 hover:text-accent-soft hover:underline"
    >
      {label != null && label !== id && <span className="truncate">{label}</span>}
      <span className="shrink-0 text-faint group-hover/fk:text-accent">#{id}</span>
    </Link>
  )
}
