/**
 * Pure helpers for the Compare page. Every function here is side-effect free and tested in
 * math.test.ts. Denominators of zero or missing values always yield null, never NaN/Infinity.
 */
import type { Normalization, PlayerSeasonRow } from '@/lib/types'

export type Num = number | null | undefined
type Rec = Record<string, unknown>

export function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export function safeDiv(a: Num, b: Num): number | null {
  const x = num(a)
  const y = num(b)
  if (x === null || y === null || y === 0) return null
  return x / y
}

/** FT weight used by the server for true shooting; kept identical for client-side TOV%. */
export const TS_FTA_WEIGHT = 0.44

export const fg3aRate = (r: Rec) => safeDiv(num(r.fg3a), num(r.fga))
export const ftaRate = (r: Rec) => safeDiv(num(r.fta), num(r.fga))
export const shootingPct = (made: Num, attempted: Num) => safeDiv(made, attempted)
export const astTo = (r: Rec) => safeDiv(num(r.ast), num(r.tov))
/** Turnover share of plays: TOV / (FGA + 0.44·FTA + TOV), as a fraction like the provider's TOV%. */
export function tovPct(r: Rec): number | null {
  const tov = num(r.tov)
  const fga = num(r.fga)
  const fta = num(r.fta)
  if (tov === null || fga === null || fta === null) return null
  const plays = fga + TS_FTA_WEIGHT * fta + tov
  return safeDiv(tov, plays)
}

type Denoms = { gp: Num; min: Num; poss: Num }

/** Rescale a season total the same way the server does (per_36 = x/min·36, per_100 = x/poss·100). */
export function normalizeCounting(value: Num, r: Denoms, norm: Normalization): number | null {
  const v = num(value)
  if (v === null) return null
  switch (norm) {
    case 'totals':
      return v
    case 'per_game':
      return safeDiv(v, r.gp)
    case 'per_36': {
      const d = safeDiv(v, r.min)
      return d === null ? null : d * 36
    }
    case 'per_100': {
      const d = safeDiv(v, r.poss)
      return d === null ? null : d * 100
    }
  }
}

/** Index of the best value given direction; null when direction is unknown, nothing is present, or the best is tied. */
export function bestIndex(values: Num[], higherIsBetter: boolean | null): number | null {
  if (higherIsBetter === null) return null
  let best: number | null = null
  let bestVal = 0
  let tied = false
  values.forEach((raw, i) => {
    const v = num(raw)
    if (v === null) return
    if (best === null) { best = i; bestVal = v; return }
    const better = higherIsBetter ? v > bestVal : v < bestVal
    if (better) { best = i; bestVal = v; tied = false }
    else if (v === bestVal) tied = true
  })
  return tied ? null : best
}

/** Competition ranking (1,1,3) within the group; nulls get null. Unknown direction ranks descending. */
export function rankInGroup(values: Num[], higherIsBetter: boolean | null): Array<number | null> {
  const present = values.map((v) => num(v))
  return present.map((v) => {
    if (v === null) return null
    const ahead = present.filter((o) => o !== null && (higherIsBetter === false ? o < v : o > v)).length
    return ahead + 1
  })
}

/**
 * Mid-rank percentile of `value` within `cohort` (0–100). Lower-is-better metrics are flipped so a
 * high percentile is always good. Unknown direction is treated as ascending (share at or below).
 */
export function percentileRank(cohort: Num[], value: Num, higherIsBetter: boolean | null): number | null {
  const v = num(value)
  const xs = cohort.map((c) => num(c)).filter((c): c is number => c !== null)
  if (v === null || xs.length === 0) return null
  let below = 0
  let equal = 0
  for (const x of xs) {
    if (x < v) below++
    else if (x === v) equal++
  }
  const above = xs.length - below - equal
  const better = higherIsBetter === false ? above : below
  return ((better + 0.5 * equal) / xs.length) * 100
}

/** The row that stands for a season: the aggregate (traded players) or the single stint. */
export function seasonRowFor<T extends { season: string; is_aggregate: boolean }>(rows: T[], season: string): T | null {
  const inSeason = rows.filter((r) => r.season === season)
  if (!inSeason.length) return null
  return inSeason.find((r) => r.is_aggregate) ?? inSeason[0]
}

/** One representative row per season, in season order. */
export function seasonSeries<T extends { season: string; is_aggregate: boolean }>(rows: T[]): T[] {
  const seasons = [...new Set(rows.map((r) => r.season))].sort()
  return seasons.map((s) => seasonRowFor(rows, s)).filter((r): r is T => r !== null)
}

export type AlignMode = 'season' | 'age' | 'career_year'
export type TrajectoryPoint = { x: string | number; y: number | null; season: string; team: string | null }

/** Build x/y points for a trajectory line in the requested alignment. Career year 1 = first season on record. */
export function alignTrajectory(rows: PlayerSeasonRow[], mode: AlignMode, metric: (r: PlayerSeasonRow) => number | null): TrajectoryPoint[] {
  const series = seasonSeries(rows)
  const points: TrajectoryPoint[] = []
  series.forEach((r, i) => {
    const y = metric(r)
    const team = r.team_abbreviation ?? null
    if (mode === 'season') points.push({ x: r.season, y, season: r.season, team })
    else if (mode === 'career_year') points.push({ x: i + 1, y, season: r.season, team })
    else {
      const age = num(r.age)
      if (age !== null) points.push({ x: age, y, season: r.season, team })
    }
  })
  return points
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((p) => p[0]?.toUpperCase() ?? '').join('').slice(0, 3)
export const surname = (name: string) => name.trim().split(/\s+/).slice(-1)[0] ?? name

export const ordinalSuffix = (n: number) => {
  const r = Math.round(n)
  const v = r % 100
  if (v >= 11 && v <= 13) return `${r}th`
  return `${r}${['th', 'st', 'nd', 'rd'][r % 10] ?? 'th'}`
}
