import { useQuery } from '@tanstack/react-query'
import { api } from '@/fantasy/api/client'
import type { PerformersResponse, PredictionsResponse, SeasonOverview } from '@/fantasy/api/types'
import { useFantasyContext } from '@/lib/fantasyBridge'

/** Everything the Overview needs from the copilot, keyed so the season screens share the cache. */
export function useOverviewData() {
  const ctx = useFantasyContext()
  const sid = ctx.sessionId
  const ready = Boolean(sid) && ctx.isComplete
  const overview = useQuery<SeasonOverview>({ queryKey: ['fantasy', 'overview', sid], enabled: ready, queryFn: () => api.seasonOverview(sid!), staleTime: 60_000 })
  const linked = overview.data?.linked ?? false
  const userId = overview.data?.power.find((p) => p.is_user)?.manager_id ?? null
  const performers = useQuery<PerformersResponse>({
    queryKey: ['fantasy', 'performers', sid, userId, 'week'],
    enabled: ready && linked && Boolean(userId),
    queryFn: () => api.seasonPerformers(sid!, userId!, null),
    staleTime: 60_000,
  })
  const predictions = useQuery<PredictionsResponse>({ queryKey: ['fantasy', 'predictions', sid], enabled: ready && linked, queryFn: () => api.seasonPredictions(sid!), staleTime: 60_000 })
  return { ctx, overview, performers, predictions, userId, linked }
}
