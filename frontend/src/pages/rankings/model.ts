/**
 * Pure helpers for the rankings page: the URL codec for custom composites, weight normalisation,
 * overlap warnings and CSV shaping. No React here so everything is unit-testable.
 */
import type { Contribution, Metric, RankingMeta, RankingRow } from '@/lib/types'

export type ComponentDraft = { metric: string; weight: number; higher_is_better: boolean }

export const CUSTOM_LENS = 'custom'
export const MAX_COMPONENTS = 8
export const MIN_WEIGHT = 0
export const MAX_WEIGHT = 3
export const WEIGHT_STEP = 0.25
export const TOP_N_OPTIONS = [10, 25, 50] as const
export type TopN = (typeof TOP_N_OPTIONS)[number]

/** Encode components as `metric:weight:dir,…` where dir is `h` (higher is better) or `l`. */
export function encodeComponents(components: ReadonlyArray<ComponentDraft>): string {
  return components.map((c) => `${c.metric}:${trimNumber(c.weight)}:${c.higher_is_better ? 'h' : 'l'}`).join(',')
}

/** Decode the URL form; malformed or duplicate entries are dropped rather than throwing. */
export function decodeComponents(raw: string | null | undefined): ComponentDraft[] {
  if (!raw) return []
  const seen = new Set<string>()
  const out: ComponentDraft[] = []
  for (const part of raw.split(',')) {
    const [metric, weightRaw, dirRaw] = part.split(':')
    if (!metric || !/^[a-z0-9_]+$/i.test(metric) || seen.has(metric)) continue
    const weight = Number(weightRaw)
    if (!Number.isFinite(weight) || weight < 0) continue
    const dir = (dirRaw ?? 'h').toLowerCase()
    if (dir !== 'h' && dir !== 'l') continue
    seen.add(metric)
    out.push({ metric, weight, higher_is_better: dir === 'h' })
  }
  return out.slice(0, MAX_COMPONENTS)
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4)))
}

/** Weights as shares summing to 1 (the server does the same). All-zero weights yield all zeros. */
export function normalizeWeights<T extends { weight: number }>(components: ReadonlyArray<T>): number[] {
  const total = components.reduce((s, c) => s + Math.max(0, c.weight), 0)
  if (total <= 0) return components.map(() => 0)
  return components.map((c) => Math.max(0, c.weight) / total)
}

export function totalWeightIsPositive(components: ReadonlyArray<{ weight: number }>): boolean {
  return components.reduce((s, c) => s + Math.max(0, c.weight), 0) > 0
}

/** Pairs that measure largely the same thing; choosing both double-counts it. Order-free. */
export const OVERLAP_PAIRS: ReadonlyArray<readonly [string, string, string]> = [
  ['pts', 'fgm', 'Points are mostly made field goals; the same baskets count twice.'],
  ['ts_pct', 'efg_pct', 'True shooting extends effective FG% with free throws; the two move together.'],
  ['reb', 'reb_pct', 'Rebound % is rebounds divided by available rebounds; volume is counted twice.'],
  ['ast', 'ast_pct', 'Assist % is assists divided by teammate field goals; volume is counted twice.'],
  ['off_rating', 'net_rating', 'Net rating is offensive minus defensive rating, so it already contains ORtg.'],
  ['def_rating', 'net_rating', 'Net rating is offensive minus defensive rating, so it already contains DRtg.'],
]

export type OverlapWarning = { a: string; b: string; reason: string }

/** Overlap warnings for the chosen set; pairs are reported once regardless of order. */
export function detectOverlaps(components: ReadonlyArray<{ metric: string }>): OverlapWarning[] {
  const chosen = new Set(components.map((c) => c.metric))
  return OVERLAP_PAIRS.filter(([a, b]) => chosen.has(a) && chosen.has(b)).map(([a, b, reason]) => ({ a, b, reason }))
}

/** Metrics a user may add to a composite: everything in the catalog except context columns. */
export function selectableMetrics(catalog: ReadonlyArray<Metric>, chosen: ReadonlyArray<{ metric: string }>): Metric[] {
  const taken = new Set(chosen.map((c) => c.metric))
  return catalog.filter((m) => m.kind !== 'context' && !taken.has(m.key))
}

export function addComponent(components: ReadonlyArray<ComponentDraft>, metric: Metric): ComponentDraft[] {
  if (components.length >= MAX_COMPONENTS || components.some((c) => c.metric === metric.key)) return [...components]
  return [...components, { metric: metric.key, weight: 1, higher_is_better: metric.higher_is_better !== false }]
}

export function removeComponent(components: ReadonlyArray<ComponentDraft>, metric: string): ComponentDraft[] {
  return components.filter((c) => c.metric !== metric)
}

export function updateComponent(components: ReadonlyArray<ComponentDraft>, metric: string, patch: Partial<ComponentDraft>): ComponentDraft[] {
  return components.map((c) => (c.metric === metric ? { ...c, ...patch } : c))
}

/** Flat rows for CSV export: identity, score, each raw value and each contribution. */
export function csvRows(rows: ReadonlyArray<RankingRow>, meta: RankingMeta | undefined): Record<string, unknown>[] {
  const metrics = (meta?.components ?? []).map((c) => c.metric)
  return rows.map((r) => {
    const byMetric = new Map<string, Contribution>(r.contributions.map((c) => [c.metric, c]))
    const base: Record<string, unknown> = {
      rank: r.rank,
      player_id: r.player_id,
      player: r.full_name,
      team: r.team_abbreviation,
      position: r.position,
      gp: r.gp,
      min: r.min,
      score: r.score,
      eligible: r.eligible,
      missing: r.missing,
    }
    const raw = Object.fromEntries(metrics.map((m) => [m, r[m] ?? null]))
    const norm = Object.fromEntries(metrics.map((m) => [`${m}_normalized`, byMetric.get(m)?.normalized ?? null]))
    const contrib = Object.fromEntries(metrics.map((m) => [`${m}_contribution`, byMetric.get(m)?.contribution ?? null]))
    return { ...base, ...raw, ...norm, ...contrib }
  })
}

/** Normalised-value label by method; percentiles are 0–100, z-scores signed. */
export function formatNormalized(value: number, method: 'percentile' | 'zscore'): string {
  return method === 'percentile' ? `${value.toFixed(1)}th pct` : `z ${value >= 0 ? '+' : ''}${value.toFixed(2)}`
}

export function formatScore(value: number | null | undefined, method: 'percentile' | 'zscore'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '–'
  return method === 'percentile' ? value.toFixed(1) : `${value >= 0 ? '+' : ''}${value.toFixed(2)}`
}
