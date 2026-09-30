import { useParams } from 'react-router'
import { useTableMeta } from '../api/hooks'
import { ErrorBox, Spinner } from '../components/feedback'

export function TablePage() {
  const { conn = '', table = '' } = useParams()
  const meta = useTableMeta(conn, table)

  if (meta.isPending) return <Spinner />
  if (meta.isError) return <ErrorBox error={meta.error} />
  return (
    <div className="p-4 font-mono text-sm">
      <h2 className="text-accent-soft">{meta.data.name}</h2>
      <ul className="mt-2 text-muted">
        {meta.data.columns.map((c) => (
          <li key={c.name}>
            {c.name} <span className="text-faint">{c.type}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
