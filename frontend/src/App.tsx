import { Route, Routes } from 'react-router'
import { LoginPage } from './auth/LoginPage'
import { RequireAuth } from './auth/RequireAuth'
import { EmptyState } from './components/feedback'
import { AppLayout } from './layout/AppLayout'
import { ConnectionLayout } from './layout/ConnectionLayout'
import { ConnectionPage } from './pages/ConnectionPage'
import { HomeRedirect } from './pages/HomeRedirect'
import { TablePage } from './pages/TablePage'

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
          <Route index element={<ConnectionPage />} />
          <Route path="t/:table" element={<TablePage />} />
        </Route>
        <Route path="*" element={<EmptyState title="404 · aquí no hay nada" />} />
      </Route>
    </Routes>
  )
}
