/** Data hooks for the Compare page. Query keys match src/hooks/useApi.ts so caches are shared across pages. */
import { keepPreviousData, useQueries } from '@tanstack/react-query'
import { apiGet, type Envelope } from '@/lib/api'
import type { PlayerProfile, ShotMeta, ZoneSummary } from '@/lib/types'
import { useExplorer } from '@/hooks/useApi'

const PROFILE_STALE = 5 * 60_000

export function useProfiles(ids: number[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: ['player', id],
      queryFn: ({ signal }: { signal?: AbortSignal }) => apiGet<PlayerProfile>(`/api/analytics/players/${id}`, undefined, signal),
      staleTime: PROFILE_STALE,
    })),
  })
}

export type ZoneResult = Envelope<ZoneSummary[], ShotMeta>

export function useZoneProfiles(ids: number[], season: string, seasonType: string) {
  return useQueries({
    queries: ids.map((id) => {
      const params = { season, season_type: seasonType, player_id: id }
      return {
        queryKey: ['shots', 'zones', params],
        queryFn: ({ signal }: { signal?: AbortSignal }) => apiGet<ZoneSummary[], ShotMeta>('/api/analytics/shots/zones', params, signal),
        enabled: Boolean(season),
        placeholderData: keepPreviousData,
      }
    }),
  })
}

/** Whole-season population as raw totals; every normalisation and percentile is derived client-side from this. */
export function usePopulationTotals(season: string, seasonType: string) {
  return useExplorer({ season, season_type: seasonType, normalization: 'totals', min_gp: 0, min_minutes: 0 }, Boolean(season))
}
