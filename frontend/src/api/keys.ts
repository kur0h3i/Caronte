import type { RowsParams } from './types'

// Claves de caché de TanStack Query: todo lo que cambia la respuesta forma parte de la clave.
export const keys = {
  me: ['me'] as const,
  connections: ['connections'] as const,
  tables: (conn: string) => ['tables', conn] as const,
  meta: (conn: string, table: string) => ['meta', conn, table] as const,
  rows: (conn: string, table: string, params: RowsParams) => ['rows', conn, table, params] as const,
}
