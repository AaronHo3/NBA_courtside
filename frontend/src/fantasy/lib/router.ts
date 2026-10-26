// Minimal hash router. The session id lives in the query string (`?session=<id>`) so a reload restores it:
//   http://127.0.0.1:5173/?session=abc123#/draft
import { useMemo, useSyncExternalStore } from 'react'
import { onLocationChange } from './hashQuery'

export type Route = 'setup' | 'draft' | 'health' | 'recap' | 'season' | 'performers'

export interface Location {
  route: Route
  sessionId: string | null
}

const ROUTES: Route[] = ['setup', 'draft', 'health', 'recap', 'season', 'performers']

export function parseLocation(search: string, hash: string): Location {
  const sessionId = new URLSearchParams(search).get('session')
  const name = hash.replace(/^#\/?/, '').split('?')[0]
  const route = (ROUTES as string[]).includes(name) ? (name as Route) : sessionId ? 'draft' : 'setup'
  return { route, sessionId: sessionId || null }
}

export function buildUrl(route: Route, sessionId: string | null): string {
  const q = sessionId ? `?session=${encodeURIComponent(sessionId)}` : ''
  return `${window.location.pathname}${q}#/${route}`
}

/** Copilot screens addressable from outside the copilot (research pages link here through `src/lib/fantasyBridge`). */
export type FantasyRoute = Route

/** Absolute URL of a copilot screen for a session, keeping the hash-router format: `/fantasy?session=S#/route?k=v`. */
export function fantasyHref(route: FantasyRoute, sessionId: string | null, query?: Record<string, string>): string {
  const q = sessionId ? `?session=${encodeURIComponent(sessionId)}` : ''
  const hq = query && Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : ''
  return `/fantasy${q}#/${route}${hq}`
}

export function navigate(route: Route, sessionId: string | null, replace = false): void {
  const url = buildUrl(route, sessionId)
  if (replace) window.history.replaceState(null, '', url)
  else window.history.pushState(null, '', url)
  window.dispatchEvent(new Event('locationchange'))
}

const currentUrlKey = () => `${window.location.search}${window.location.hash}`

/**
 * The current copilot location. Follows hash edits, back/forward, `navigate()` and hash-query writes
 * (subscribed events), and React Router navigations: those use pushState without an event, so the
 * shell announces them with `locationchange`, and the URL is also re-read whenever this re-renders.
 */
export function useLocation(): Location {
  const key = useSyncExternalStore(onLocationChange, currentUrlKey)
  return useMemo(() => {
    const at = key.indexOf('#')
    return at < 0 ? parseLocation(key, '') : parseLocation(key.slice(0, at), key.slice(at))
  }, [key])
}
