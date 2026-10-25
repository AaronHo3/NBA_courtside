import { formatPct, isNil } from '@/lib/format'
import type { MatchupRow } from '@/lib/types'

export type MatchupView = 'offense' | 'defense'
export type ChartMetric = 'pts_per_poss' | 'fg_pct_shrunk'

export const DEFAULT_MIN_POSS = 10
export const DEFAULT_PRIOR_STRENGTH = 25
export const DEFAULT_HEATMAP_MIN_POSS = 5
export const DEFAULT_HEATMAP_LIMIT = 12
export const LOW_SAMPLE_FGA = 10

export type Prior = { mean: number; strength: number }

/** The "other" player in a row relative to the selected view (defenders when scoring, scorers when defending). */
export function opponentOf(row: MatchupRow, view: MatchupView): { id: number; name: string; position: string | null } {
  return view === 'offense'
    ? { id: row.def_player_id, name: row.def_player_name, position: row.def_position }
    : { id: row.off_player_id, name: row.off_player_name, position: row.off_position }
}

/** Qualification is decided client-side from partial possessions so the threshold feels instant and is testable. */
export function isQualifying(row: Pick<MatchupRow, 'partial_poss'>, minPoss: number): boolean {
  return !isNil(row.partial_poss) && row.partial_poss >= minPoss
}

export function qualifyingRows<T extends Pick<MatchupRow, 'partial_poss'>>(rows: T[], minPoss: number): T[] {
  return rows.filter((r) => isQualifying(r, minPoss))
}

/**
 * Lowest and highest observed efficiency (points per partial possession) among qualifying rows.
 * Returns null for both when nothing qualifies. Never call these a "worst" or "best" matchup.
 */
export function extremes(rows: MatchupRow[], minPoss: number): { lowest: MatchupRow | null; highest: MatchupRow | null } {
  const q = qualifyingRows(rows, minPoss).filter((r) => !isNil(r.pts_per_poss))
  if (!q.length) return { lowest: null, highest: null }
  const sorted = [...q].sort((a, b) => (a.pts_per_poss as number) - (b.pts_per_poss as number))
  return { lowest: sorted[0], highest: sorted[sorted.length - 1] }
}

/** Keep the N most-sampled rows (by partial possessions), then order by the chosen metric ascending. */
export function chartRows(rows: MatchupRow[], minPoss: number, metric: ChartMetric, limit: number | null): MatchupRow[] {
  const q = qualifyingRows(rows, minPoss).filter((r) => !isNil(r[metric]))
  const bySample = [...q].sort((a, b) => (b.partial_poss ?? 0) - (a.partial_poss ?? 0))
  const kept = limit === null ? bySample : bySample.slice(0, limit)
  return [...kept].sort((a, b) => (a[metric] as number) - (b[metric] as number))
}

/** Empirical-Bayes shrinkage toward the league prior: (FGM + mean × k) / (FGA + k). */
export function shrinkFgPct(fgm: number | null, fga: number | null, prior: Prior): number | null {
  if (isNil(fgm) || isNil(fga) || prior.strength < 0) return null
  const denom = fga + prior.strength
  if (denom <= 0) return null
  return (fgm + prior.mean * prior.strength) / denom
}

/** "53.8% raw · 51.6% shrunk" — both numbers always side by side so neither can be read alone. */
export function shrinkageText(raw: number | null, shrunk: number | null): string {
  return `${formatPct(raw)} raw · ${formatPct(shrunk)} shrunk`
}

/** One-line description of the prior that the shrunk column leans on. */
export function priorText(prior: Prior | null | undefined): string {
  if (!prior || isNil(prior.mean) || isNil(prior.strength)) return 'Prior unavailable'
  return `Prior: league matchup FG% ${formatPct(prior.mean)}, strength ${formatNumberShort(prior.strength)} attempts`
}

function formatNumberShort(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** Format points per possession with two decimals. */
export function formatPpp(v: number | null | undefined): string {
  return isNil(v) ? '–' : v.toFixed(2)
}

/** Possessions with up to two decimals and no trailing zeros ("14.5", "22.25", "30"). */
export function formatPoss(v: number | null | undefined): string {
  return isNil(v) ? '–' : String(Number(v.toFixed(2)))
}

export function isLowSample(row: Pick<MatchupRow, 'matchup_fga'>, threshold = LOW_SAMPLE_FGA): boolean {
  return isNil(row.matchup_fga) || row.matchup_fga < threshold
}

/* ---------- Heatmap matrix ---------- */

export type HeatmapPerson = { player_id: number; full_name: string; position: string | null }
export type HeatmapCell = Pick<MatchupRow, 'off_player_id' | 'def_player_id' | 'partial_poss' | 'player_pts' | 'pts_per_poss' | 'fg_pct' | 'matchup_fga' | 'matchup_fgm'> & { low_sample: boolean }

export type HeatmapMatrix = {
  offense: HeatmapPerson[]
  defense: HeatmapPerson[]
  /** z[offenseIndex][defenseIndex]: points per possession, null where the pair never met. */
  z: Array<Array<number | null>>
  cells: Array<Array<HeatmapCell | null>>
  low: Array<Array<boolean>>
  truncated: { offense: number; defense: number }
}

function totalPossBy(cells: HeatmapCell[], key: 'off_player_id' | 'def_player_id'): Map<number, number> {
  return cells.reduce((acc, c) => {
    const id = c[key]
    return new Map(acc).set(id, (acc.get(id) ?? 0) + (c.partial_poss ?? 0))
  }, new Map<number, number>())
}

function topBySample(people: HeatmapPerson[], totals: Map<number, number>, limit: number): HeatmapPerson[] {
  return [...people].sort((a, b) => (totals.get(b.player_id) ?? 0) - (totals.get(a.player_id) ?? 0)).slice(0, limit)
}

/**
 * Build an offense × defense matrix from sparse cells. Players are limited to the `limit` most-sampled
 * on each axis; pairs with no cell are null (rendered as gaps, not zeros).
 */
export function buildHeatmapMatrix(offense: HeatmapPerson[], defense: HeatmapPerson[], cells: HeatmapCell[], limit: number): HeatmapMatrix {
  const offTotals = totalPossBy(cells, 'off_player_id')
  const defTotals = totalPossBy(cells, 'def_player_id')
  const off = topBySample(offense.filter((p) => offTotals.has(p.player_id)), offTotals, limit)
  const def = topBySample(defense.filter((p) => defTotals.has(p.player_id)), defTotals, limit)
  const lookup = new Map(cells.map((c) => [`${c.off_player_id}:${c.def_player_id}`, c]))
  const grid = off.map((o) => def.map((d) => lookup.get(`${o.player_id}:${d.player_id}`) ?? null))
  return {
    offense: off,
    defense: def,
    cells: grid,
    z: grid.map((row) => row.map((c) => (c ? c.pts_per_poss : null))),
    low: grid.map((row) => row.map((c) => Boolean(c?.low_sample))),
    truncated: { offense: Math.max(0, offTotals.size - off.length), defense: Math.max(0, defTotals.size - def.length) },
  }
}

export const HEATMAP_ZMAX_FLOOR = 1.5
export const HEATMAP_ZMAX_CEIL = 2.0

/** Colour scale top: the largest adequately-sampled value, clamped so one tiny-sample outlier cannot wash out the grid. */
export function colourCap(z: Array<Array<number | null>>, low: boolean[][]): number {
  const solid = z.flatMap((row, i) => row.filter((v, j) => v !== null && !low[i]?.[j])) as number[]
  const max = solid.length ? Math.max(...solid) : HEATMAP_ZMAX_FLOOR
  return Math.min(HEATMAP_ZMAX_CEIL, Math.max(HEATMAP_ZMAX_FLOOR, max))
}

/** Seasons whose coverage marks matchups as loaded, newest first. */
export function seasonsWithMatchups(coverage: Record<string, Record<string, Record<string, string>>> | undefined, seasonType: string): string[] {
  if (!coverage) return []
  return Object.keys(coverage)
    .filter((s) => ['ok', 'partial'].includes(coverage[s]?.[seasonType]?.matchups ?? ''))
    .sort((a, b) => b.localeCompare(a))
}
