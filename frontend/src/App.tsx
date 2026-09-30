import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { LoginPage } from './auth/LoginPage'
import { RequireAuth } from './auth/RequireAuth'
import { EmptyState, Spinner } from './components/feedback'
import { AppLayout } from './layout/AppLayout'
import { ConnectionLayout } from './layout/ConnectionLayout'
import { HomeRedirect } from './pages/HomeRedirect'
import { TablePage } from './pages/TablePage'

// ECharts pesa: la vista general se carga bajo demanda en su propio fichero JS.
const ConnectionPage = lazy(() => import('./pages/ConnectionPage'))

const fallback = (
  <div className="p-6">
    <Spinner />
  </div>
)

// Rutas:
//   /login
//   /                       -> primera conexión
//   /c/:conn                -> vista general de la conexión
//   /c/:conn/t/:table       -> datos de la tabla (orden, filtros y página van en ?query)
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="c/:conn" element={<ConnectionLayout />}>
          <Route
            index
            element={
              <Suspense fallback={fallback}>
                <ConnectionPage />
              </Suspense>
            }
          />
          <Route path="t/:table" element={<TablePage />} />
        </Route>
        <Route path="*" element={<EmptyState title="404 · aquí no hay nada" />} />
      </Route>
    </Routes>
  )
}
