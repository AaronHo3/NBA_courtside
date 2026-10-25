import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBoolParam, useNumberParam, useParam, useResetParams } from '@/lib/urlState'
import type { Normalization } from '@/lib/types'
import { NONE, type Preset } from './helpers'

export const DEFAULTS = {
  minGp: 10,
  minMinutes: 100,
  normalization: 'per_game' as Normalization,
  x: 'usg_pct',
  y: 'ts_pct',
  size: 'pts',
  color: NONE,
} as const

const NORMALIZATIONS: Normalization[] = ['totals', 'per_game', 'per_36', 'per_100']

/** Explorer params carried in the URL. Keys are short so shared links stay readable. */
export const PARAM_KEYS = {
  team: 'team',
  position: 'pos',
  minGp: 'min_gp',
  minMinutes: 'min_min',
  ageMin: 'age_min',
  ageMax: 'age_max',
  normalization: 'norm',
  query: 'q',
  x: 'x',
  y: 'y',
  size: 'size',
  color: 'color',
  medians: 'medians',
  selected: 'sel',
  tableFilter: 'tq',
} as const

/** Whether a stored normalization value is one the API accepts. */
export function parseNormalization(raw: string): Normalization {
  return (NORMALIZATIONS as string[]).includes(raw) ? (raw as Normalization) : DEFAULTS.normalization
}

/**
 * All view-defining League Explorer state, read from and written to the URL.
 * Multi-key updates (presets) go through `setMany` so one event writes one history entry.
 */
export function useExplorerState() {
  const [, setSp] = useSearchParams()
  const [teamId, setTeamId] = useNumberParam(PARAM_KEYS.team, 0)
  const [position, setPosition] = useParam(PARAM_KEYS.position, '')
  const [minGp, setMinGp] = useNumberParam(PARAM_KEYS.minGp, DEFAULTS.minGp)
  const [minMinutes, setMinMinutes] = useNumberParam(PARAM_KEYS.minMinutes, DEFAULTS.minMinutes)
  const [ageMin, setAgeMin] = useNumberParam(PARAM_KEYS.ageMin, 0)
  const [ageMax, setAgeMax] = useNumberParam(PARAM_KEYS.ageMax, 0)
  const [normRaw, setNormRaw] = useParam(PARAM_KEYS.normalization, DEFAULTS.normalization)
  const [query, setQuery] = useParam(PARAM_KEYS.query, '')
  const [x, setX] = useParam(PARAM_KEYS.x, DEFAULTS.x)
  const [y, setY] = useParam(PARAM_KEYS.y, DEFAULTS.y)
  const [size, setSize] = useParam(PARAM_KEYS.size, DEFAULTS.size)
  const [color, setColor] = useParam(PARAM_KEYS.color, DEFAULTS.color)
  const [medians, setMedians] = useBoolParam(PARAM_KEYS.medians, false)
  const [selected, setSelected] = useNumberParam(PARAM_KEYS.selected, 0)
  const [tableFilter, setTableFilter] = useParam(PARAM_KEYS.tableFilter, '')
  const reset = useResetParams()

  const normalization = parseNormalization(normRaw)
  const setNormalization = useCallback((n: Normalization) => setNormRaw(n), [setNormRaw])

  const setMany = useCallback(
    (patch: Record<string, string | null>) =>
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '') next.delete(k)
            else next.set(k, v)
          }
          return next
        },
        { replace: true },
      ),
    [setSp],
  )

  const applyPreset = useCallback(
    (p: Preset) => setMany({ [PARAM_KEYS.x]: p.x, [PARAM_KEYS.y]: p.y, [PARAM_KEYS.size]: p.size === NONE ? null : p.size, [PARAM_KEYS.color]: p.color === NONE ? null : p.color }),
    [setMany],
  )

  const relaxThresholds = useCallback(() => setMany({ [PARAM_KEYS.minGp]: '0', [PARAM_KEYS.minMinutes]: '0' }), [setMany])

  /** Query params for /api/league/explorer and its CSV twin (season context is added by the caller). */
  const apiFilters = useMemo(
    () => ({
      normalization,
      team_id: teamId > 0 ? teamId : undefined,
      position: position || undefined,
      min_gp: minGp,
      min_minutes: minMinutes,
      age_min: ageMin > 0 ? ageMin : undefined,
      age_max: ageMax > 0 ? ageMax : undefined,
      q: query.trim() || undefined,
    }),
    [normalization, teamId, position, minGp, minMinutes, ageMin, ageMax, query],
  )

  const isDefaultFilters =
    teamId === 0 && !position && minGp === DEFAULTS.minGp && minMinutes === DEFAULTS.minMinutes && ageMin === 0 && ageMax === 0 && normalization === DEFAULTS.normalization && !query

  return {
    teamId, setTeamId,
    position, setPosition,
    minGp, setMinGp,
    minMinutes, setMinMinutes,
    ageMin, setAgeMin,
    ageMax, setAgeMax,
    normalization, setNormalization,
    query, setQuery,
    x, setX,
    y, setY,
    size, setSize,
    color, setColor,
    medians, setMedians,
    selected: selected > 0 ? selected : null,
    setSelected: (id: number | null) => setSelected(id && id > 0 ? id : null),
    tableFilter, setTableFilter,
    applyPreset,
    relaxThresholds,
    setMany,
    apiFilters,
    isDefaultFilters,
    reset,
  }
}

export type ExplorerState = ReturnType<typeof useExplorerState>
