import { formatMetric, isNil, metricLabelWithNorm } from '@/lib/format'
import type { Metric, MetricKind, Normalization, PlayerRow } from '@/lib/types'

/** Sentinel used in URL params and selects for "no metric". */
export const NONE = 'none'
/** Sentinel for colouring by listed position. */
export const POSITION = 'position'

export const KIND_ORDER: MetricKind[] = ['counting', 'pct', 'rate', 'rating', 'physical', 'context']
export const KIND_LABEL: Record<MetricKind, string> = {
  counting: 'Counting',
  pct: 'Shooting percentages',
  rate: 'Rates',
  rating: 'Ratings',
  physical: 'Physical',
  context: 'Context',
}

/** Primary positions, in the fixed order that also fixes their categorical colours. */
export const POSITIONS = ['G', 'F', 'C'] as const
export type PrimaryPosition = (typeof POSITIONS)[number]

/** "G-F" → "G", "F-C" → "F"; unknown or missing → null. */
export function primaryPosition(position: string | null | undefined): PrimaryPosition | null {
  const first = position?.trim().charAt(0).toUpperCase()
  return POSITIONS.find((p) => p === first) ?? null
}

export type MetricOption = { key: string; label: string }
export type MetricGroup = { kind: MetricKind; label: string; options: MetricOption[] }

/** Catalog metrics that are numeric in at least one row, grouped by kind in the fixed kind order. */
export function groupMetricOptions(metrics: Metric[], rows: PlayerRow[], normalization: Normalization): MetricGroup[] {
  const present = new Set<string>()
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) if (typeof v === 'number' && Number.isFinite(v)) present.add(k)
  }
  const rowsEmpty = rows.length === 0
  return KIND_ORDER.map((kind) => ({
    kind,
    label: KIND_LABEL[kind],
    options: metrics
      .filter((m) => m.kind === kind && (rowsEmpty || present.has(m.key)))
      .map((m) => ({ key: m.key, label: metricLabelWithNorm(m, m.key, normalization) })),
  })).filter((g) => g.options.length > 0)
}

/** Keep the first `max` ids, deduplicated and in order; report how many were dropped. */
export function clampSelection(ids: number[], max: number): { kept: number[]; dropped: number } {
  const unique = ids.filter((id, i) => Number.isFinite(id) && id > 0 && ids.indexOf(id) === i)
  return { kept: unique.slice(0, max), dropped: Math.max(0, unique.length - max) }
}

export function median(values: Array<number | null | undefined>): number | null {
  const xs = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b)
  if (!xs.length) return null
  const mid = Math.floor(xs.length / 2)
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2
}

export function numeric(row: PlayerRow, key: string): number | null {
  const v = row[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Value formatted with the catalog's decimals plus a unit suffix where the catalog gives one. */
export function formatWithUnit(value: unknown, metric: Metric | undefined): string {
  if (isNil(value)) return '–'
  const base = formatMetric(value, metric)
  if (!metric?.unit || metric.kind === 'pct') return base
  return metric.unit === '%' ? `${base}%` : `${base} ${metric.unit}`
}

export type Preset = {
  key: string
  label: string
  x: string
  y: string
  size: string
  color: string
  note?: string
}

export const PRESETS: Preset[] = [
  { key: 'usage-ts', label: 'Usage vs true shooting', x: 'usg_pct', y: 'ts_pct', size: 'pts', color: NONE },
  { key: 'volume-eff', label: 'Volume vs efficiency', x: 'fga', y: 'ts_pct', size: NONE, color: NONE },
  { key: 'ast-tov', label: 'Assists vs turnovers', x: 'ast', y: 'tov', size: NONE, color: NONE },
  { key: 'off-def', label: 'Offense vs defense', x: 'off_rating', y: 'def_rating', size: 'min', color: NONE, note: 'Lower defensive rating is better, so that axis is reversed: up and right is good on both.' },
  { key: 'age-pts', label: 'Age vs productivity', x: 'age', y: 'pts', size: 'min', color: NONE },
  { key: 'wing-blk', label: 'Wingspan vs block rate', x: 'wingspan_in', y: 'blk', size: NONE, color: POSITION, note: 'Wingspan comes from combine anthropometrics, so only players who were measured appear; the rest are hidden from the plot but stay in the table.' },
  { key: 'min-onoff', label: 'On/off vs minutes', x: 'min', y: 'on_off_net', size: NONE, color: NONE, note: 'On/off net rating exists only for seasons with lineup data (2023-24 onward in this dataset) and not for traded players\' pooled rows.' },
]

/** The preset whose axes match the current state, if any. */
export function activePreset(state: { x: string; y: string; size: string; color: string }): Preset | undefined {
  return PRESETS.find((p) => p.x === state.x && p.y === state.y && p.size === state.size && p.color === state.color)
}

/** Lower-is-better metrics get a reversed axis so "up and right" stays good. */
export function axisReversed(metric: Metric | undefined): boolean {
  return metric?.higher_is_better === false
}

/** Rows below the given thresholds are drawn as low-sample. */
export function isLowSample(row: PlayerRow, minGp: number, minMinutes: number): boolean {
  const gp = row.gp ?? 0
  const totalMin = totalMinutes(row)
  return gp < minGp || totalMin < minMinutes
}

/** `min` is per-game only under per_game; under totals / per 36 / per 100 the API keeps season totals. */
export function totalMinutes(row: PlayerRow): number {
  const min = row.min ?? 0
  return row.normalization === 'per_game' ? min * (row.gp ?? 0) : min
}

/** Column order for the linked table: identity columns, the active axes, then the default set. */
export const DEFAULT_TABLE_METRICS = ['pts', 'reb', 'ast', 'ts_pct', 'efg_pct', 'usg_pct', 'net_rating', 'on_off_net', 'height_in', 'wingspan_in', 'wingspan_height_ratio']
export const IDENTITY_COLUMNS = ['age', 'gp', 'min']

export function tableMetricKeys(active: string[]): string[] {
  const out: string[] = []
  for (const k of [...active, ...DEFAULT_TABLE_METRICS]) {
    if (k === NONE || k === POSITION || IDENTITY_COLUMNS.includes(k) || out.includes(k)) continue
    out.push(k)
  }
  return out
}
