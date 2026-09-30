import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError } from './client'
import { keys } from './keys'

// Si cualquier petición devuelve 401 (sesión caducada o servidor reiniciado),
// marcamos al usuario como no autenticado y <RequireAuth> redirige al login.
function onError(error: Error) {
  if (error instanceof ApiError && error.status === 401) {
    queryClient.setQueryData(keys.me, null)
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      // Los 4xx no se arreglan reintentando; los 5xx (BD caída, timeout) una vez.
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})
