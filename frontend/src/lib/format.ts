import type { Metric, Normalization } from './types'

export function isNil(v: unknown): v is null | undefined {
  return v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))
}

/** Format a metric value using the catalog's kind/decimals. Missing values render as an em-less dash. */
export function formatMetric(value: unknown, metric?: Metric | null, opts?: { signed?: boolean }): string {
  if (isNil(value)) return '–'
  const n = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(n)) return String(value)
  const sign = opts?.signed && n > 0 ? '+' : ''
  if (metric?.kind === 'pct' && n <= 1.5) return `${sign}${(n * 100).toFixed(1)}%`
  const decimals = metric?.decimals ?? (Number.isInteger(n) ? 0 : 1)
  return `${sign}${n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

export function formatPct(value: number | null | undefined, decimals = 1): string {
  return isNil(value) ? '–' : `${(value * 100).toFixed(decimals)}%`
}

export function formatNumber(value: number | null | undefined, decimals = 1): string {
  return isNil(value) ? '–' : value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function formatSigned(value: number | null | undefined, decimals = 1): string {
  if (isNil(value)) return '–'
  return `${value > 0 ? '+' : ''}${value.toFixed(decimals)}`
}

export function inchesToFtIn(inches: number | null | undefined): string {
  if (isNil(inches)) return '–'
  const ft = Math.floor(inches / 12)
  const rem = inches - ft * 12
  const remStr = Number.isInteger(rem) ? String(rem) : rem.toFixed(2).replace(/\.?0+$/, '')
  return `${ft}'${remStr}"`
}

export const NORMALIZATION_LABEL: Record<Normalization, string> = {
  totals: 'Totals',
  per_game: 'Per game',
  per_36: 'Per 36 min',
  per_100: 'Per 100 poss',
}

export function metricLabelWithNorm(metric: Metric | undefined, key: string, normalization: Normalization): string {
  const base = metric?.label ?? key
  if (metric?.kind !== 'counting') return base
  if (key === 'min' || key === 'poss') return normalization === 'per_game' ? `${base} / game` : base
  const suffix = { totals: '', per_game: ' / game', per_36: ' / 36', per_100: ' / 100' }[normalization]
  return `${base}${suffix}`
}

export function seasonShort(season: string): string {
  return season
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

export function wilsonText(low: number | null, high: number | null): string {
  if (isNil(low) || isNil(high)) return ''
  return `${(low * 100).toFixed(0)}–${(high * 100).toFixed(0)}% (95% Wilson)`
}
