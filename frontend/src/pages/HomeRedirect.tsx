import { Navigate } from 'react-router'
import { useConnections } from '../api/hooks'
import { EmptyState, ErrorBox, Spinner } from '../components/feedback'

/** "/" lleva a la primera conexión configurada. */
export function HomeRedirect() {
  const connections = useConnections()

  if (connections.isPending) {
    return (
      <div className="grid flex-1 place-items-center">
        <Spinner />
      </div>
    )
  }
  if (connections.isError) {
    return (
      <div className="p-6">
        <ErrorBox error={connections.error} />
      </div>
    )
  }
  const first = connections.data[0]
  if (!first) {
    return (
      <EmptyState title="No hay conexiones configuradas">
        Define alguna en <code className="font-mono text-accent-soft">connections.toml</code> o con
        variables <code className="font-mono text-accent-soft">CARONTE_DB_&lt;NOMBRE&gt;</code> y
        reinicia el servidor.
      </EmptyState>
    )
  }
  return <Navigate to={`/c/${encodeURIComponent(first.name)}`} replace />
}
