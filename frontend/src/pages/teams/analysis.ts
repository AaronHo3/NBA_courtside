import type { LineupRow, RosterRow, TeamSeasonDetail } from '@/lib/types'

/** Pure helpers behind the Teams pages. No React, no fetching: everything here is unit-tested. */

type Pair = [number | null | undefined, number | null | undefined]
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function keptPairs(pairs: readonly Pair[]): Array<[number, number]> {
  return pairs.filter((p): p is [number, number] => finite(p[0]) && finite(p[1]))
}

/** Pearson correlation over complete pairs. r is null when fewer than three pairs or either side has no variance. */
export function pearson(pairs: readonly Pair[]): { r: number | null; n: number } {
  const kept = keptPairs(pairs)
  const n = kept.length
  if (n < 3) return { r: null, n }
  const mx = kept.reduce((s, [x]) => s + x, 0) / n
  const my = kept.reduce((s, [, y]) => s + y, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (const [x, y] of kept) {
    sxy += (x - mx) * (y - my)
    sxx += (x - mx) ** 2
    syy += (y - my) ** 2
  }
  if (sxx === 0 || syy === 0) return { r: null, n }
  return { r: sxy / Math.sqrt(sxx * syy), n }
}

/** Ordinary least squares y = slope·x + intercept over complete pairs; null when the fit is undefined. */
export function linearFit(pairs: readonly Pair[]): { slope: number; intercept: number } | null {
  const kept = keptPairs(pairs)
  if (kept.length < 3) return null
  const n = kept.length
  const mx = kept.reduce((s, [x]) => s + x, 0) / n
  const my = kept.reduce((s, [, y]) => s + y, 0) / n
  let sxy = 0, sxx = 0
  for (const [x, y] of kept) {
    sxy += (x - mx) * (y - my)
    sxx += (x - mx) ** 2
  }
  if (sxx === 0) return null
  const slope = sxy / sxx
  return { slope, intercept: my - slope * mx }
}

export type ShareRow = { player_id: number | null; label: string; fullName: string; shareMin: number; sharePts: number; min: number; pts: number }

function surname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return parts[parts.length - 1] || fullName
}

/** Surname labels, with a first initial added wherever two players share a surname. */
function shortLabels(names: readonly string[]): string[] {
  const counts = new Map<string, number>()
  for (const n of names) counts.set(surname(n), (counts.get(surname(n)) ?? 0) + 1)
  return names.map((n) => ((counts.get(surname(n)) ?? 0) > 1 ? `${n.trim()[0]}. ${surname(n)}` : surname(n)))
}

/**
 * Shares of additive team totals (minutes, points) per player, sorted by minutes, with the tail folded into "Others".
 * Shares are recomputed from totals so they always sum to one across the rows shown; ratios are never shared this way.
 */
export function shareRows(roster: readonly RosterRow[], topN: number): ShareRow[] {
  const totalMin = roster.reduce((s, r) => s + (finite(r.min) ? r.min : 0), 0)
  const totalPts = roster.reduce((s, r) => s + (finite(r.pts) ? r.pts : 0), 0)
  const sorted = [...roster].sort((a, b) => (finite(b.min) ? b.min : 0) - (finite(a.min) ? a.min : 0))
  const labels = shortLabels(sorted.map((r) => r.full_name))
  const toRow = (r: RosterRow, i: number): ShareRow => {
    const min = finite(r.min) ? r.min : 0
    const pts = finite(r.pts) ? r.pts : 0
    return { player_id: r.player_id, label: labels[i], fullName: r.full_name, min, pts, shareMin: totalMin > 0 ? min / totalMin : 0, sharePts: totalPts > 0 ? pts / totalPts : 0 }
  }
  const rows = sorted.map(toRow)
  const head = rows.slice(0, topN)
  const tail = rows.slice(topN)
  if (!tail.length) return head
  const others: ShareRow = {
    player_id: null,
    label: `Others (${tail.length})`,
    fullName: tail.map((t) => t.fullName).join(', '),
    min: tail.reduce((s, t) => s + t.min, 0),
    pts: tail.reduce((s, t) => s + t.pts, 0),
    shareMin: tail.reduce((s, t) => s + t.shareMin, 0),
    sharePts: tail.reduce((s, t) => s + t.sharePts, 0),
  }
  return [...head, others]
}

export type StintBar = {
  player_id: number
  name: string
  start: string | null
  end: string | null
  durationMs: number
  min: number
  gp: number
  seasonStints: number
  traded: boolean
  /** Bar thickness in category units, scaled by minutes (0.2 … 0.9). */
  width: number
}

const DAY_MS = 86_400_000
const MIN_WIDTH = 0.2
const MAX_WIDTH = 0.9

const isoDay = (s: string | null): string | null => (s ? s.slice(0, 10) : null)

/** Map stint rows to Gantt bars (first_game … last_game). hasDates is false when a season has no game logs. */
export function stintBars(stints: TeamSeasonDetail['stints'], tradedIds: ReadonlySet<number>): { bars: StintBar[]; hasDates: boolean } {
  const maxMin = Math.max(0, ...stints.map((s) => (finite(s.min) ? s.min : 0)))
  const bars = stints.map((s): StintBar => {
    const start = isoDay(s.first_game)
    const end = isoDay(s.last_game)
    const span = start && end ? Date.parse(end) - Date.parse(start) : 0
    const min = finite(s.min) ? s.min : 0
    return {
      player_id: s.player_id,
      name: s.full_name,
      start,
      end,
      durationMs: start && end ? Math.max(span, DAY_MS) : 0,
      min,
      gp: s.gp,
      seasonStints: s.season_stints,
      traded: tradedIds.has(s.player_id) || s.season_stints > 1,
      width: maxMin > 0 ? MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * (min / maxMin) : MIN_WIDTH,
    }
  })
  const sorted = [...bars].sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || b.min - a.min)
  return { bars: sorted, hasDates: sorted.length > 0 && sorted.every((b) => b.start !== null && b.end !== null) }
}

/** Lineups with at least `minPoss` possessions (null possessions are never shown), most-used first. */
export function filterLineups(lineups: readonly LineupRow[], minPoss: number): LineupRow[] {
  const threshold = Number.isFinite(minPoss) && minPoss > 0 ? minPoss : 0
  return lineups
    .filter((l) => finite(l.poss) && l.poss >= threshold)
    .sort((a, b) => (b.poss ?? 0) - (a.poss ?? 0))
}

export type LabelPosition = 'top center' | 'bottom center' | 'middle right' | 'middle left' | 'top right' | 'top left' | 'bottom right' | 'bottom left'
const CANDIDATES: LabelPosition[] = ['top center', 'bottom center', 'middle right', 'middle left', 'top right', 'top left', 'bottom right', 'bottom left']
type Box = { x0: number; x1: number; y0: number; y1: number }

const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))

/**
 * Greedy direct-label placement for a scatter. Points are in normalised [0,1] axis space; every point's marker is an
 * obstacle, and each label takes the first of eight sides whose box touches neither a marker nor an earlier label.
 * When every side collides, the side with the least overlap wins.
 */
export function labelPositions(points: ReadonlyArray<{ x: number; y: number }>, box = { w: 0.08, h: 0.05 }, marker = 0.012): LabelPosition[] {
  const obstacles: Box[] = points.map((p) => ({ x0: p.x - marker, x1: p.x + marker, y0: p.y - marker, y1: p.y + marker }))
  const boxFor = (p: { x: number; y: number }, pos: LabelPosition): Box => {
    const dx = pos.endsWith('right') ? box.w / 2 + marker : pos.endsWith('left') ? -(box.w / 2 + marker) : 0
    const dy = pos.startsWith('top') ? box.h / 2 + marker : pos.startsWith('bottom') ? -(box.h / 2 + marker) : 0
    return { x0: p.x + dx - box.w / 2, x1: p.x + dx + box.w / 2, y0: p.y + dy - box.h / 2, y1: p.y + dy + box.h / 2 }
  }
  return points.map((p, i) => {
    const others = obstacles.filter((_, j) => j !== i)
    const scored = CANDIDATES.map((c) => { const b = boxFor(p, c); return { c, b, cost: others.reduce((s, o) => s + overlapArea(b, o), 0) } })
    const best = scored.reduce((a, b) => (b.cost < a.cost ? b : a))
    obstacles.push(best.b)
    return best.c
  })
}

/** 1-based rank of `value` among `values` (ties share the better rank); null when value is missing. */
export function rankOf(value: number | null | undefined, values: ReadonlyArray<number | null | undefined>, higherIsBetter: boolean): { rank: number; of: number } | null {
  if (!finite(value)) return null
  const kept = values.filter(finite)
  const better = kept.filter((v) => (higherIsBetter ? v > value : v < value)).length
  return { rank: better + 1, of: kept.length }
}
