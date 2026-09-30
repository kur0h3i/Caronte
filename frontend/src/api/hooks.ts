import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from './client'
import { keys } from './keys'
import type { RowsParams, User } from './types'

/** Usuario actual, o null si no hay sesión. */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async (): Promise<User | null> => {
      try {
        return await api.me()
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    staleTime: Infinity,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      api.login(username, password),
    onSuccess: (user) => queryClient.setQueryData(keys.me, user),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      queryClient.clear()
      queryClient.setQueryData(keys.me, null)
    },
  })
}

export function useConnections() {
  return useQuery({ queryKey: keys.connections, queryFn: api.connections, staleTime: Infinity })
}

export function useTables(conn: string) {
  return useQuery({ queryKey: keys.tables(conn), queryFn: () => api.tables(conn) })
}

export function useTableMeta(conn: string, table: string) {
  return useQuery({ queryKey: keys.meta(conn, table), queryFn: () => api.meta(conn, table) })
}

export function useRows(conn: string, table: string, params: RowsParams) {
  return useQuery({
    queryKey: keys.rows(conn, table, params),
    queryFn: ({ signal }) => api.rows(conn, table, params, signal),
    // Mantiene la página anterior visible mientras llega la siguiente (sin parpadeo),
    // pero solo dentro de la misma tabla: otra tabla tiene otras columnas.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === conn && previousQuery.queryKey[2] === table
        ? keepPreviousData(previous)
        : undefined,
  })
}
