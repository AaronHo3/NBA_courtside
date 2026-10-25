// Page-level selections (tab, week, team) live in the hash query so a reload or a shared link
// restores them: `#/season?tab=power&week=3`. The session id stays in the real query string.
// Every write announces itself with a `locationchange` event so the shell (breadcrumb, sidebar,
// title) and any `useHashQuery` reader re-derive from the URL instead of keeping a private copy.
import { useEffect, useState } from 'react'

export type HashQuery = Record<string, string>

export function readHashQuery(hash: string): HashQuery {
  const q = hash.split('?')[1]
  if (!q) return {}
  const out: HashQuery = {}
  new URLSearchParams(q).forEach((v, k) => {
    out[k] = v
  })
  return out
}

/** New hash with `patch` applied; a null value removes the key. Keys are written in sorted order. */
export function withHashQuery(hash: string, patch: Record<string, string | null>): string {
  const route = hash.split('?')[0] || '#/'
  const next = { ...readHashQuery(hash) }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k]
    else next[k] = v
  }
  const keys = Object.keys(next).sort()
  if (keys.length === 0) return route
  const params = new URLSearchParams()
  for (const k of keys) params.set(k, next[k])
  return `${route}?${params.toString()}`
}

const LOCATION_EVENTS = ['hashchange', 'popstate', 'locationchange'] as const

/** Subscribe to every way the URL can change (browser hash edits, back/forward, in-app writes). */
export function onLocationChange(listener: () => void): () => void {
  for (const e of LOCATION_EVENTS) window.addEventListener(e, listener)
  return () => {
    for (const e of LOCATION_EVENTS) window.removeEventListener(e, listener)
  }
}

/**
 * Apply `patch` to the hash query. `push` adds a history entry (a tab change the back button should
 * undo); otherwise the entry is replaced (filters). Either way a `locationchange` event follows.
 */
export function setHashQuery(patch: Record<string, string | null>, opts: { push?: boolean } = {}): void {
  const next = withHashQuery(window.location.hash, patch)
  const url = `${window.location.pathname}${window.location.search}${next}`
  if (opts.push) {
    if (next !== window.location.hash) window.history.pushState(null, '', url)
  } else window.history.replaceState(null, '', url)
  window.dispatchEvent(new Event('locationchange'))
}

/** Kept for existing callers: same as `setHashQuery(patch)` (replace, then `locationchange`). */
export function replaceHashQuery(patch: Record<string, string | null>): void {
  setHashQuery(patch)
}

/** The current hash query, re-read whenever the location changes. */
export function useHashQuery(): HashQuery {
  const [query, setQuery] = useState<HashQuery>(() => readHashQuery(window.location.hash))
  useEffect(() => {
    const update = () =>
      setQuery((prev) => {
        const next = readHashQuery(window.location.hash)
        return sameQuery(prev, next) ? prev : next
      })
    update()
    return onLocationChange(update)
  }, [])
  return query
}

function sameQuery(a: HashQuery, b: HashQuery): boolean {
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k])
}
