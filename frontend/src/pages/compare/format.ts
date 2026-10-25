/** Display helpers for Compare cells. Text only; charts and tables share these so values never disagree. */
import { formatNumber, formatPct, formatSigned, inchesToFtIn } from '@/lib/format'
import type { Normalization } from '@/lib/types'
import { ordinalSuffix } from './math'
import type { MetricSpec } from './metrics'
import type { MetricCell, PopulationKind } from './model'
import { primaryPosition } from './model'

export function formatCellValue(spec: MetricSpec, v: number | null | undefined, norm: Normalization, opts?: { long?: boolean }): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–'
  if (spec.kind === 'pct') return formatPct(v, spec.decimals)
  if (spec.unit === 'in') return opts?.long ? `${inchesToFtIn(v)} (${formatNumber(v, spec.decimals)} in)` : inchesToFtIn(v)
  if (spec.unit === '%') return `${formatNumber(v, spec.decimals)}%`
  if (spec.unit === 'lb') return `${formatNumber(v, 0)} lb`
  const d = spec.kind === 'counting' && norm === 'totals' ? 0 : spec.decimals
  return spec.signed ? formatSigned(v, d) : formatNumber(v, d)
}

export function cohortNoun(kind: PopulationKind, position: string | null): string {
  if (kind === 'group') return 'in this group'
  if (kind === 'position') {
    const pos = primaryPosition(position)
    return pos ? `players listed at ${pos}` : 'positional peers (position unknown)'
  }
  return 'qualified players'
}

export function percentileText(cell: MetricCell, kind: PopulationKind, position: string | null): string {
  if (cell.percentile === null) return 'No percentile: missing value or empty cohort'
  return `${ordinalSuffix(cell.percentile)} percentile of ${cell.cohortSize} ${cohortNoun(kind, position)}`
}

export function rankText(cell: MetricCell, groupSize: number, isBest: boolean): string {
  if (cell.rank === null) return 'No value this season'
  return `Rank ${cell.rank} of ${groupSize} in group${isBest ? ' (best)' : ''}`
}

export const MIN_MINUTES_OPTIONS = [0, 250, 500, 1000, 1500]
export const minMinutesLabel = (m: number) => (m === 0 ? 'Any minutes' : `${m.toLocaleString()}+ minutes`)
