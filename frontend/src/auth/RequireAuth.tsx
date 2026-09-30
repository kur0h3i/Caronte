import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useMe } from '../api/hooks'
import { ErrorBox, Spinner } from '../components/feedback'

export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe()
  const location = useLocation()

  if (me.isPending) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    )
  }
  if (me.isError) {
    return (
      <div className="grid h-full place-items-center p-6">
        <ErrorBox error={me.error} />
      </div>
    )
  }
  if (me.data === null) {
    const from = location.pathname + location.search
    return <Navigate to="/login" replace state={{ from }} />
  }
  return children
}
