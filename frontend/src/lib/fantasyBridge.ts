/**
 * The seam between the NBA research pages and the fantasy copilot. Research pages never import
 * copilot components (their CSS is scoped); they read the copilot's stores and API through here.
 */
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api, ApiError } from '@/fantasy/api/client'
import type { PlayerView, SessionDetail, SessionSummary, SnapshotMeta } from '@/fantasy/api/types'
import { useDraftStore } from '@/fantasy/store/draftStore'
import { useSeasonStore } from '@/fantasy/store/seasonStore'
import { browserStorage, SESSION_KEY } from '@/fantasy/lib/storage'

export { fantasyHref, type FantasyRoute } from '@/fantasy/lib/router'

/** The NBA person id behind a copilot player, if it has one. */
export function nbaIdOf(p: Pick<PlayerView, 'player_id' | 'nba_id'>): number | null {
  if (p.nba_id != null) return p.nba_id
  const m = /^nba:(\d+)$/.exec(p.player_id)
  return m ? Number(m[1]) : null
}

/** Session id the copilot would restore: the live store first, else what it last saved in localStorage. */
export function useFantasySessionId(): string | null {
  const live = useDraftStore((s) => s.sessionId)
  return live ?? browserStorage.get(SESSION_KEY)
}

/** Session detail straight from the service, for pages where the copilot store has not loaded (NBA routes, Overview). */
export function useFantasySessionDetail(sessionId: string | null) {
  return useQuery<SessionDetail>({ queryKey: ['fantasy', 'session', sessionId], enabled: Boolean(sessionId), queryFn: () => api.getSession(sessionId!), staleTime: 30_000 })
}

function useFantasySnapshotDemo(snapshotId: string | null) {
  const q = useQuery<SnapshotMeta[]>({ queryKey: ['fantasy', 'snapshots'], queryFn: () => api.snapshots(), staleTime: 5 * 60_000, enabled: Boolean(snapshotId) })
  return q.data?.find((s) => s.snapshot_id === snapshotId)?.is_demo ?? null
}

/** Context the shell and Overview show: live copilot store when loaded, otherwise the service's view of the session. */
export function useFantasyContext() {
  const sessionId = useFantasySessionId()
  const storeState = useDraftStore((s) => s.state)
  const storeName = useDraftStore((s) => s.sessionName)
  const storeSnapshot = useDraftStore((s) => s.snapshot)
  const storeSnapshotId = useDraftStore((s) => s.snapshotId)
  const detail = useFantasySessionDetail(storeState ? null : sessionId)
  const state = storeState ?? detail.data?.state ?? null
  const snapshotId = storeSnapshotId ?? detail.data?.meta.snapshot_id ?? null
  const demoFromList = useFantasySnapshotDemo(storeSnapshot ? null : snapshotId)
  const leagueName = useSeasonStore((s) => s.overview?.league_name ?? null)
  const syncedAt = useSeasonStore((s) => s.overview?.synced_at ?? null)
  const period = useSeasonStore((s) => s.overview?.current_period ?? null)
  // The saved id points at a session the service cannot return (deleted, or an id from another store):
  // treat it as "no session open" instead of a draft in progress.
  const missing = Boolean(sessionId) && !storeState && detail.isError
  const gone = missing && detail.error instanceof ApiError && detail.error.status === 404
  useEffect(() => {
    // Forget the id only when the service says it does not exist; a transient error keeps it for the next visit.
    if (gone && browserStorage.get(SESSION_KEY) === sessionId) browserStorage.remove(SESSION_KEY)
  }, [gone, sessionId])
  if (missing) {
    return { sessionId: null, sessionName: null, isComplete: false, linked: false, isDemo: false, snapshotId: null, leagueName: null, syncedAt: null, period: null, isLoading: false, missing: true }
  }
  return {
    sessionId,
    sessionName: storeName ?? detail.data?.meta.name ?? null,
    isComplete: state?.is_complete ?? false,
    linked: state?.league.espn_league_id != null,
    isDemo: storeSnapshot?.is_demo ?? demoFromList ?? false,
    snapshotId,
    leagueName,
    syncedAt,
    period,
    isLoading: Boolean(sessionId) && !state && detail.isLoading,
    missing: false,
  }
}

export function useFantasySessions() {
  return useQuery<SessionSummary[]>({ queryKey: ['fantasy', 'sessions'], queryFn: () => api.listSessions(), staleTime: 30_000 })
}

/** Every player in the active snapshot, indexed by NBA id (one request per snapshot; ~600 rows). */
export function useFantasyPlayersByNba(snapshotId: string | null, sessionId: string | null) {
  return useQuery({
    queryKey: ['fantasy', 'players-by-nba', snapshotId, sessionId],
    enabled: Boolean(snapshotId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const rows = await api.players(snapshotId!, { limit: 2000, sessionId: sessionId ?? undefined })
      const byNba = new Map<number, PlayerView>()
      for (const r of rows) {
        const id = nbaIdOf(r)
        if (id != null) byNba.set(id, r)
      }
      return byNba
    },
  })
}

/** The copilot's view of an NBA player (eligibility, ownership, projection) when a session is open. */
export function useFantasyPlayer(nbaId: number | null) {
  const { snapshotId, sessionId } = useFantasyContext()
  const q = useFantasyPlayersByNba(snapshotId, sessionId)
  const player = nbaId != null && q.data ? (q.data.get(nbaId) ?? null) : null
  return { player, isLoading: q.isLoading, hasSession: Boolean(snapshotId), sessionId }
}
