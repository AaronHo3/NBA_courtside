import type { Normalization, PlayerProfile, PlayerSeasonRow } from '@/lib/types'

/** Counting stats stored as season totals that rescale with the normalisation. `min` is handled separately. */
export const COUNTING_KEYS = ['pts', 'reb', 'ast', 'oreb', 'dreb', 'stl', 'blk', 'tov', 'pf', 'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta', 'plus_minus', 'poss'] as const

/** Anything a season row may hold; only finite numbers count. */
type Numeric = unknown

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Safe ratio: null when either side is missing or the denominator is zero. */
export function ratio(numerator: Numeric, denominator: Numeric, scale = 1): number | null {
  const n = num(numerator)
  const d = num(denominator)
  if (n === null || d === null || d === 0) return null
  return (n / d) * scale
}

/** Share of field-goal attempts that were threes. */
export function fg3aRate(fg3a: Numeric, fga: Numeric): number | null {
  return ratio(fg3a, fga)
}

/** Combine wingspan over combine height without shoes; never mixes in roster height. */
export function wingspanRatio(wingspanIn: Numeric, heightWoShoesIn: Numeric): number | null {
  return ratio(wingspanIn, heightWoShoesIn)
}

export type ProfileNormalization = Extract<Normalization, 'totals' | 'per_game' | 'per_36'>

/**
 * Rescale a season row's counting totals client-side. Returns a new object; percentages and rates
 * are untouched. per_game = total / gp; per_36 = total / min × 36. `min` becomes minutes per game
 * under per_game and stays a total otherwise.
 */
export function rescaleRow<T extends Record<string, unknown>>(row: T, normalization: ProfileNormalization): T {
  if (normalization === 'totals') return { ...row }
  const gp = num(row.gp)
  const min = num(row.min)
  const out: Record<string, unknown> = { ...row, normalization }
  for (const key of COUNTING_KEYS) {
    if (!(key in row)) continue
    const total = num(row[key])
    out[key] = normalization === 'per_game' ? ratio(total, gp) : ratio(total, min, 36)
  }
  out.min = normalization === 'per_game' ? ratio(min, gp) : min
  return out as T
}

export type TimelineStint = PlayerProfile['timeline'][number]
export type TimelineSeason = { season: string; stints: TimelineStint[]; traded: boolean; gp: number; min: number }

/** Group stints by season, in season order; a season with more than one stint is a traded season. */
export function groupTimeline(timeline: TimelineStint[]): TimelineSeason[] {
  const bySeason = new Map<string, TimelineStint[]>()
  for (const t of timeline) bySeason.set(t.season, [...(bySeason.get(t.season) ?? []), t])
  return [...bySeason.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([season, stints]) => ({
      season,
      stints,
      traded: stints.length > 1,
      gp: stints.reduce((s, t) => s + (num(t.gp) ?? 0), 0),
      min: stints.reduce((s, t) => s + (num(t.min) ?? 0), 0),
    }))
}

/** Distinct teams in order of first appearance, so each keeps one palette slot across the page. */
export function teamOrder(timeline: TimelineStint[]): string[] {
  const seen: string[] = []
  for (const t of [...timeline].sort((a, b) => a.season.localeCompare(b.season))) {
    if (!seen.includes(t.team_abbreviation)) seen.push(t.team_abbreviation)
  }
  return seen
}

/** The row that represents a whole season: the TOT aggregate when traded, else the single stint row. */
export function seasonRows(rows: PlayerSeasonRow[]): PlayerSeasonRow[] {
  const bySeason = new Map<string, PlayerSeasonRow[]>()
  for (const r of rows) bySeason.set(r.season, [...(bySeason.get(r.season) ?? []), r])
  return [...bySeason.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => group.find((r) => r.is_aggregate) ?? group[0])
}

/** Seasons the player has rows for, newest first. */
export function playedSeasons(rows: PlayerSeasonRow[]): string[] {
  return [...new Set(rows.map((r) => r.season))].sort((a, b) => b.localeCompare(a))
}

/** Season in focus: the requested one if played, else the global one if played, else the latest played. */
export function resolveFocusSeason(requested: string, global: string, played: string[]): string {
  if (requested && played.includes(requested)) return requested
  if (global && played.includes(global)) return global
  return played[0] ?? global
}

/** Whole years between an ISO birthdate and `now`. */
export function ageFromBirthdate(birthdate: string | null | undefined, now = new Date()): number | null {
  if (!birthdate) return null
  const b = new Date(birthdate)
  if (Number.isNaN(b.getTime())) return null
  let age = now.getFullYear() - b.getFullYear()
  const beforeBirthday = now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())
  if (beforeBirthday) age -= 1
  return age
}

/** 2016 → "2016-17". */
export function seasonLabelFromYear(year: number | null | undefined): string | null {
  if (year === null || year === undefined || !Number.isFinite(year)) return null
  return `${year}-${String(year + 1).slice(2)}`
}

export function draftText(bio: { draft_year: number | null; draft_round: number | null; draft_number: number | null }): string {
  if (bio.draft_year === null) return 'Undrafted'
  const parts = [`Drafted ${bio.draft_year}`]
  if (bio.draft_round !== null) parts.push(`round ${bio.draft_round}`)
  if (bio.draft_number !== null) parts.push(`pick ${bio.draft_number}`)
  return parts.join(', ')
}
