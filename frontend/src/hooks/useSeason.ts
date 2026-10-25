import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStatus } from './useApi'
import type { SeasonType } from '@/lib/types'

/** Global season context: ?season=2024-25&type=Regular%20Season, defaulting to the server's default. */
export function useSeason() {
  const status = useStatus()
  const [sp, setSp] = useSearchParams()
  const season = sp.get('season') ?? status.data?.data.default_season ?? ''
  const seasonType = (sp.get('type') as SeasonType | null) ?? status.data?.data.default_season_type ?? 'Regular Season'
  const setSeason = useCallback(
    (s: string) => setSp((prev) => { const n = new URLSearchParams(prev); n.set('season', s); return n }, { replace: true }),
    [setSp],
  )
  const setSeasonType = useCallback(
    (t: SeasonType) => setSp((prev) => { const n = new URLSearchParams(prev); n.set('type', t); return n }, { replace: true }),
    [setSp],
  )
  const coverage = status.data?.data.coverage?.[season]?.[seasonType] ?? {}
  const has = (family: string) => coverage[family] === 'ok' || coverage[family] === 'partial'
  return { season, seasonType, setSeason, setSeasonType, seasons: status.data?.data.seasons ?? [], seasonTypes: status.data?.data.season_types ?? [], coverage, has, ready: Boolean(season) }
}
