/**
 * Keeps `?ids=` (the shareable source of truth) and the persisted compare store in step.
 * The reducer is pure and tested; the hook wires it to React Router and zustand.
 */
import { useEffect, useRef } from 'react'
import { parseIds, useListParam } from '@/lib/urlState'
import { MAX_COMPARE, useCompare, type ComparePlayer } from '@/store/compare'

export type SyncSnapshot = { url: number[]; store: number[] }
export type SyncAction = { kind: 'none' } | { kind: 'set-store'; ids: number[] } | { kind: 'set-url'; ids: number[] }

const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i])
const clean = (ids: number[]) => [...new Set(ids)].slice(0, MAX_COMPARE)

/**
 * First load: a URL with ids seeds the store; otherwise the persisted store fills the URL.
 * Afterwards whichever side changed since the last step is copied to the other (URL edits win
 * when both moved in the same tick, since the URL is what people share).
 */
export function syncStep(prev: SyncSnapshot | null, next: SyncSnapshot): SyncAction {
  if (prev === null) {
    if (next.url.length) return same(clean(next.url), next.store) ? { kind: 'none' } : { kind: 'set-store', ids: clean(next.url) }
    if (next.store.length) return { kind: 'set-url', ids: clean(next.store) }
    return { kind: 'none' }
  }
  if (!same(prev.url, next.url)) return same(clean(next.url), next.store) ? { kind: 'none' } : { kind: 'set-store', ids: clean(next.url) }
  if (!same(prev.store, next.store)) return same(next.store, next.url) ? { kind: 'none' } : { kind: 'set-url', ids: clean(next.store) }
  return { kind: 'none' }
}

/** Placeholder entry for an id that arrived via URL before its profile loaded. */
export const placeholderPlayer = (id: number): ComparePlayer => ({ player_id: id, full_name: `Player ${id}`, team_abbreviation: null })
export const isPlaceholderName = (p: ComparePlayer) => p.full_name === `Player ${p.player_id}`

export function useCompareSync() {
  const [urlIds, setUrlIds] = useListParam('ids')
  const players = useCompare((s) => s.players)
  const setPlayers = useCompare((s) => s.set)
  const prev = useRef<SyncSnapshot | null>(null)
  const urlKey = urlIds.join(',')
  const storeKey = players.map((p) => p.player_id).join(',')

  useEffect(() => {
    // Read live values rather than the render closure: React StrictMode runs this effect twice with
    // the same closure, and the second run must see the store the first run just wrote.
    const livePlayers = useCompare.getState().players
    const next: SyncSnapshot = { url: parseIds(new URLSearchParams(window.location.search).get('ids')), store: livePlayers.map((p) => p.player_id) }
    const action = syncStep(prev.current, next)
    if (action.kind === 'set-store') {
      const byId = new Map(livePlayers.map((p) => [p.player_id, p]))
      setPlayers(action.ids.map((id) => byId.get(id) ?? placeholderPlayer(id)))
      prev.current = { url: next.url, store: action.ids }
    } else if (action.kind === 'set-url') {
      setUrlIds(action.ids)
      prev.current = { url: action.ids, store: next.store }
    } else {
      prev.current = next
    }
    // keys stand in for the arrays so a fresh array with the same ids does not re-run the effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey, storeKey])

  return { players, overflow: urlIds.length > MAX_COMPARE ? urlIds.length - MAX_COMPARE : 0 }
}
