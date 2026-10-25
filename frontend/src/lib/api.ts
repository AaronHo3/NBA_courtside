/**
 * Typed client for the analytics service envelope: { success, data, error, meta }.
 *
 * Courtside fronts two services. Every analytics path is written as `/api/analytics/...`; the Vite
 * dev proxy (frontend/vite.config.ts) strips the `/analytics` segment before forwarding, so the
 * service itself still serves its original `/api/...` routes. The fantasy service will get its own
 * client under `/api/fantasy/...` (different error shape: `{ code, message, detail }`).
 */

export type Envelope<T, M = Record<string, unknown>> = {
  success: boolean
  data: T
  error: string | null
  meta: M
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export type QueryValue = string | number | boolean | null | undefined | Array<string | number>

export function buildQuery(params?: Record<string, QueryValue>): string {
  if (!params) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) {
      if (v.length) sp.set(k, v.join(','))
    } else sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export async function apiGet<T, M = Record<string, unknown>>(
  path: string,
  params?: Record<string, QueryValue>,
  signal?: AbortSignal,
): Promise<Envelope<T, M>> {
  const res = await fetch(`${path}${buildQuery(params)}`, { signal, headers: { Accept: 'application/json' } })
  return unwrap<T, M>(res)
}

export async function apiPost<T, M = Record<string, unknown>>(path: string, body: unknown): Promise<Envelope<T, M>> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  return unwrap<T, M>(res)
}

/** Any JSON method (POST, PATCH, PUT, DELETE); the body is omitted when undefined. */
export async function apiSend<T, M = Record<string, unknown>>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<Envelope<T, M>> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? { Accept: 'application/json' } : { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return unwrap<T, M>(res)
}

export async function unwrap<T, M>(res: Response): Promise<Envelope<T, M>> {
  let body: Envelope<T, M> | null = null
  try {
    body = (await res.json()) as Envelope<T, M>
  } catch {
    /* non-JSON */
  }
  if (!res.ok || !body || !body.success) {
    throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status)
  }
  return body
}

export function csvUrl(path: string, params?: Record<string, QueryValue>): string {
  return `${path}${buildQuery(params)}`
}

/** Multipart upload (files never go through JSON); the server answers with the usual envelope. */
export async function apiUpload<T, M = Record<string, unknown>>(path: string, form: FormData): Promise<Envelope<T, M>> {
  const res = await fetch(path, { method: 'POST', body: form, headers: { Accept: 'application/json' } })
  return unwrap<T, M>(res)
}
