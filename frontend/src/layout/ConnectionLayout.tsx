import { Outlet, useParams } from 'react-router'
import { Sidebar } from './Sidebar'

export function ConnectionLayout() {
  const { conn = '' } = useParams()
  return (
    <>
      <Sidebar conn={conn} />
      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </>
  )
}
