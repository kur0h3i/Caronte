import type { Connection, RowsParams, RowsResponse, TableMeta, TableSummary, User } from './types'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function errorMessage(body: unknown, resp: Response): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  // Errores de validación de FastAPI (422): lista de {msg, loc...}
  if (Array.isArray(detail)) return detail.map((d: { msg?: string }) => d.msg).join('; ')
  return `${resp.status} ${resp.statusText}`
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(`/api${path}`, {
    ...init,
    // La cookie de sesión es HttpOnly: el navegador la envía solo, JS nunca la ve.
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (resp.status === 204) return undefined as T
  const body: unknown = await resp.json().catch(() => null)
  if (!resp.ok) throw new ApiError(resp.status, errorMessage(body, resp))
  return body as T
}

const seg = encodeURIComponent

export const api = {
  me: () => request<User>('/auth/me'),
  login: (username: string, password: string) =>
    request<User>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  connections: () => request<Connection[]>('/connections'),
  tables: (conn: string) => request<TableSummary[]>(`/connections/${seg(conn)}/tables`),
  meta: (conn: string, table: string) =>
    request<TableMeta>(`/connections/${seg(conn)}/tables/${seg(table)}/meta`),
  rows: (conn: string, table: string, params: RowsParams, signal?: AbortSignal) => {
    const qs = new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) })
    if (params.sort) qs.set('sort', params.sort)
    if (params.filters?.length) qs.set('filters', JSON.stringify(params.filters))
    return request<RowsResponse>(`/connections/${seg(conn)}/tables/${seg(table)}/rows?${qs}`, {
      signal,
    })
  },
}
