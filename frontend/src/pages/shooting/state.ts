import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useNumberParam, useParam } from '@/lib/urlState'
import { useSeason } from '@/hooks/useSeason'
import { useStatus } from '@/hooks/useApi'
import type { QueryValue } from '@/lib/api'
import type { AccuracyMetric, RangePreset } from '@/components/court/colour'
import { selectionFromParam, selectionToParam, type CourtLayer, type CourtSelection, type FrequencyEncoding, type MarkerFilter } from '@/components/court/types'

export type SubjectKind = 'player' | 'team'
export type Subject = { kind: SubjectKind; id: number; season: string }
export type CompareMode = 'none' | 'player' | 'season' | 'team'
export type View = 'single' | 'side' | 'diff'

export const FILTER_KEYS = ['opp', 'period', 'st', 'made', 'dmin', 'dmax', 'from', 'to', 'zone', 'action', 'home'] as const
export type FilterKey = (typeof FILTER_KEYS)[number]
export type Filters = Record<FilterKey, string>

/** Translate URL filter values into `/api/analytics/shots/*` query params. */
export function filtersToParams(f: Filters): Record<string, QueryValue> {
  return {
    opponent_team_id: f.opp || undefined,
    period: f.period || undefined,
    shot_type: f.st || undefined,
    made: f.made === 'made' ? true : f.made === 'missed' ? false : undefined,
    min_distance: f.dmin || undefined,
    max_distance: f.dmax || undefined,
    date_from: f.from || undefined,
    date_to: f.to || undefined,
    zone_basic: f.zone || undefined,
    action_type: f.action || undefined,
    home: f.home === 'home' ? true : f.home === 'away' ? false : undefined,
  }
}

export function subjectParams(s: Subject, seasonType: string, f: Filters): Record<string, QueryValue> {
  return { season: s.season, season_type: seasonType, [s.kind === 'player' ? 'player_id' : 'team_id']: s.id, ...filtersToParams(f) }
}

const num = (v: string) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null }

/** Every piece of view-defining state for the lab lives in the URL. */
export function useShootingState() {
  const { season, seasonType, seasons } = useSeason()
  const status = useStatus()
  const [sp, setSp] = useSearchParams()

  const [player, setPlayer] = useParam('player')
  const [team, setTeam] = useParam('team')
  const [cmp, setCmp] = useParam('cmp', 'none')
  const [playerB, setPlayerB] = useParam('player_b')
  const [teamB, setTeamB] = useParam('team_b')
  const [seasonB, setSeasonB] = useParam('season_b')
  const [view, setView] = useParam('view', 'single')
  const [layer, setLayer] = useParam('layer', 'hex')
  const [metric, setMetric] = useParam('metric', 'fg_pct')
  const [encoding, setEncoding] = useParam('enc', 'size')
  const [range, setRange] = useParam('range', 'standard')
  const [minAttempts, setMinAttempts] = useNumberParam('min', 5)
  const [sizeFt, setSizeFt] = useNumberParam('hex', 1.5)
  const [hideLow, setHideLowRaw] = useParam('hidelow', '0')
  const [markers, setMarkers] = useParam('mk', 'both')
  const [selRaw, setSelRaw] = useParam('sel')
  const [shotRaw, setShotRaw] = useParam('shot')

  const filters = useMemo(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, sp.get(k) ?? ''])) as Filters, [sp])
  const setFilter = useCallback((key: FilterKey, value: string) => {
    setSp((prev) => { const n = new URLSearchParams(prev); if (value) n.set(key, value); else n.delete(key); n.delete('sel'); return n }, { replace: true })
  }, [setSp])
  const resetFilters = useCallback(() => {
    setSp((prev) => { const n = new URLSearchParams(prev); for (const k of FILTER_KEYS) n.delete(k); n.delete('sel'); return n }, { replace: true })
  }, [setSp])

  const subjectA: Subject | null = useMemo(() => {
    const p = num(player)
    if (p) return { kind: 'player', id: p, season }
    const tm = num(team)
    return tm ? { kind: 'team', id: tm, season } : null
  }, [player, team, season])

  const compareMode = (['none', 'player', 'season', 'team'].includes(cmp) ? cmp : 'none') as CompareMode
  const subjectB: Subject | null = useMemo(() => {
    if (!subjectA) return null
    if (compareMode === 'player') { const p = num(playerB); return p ? { kind: 'player', id: p, season: seasonB || season } : null }
    if (compareMode === 'team') { const tm = num(teamB); return tm ? { kind: 'team', id: tm, season: seasonB || season } : null }
    if (compareMode === 'season') return seasonB && seasonB !== season ? { ...subjectA, season: seasonB } : null
    return null
  }, [subjectA, compareMode, playerB, teamB, seasonB, season])

  const chooseA = useCallback((kind: SubjectKind, id: number | null) => {
    setSp((prev) => {
      const n = new URLSearchParams(prev)
      n.delete('player'); n.delete('team'); n.delete('sel')
      if (id) n.set(kind, String(id))
      return n
    }, { replace: true })
  }, [setSp])

  /** Seasons for which the current season type has shot detail, from the status coverage map. */
  const seasonsWithShots = useMemo(() => {
    const cov = status.data?.data.coverage ?? {}
    return seasons.filter((s) => { const v = cov[s]?.[seasonType]?.shots; return v === 'ok' || v === 'partial' })
  }, [status.data, seasons, seasonType])

  const selected = useMemo(() => (selRaw ? selectionFromParam(selRaw) : null), [selRaw])
  const setSelected = useCallback((sel: CourtSelection | null) => setSelRaw(selectionToParam(sel)), [setSelRaw])

  const selectedShot = useMemo(() => {
    const [g, e] = shotRaw.split(':')
    const id = Number(e)
    return g && Number.isFinite(id) ? { gameId: g, gameEventId: id } : null
  }, [shotRaw])
  const setSelectedShot = useCallback((s: { gameId: string; gameEventId: number } | null) => setShotRaw(s ? `${s.gameId}:${s.gameEventId}` : null), [setShotRaw])

  const effectiveView: View = subjectB ? ((['single', 'side', 'diff'].includes(view) ? view : 'side') as View) : 'single'

  return {
    season, seasonType, seasons, seasonsWithShots,
    subjectA, subjectB, chooseA, player, team, setPlayer, setTeam,
    compareMode, setCmp, playerB, setPlayerB, teamB, setTeamB, seasonB, setSeasonB,
    view: effectiveView, setView,
    layer: (['markers', 'hex', 'zones', 'density'].includes(layer) ? layer : 'hex') as CourtLayer, setLayer,
    metric: (['fg_pct', 'rel_fg_pct', 'pts_per_fga'].includes(metric) ? metric : 'fg_pct') as AccuracyMetric, setMetric,
    encoding: (encoding === 'opacity' ? 'opacity' : 'size') as FrequencyEncoding, setEncoding,
    range: (['narrow', 'standard', 'wide'].includes(range) ? range : 'standard') as RangePreset, setRange,
    minAttempts: Math.min(50, Math.max(1, Math.round(minAttempts))), setMinAttempts,
    sizeFt: Math.min(3, Math.max(1, sizeFt)), setSizeFt,
    hideLow: hideLow === '1', setHideLow: (v: boolean) => setHideLowRaw(v ? '1' : '0'),
    markers: (['made', 'missed', 'both'].includes(markers) ? markers : 'both') as MarkerFilter, setMarkers,
    filters, setFilter, resetFilters,
    selected, setSelected,
    selectedShot, setSelectedShot,
  }
}
export type ShootingState = ReturnType<typeof useShootingState>
