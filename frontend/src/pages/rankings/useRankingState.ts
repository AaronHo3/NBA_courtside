import { useCallback, useMemo } from 'react'
import { useCustomRanking, useLenses, useMetricIndex, useRanking } from '@/hooks/useApi'
import { useSeason } from '@/hooks/useSeason'
import { useNumberParam, useParam } from '@/lib/urlState'
import type { Lens, LensComponent, RankingMeta, RankingRow } from '@/lib/types'
import { useChartTheme } from '@/components/charts/Plot'
import { CUSTOM_LENS, decodeComponents, encodeComponents, TOP_N_OPTIONS, totalWeightIsPositive, type ComponentDraft, type TopN } from './model'

export type Mode = 'rate' | 'cumulative'
export type Norm = 'percentile' | 'zscore'

export const DEFAULT_LENS = 'balanced'
export const DEFAULT_MIN_GP = 10
export const DEFAULT_MIN_MIN = 100

/**
 * All ranking state lives in the URL: lens, mode, norm, min_gp, min_min, pos, top and, for the
 * custom lens, comps=metric:weight:dir,… so a custom ranking is shareable by link.
 */
export function useRankingState() {
  const { season, seasonType, ready } = useSeason()
  const [lens, setLensRaw] = useParam('lens', DEFAULT_LENS)
  const [mode, setMode] = useParam('mode', 'rate')
  const [norm, setNorm] = useParam('norm', 'percentile')
  const [minGp, setMinGp] = useNumberParam('min_gp', DEFAULT_MIN_GP)
  const [minMin, setMinMin] = useNumberParam('min_min', DEFAULT_MIN_MIN)
  const [position, setPosition] = useParam('pos', '')
  const [compsRaw, setCompsRaw] = useParam('comps', '')
  const [topRaw, setTop] = useNumberParam('top', 25)

  const lenses = useLenses()
  const catalog = useMetricIndex()
  const isCustom = lens === CUSTOM_LENS
  const currentLens: Lens | undefined = lenses.data?.data.find((l) => l.key === lens)
  const components = useMemo(() => decodeComponents(compsRaw), [compsRaw])
  const setComponents = useCallback((next: ComponentDraft[]) => setCompsRaw(next.length ? encodeComponents(next) : null), [setCompsRaw])

  /** Switching to custom seeds the builder from the lens being viewed so the user tweaks, not starts blank. */
  const setLens = useCallback(
    (next: string) => {
      if (next === CUSTOM_LENS && components.length === 0 && currentLens) {
        setCompsRaw(encodeComponents(currentLens.components.map((c) => ({ metric: c.metric, weight: c.weight, higher_is_better: c.higher_is_better }))))
      }
      setLensRaw(next)
    },
    [components.length, currentLens, setCompsRaw, setLensRaw],
  )

  const common = { season, season_type: seasonType, mode, normalization: norm, min_gp: minGp, min_minutes: minMin, position: position || undefined }
  const preset = useRanking({ ...common, lens }, ready && !isCustom)
  const customBody = isCustom && components.length > 0 && totalWeightIsPositive(components) ? { ...common, components } : null
  const custom = useCustomRanking(ready ? customBody : null)
  const query = isCustom ? custom : preset

  const rows: RankingRow[] = query.data?.data ?? []
  const meta: RankingMeta | undefined = query.data?.meta
  const top: TopN = (TOP_N_OPTIONS as ReadonlyArray<number>).includes(topRaw) ? (topRaw as TopN) : 25

  const theme = useChartTheme()
  /** One colour per component in the fixed order the server returns them (max 8). */
  const colors = useMemo(() => {
    const comps: Array<Pick<LensComponent, 'metric'>> = isCustom ? components : (meta?.components ?? currentLens?.components ?? [])
    return new Map(comps.map((c, i) => [c.metric, theme.series[i % theme.series.length]]))
  }, [isCustom, components, meta, currentLens, theme.series])

  return {
    season, seasonType, ready,
    lens, setLens, isCustom, currentLens, lenses: lenses.data?.data ?? [], lensesLoading: lenses.isLoading, disclaimer: lenses.data?.meta.disclaimer,
    mode: mode as Mode, setMode, norm: norm as Norm, setNorm,
    minGp, setMinGp, minMin, setMinMin, position, setPosition,
    components, setComponents, catalog,
    top, setTop,
    query, rows, meta, colors,
    customIncomplete: isCustom && customBody === null,
  }
}

export type RankingState = ReturnType<typeof useRankingState>
