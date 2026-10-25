import { interpolateLab, piecewise } from 'd3'
import { DIVERGING_DARK, DIVERGING_LIGHT, SEQUENTIAL_BLUE } from '@/components/charts/palette'

/** Accuracy metrics a court can colour by. Points per FGA is field goals only (no free throws). */
export type AccuracyMetric = 'fg_pct' | 'rel_fg_pct' | 'pts_per_fga'
export type RangePreset = 'narrow' | 'standard' | 'wide'
export type Domain = readonly [number, number]

export const METRIC_LABEL: Record<AccuracyMetric, string> = {
  fg_pct: 'FG%',
  rel_fg_pct: 'FG% vs league zone average',
  pts_per_fga: 'Points per FGA (field goals only)',
}
export const METRIC_SHORT: Record<AccuracyMetric, string> = { fg_pct: 'FG%', rel_fg_pct: 'Rel FG%', pts_per_fga: 'Pts/FGA' }

const DOMAINS: Record<AccuracyMetric, Record<RangePreset, Domain>> = {
  fg_pct: { narrow: [0.35, 0.65], standard: [0.25, 0.75], wide: [0, 1] },
  rel_fg_pct: { narrow: [-0.1, 0.1], standard: [-0.15, 0.15], wide: [-0.25, 0.25] },
  pts_per_fga: { narrow: [0.8, 1.4], standard: [0.6, 1.6], wide: [0.4, 1.8] },
}
const DIFF_DOMAINS: Record<AccuracyMetric, Record<RangePreset, Domain>> = {
  fg_pct: { narrow: [-0.1, 0.1], standard: [-0.15, 0.15], wide: [-0.25, 0.25] },
  rel_fg_pct: { narrow: [-0.1, 0.1], standard: [-0.15, 0.15], wide: [-0.25, 0.25] },
  pts_per_fga: { narrow: [-0.2, 0.2], standard: [-0.3, 0.3], wide: [-0.5, 0.5] },
}

/** Fixed colour domain for a metric. Never derived from the data, so subjects share one scale. */
export function colourDomain(metric: AccuracyMetric, preset: RangePreset, diff = false): Domain {
  return (diff ? DIFF_DOMAINS : DOMAINS)[metric][preset]
}

export const isDiverging = (metric: AccuracyMetric, diff = false) => diff || metric === 'rel_fg_pct'

export function clampToDomain(v: number, [lo, hi]: Domain): number {
  return Math.min(hi, Math.max(lo, v))
}

/** 0..1 position of a value inside the domain, clamped at the ends. */
export function normalise(v: number, domain: Domain): number {
  const [lo, hi] = domain
  if (hi === lo) return 0.5
  return (clampToDomain(v, domain) - lo) / (hi - lo)
}

export type ColourScale = { colour: (v: number | null | undefined) => string | null; stops: string[]; diverging: boolean }

export function makeColourScale(metric: AccuracyMetric, domain: Domain, theme: 'dark' | 'light', diff = false): ColourScale {
  const diverging = isDiverging(metric, diff)
  const stops = diverging ? (theme === 'dark' ? DIVERGING_DARK : DIVERGING_LIGHT) : SEQUENTIAL_BLUE
  const interp = piecewise(interpolateLab, stops)
  return {
    colour: (v) => (v === null || v === undefined || Number.isNaN(v) ? null : interp(normalise(v, domain))),
    stops,
    diverging,
  }
}

/** Hexagon size as a share of full size: sqrt scale with a 35% floor so sparse bins stay visible. */
export const MIN_HEX_SCALE = 0.35
export function frequencyToScale(frequency: number, maxFrequency: number): number {
  if (!(maxFrequency > 0) || !(frequency > 0)) return MIN_HEX_SCALE
  return MIN_HEX_SCALE + (1 - MIN_HEX_SCALE) * Math.sqrt(Math.min(1, frequency / maxFrequency))
}
/** Opacity encoding for frequency: 0.25..1 on a sqrt scale. */
export function frequencyToOpacity(frequency: number, maxFrequency: number): number {
  if (!(maxFrequency > 0) || !(frequency > 0)) return 0.25
  return 0.25 + 0.75 * Math.sqrt(Math.min(1, frequency / maxFrequency))
}

export function formatMetricValue(metric: AccuracyMetric, v: number | null | undefined, signed = false): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '–'
  if (metric === 'pts_per_fga') return `${signed && v > 0 ? '+' : ''}${v.toFixed(2)}`
  const pts = v * 100
  const sign = (signed || metric === 'rel_fg_pct') && pts > 0 ? '+' : ''
  return `${sign}${pts.toFixed(1)}${metric === 'rel_fg_pct' || signed ? ' pts' : '%'}`
}
