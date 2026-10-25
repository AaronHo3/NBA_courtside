import type { MatchupRow } from '@/lib/types'
import { buildHeatmapMatrix, chartRows, colourCap, extremes, isLowSample, opponentOf, priorText, qualifyingRows, seasonsWithMatchups, shrinkFgPct, shrinkageText, type HeatmapCell } from './helpers'

function row(over: Partial<MatchupRow>): MatchupRow {
  return {
    season: '2025-26', season_type: 'Regular Season',
    off_player_id: 1, off_player_name: 'Scorer', off_position: 'G',
    def_player_id: 2, def_player_name: 'Defender', def_position: 'F',
    gp: 1, matchup_min: 5, partial_poss: 20, player_pts: 10, team_pts: 20,
    matchup_ast: 0, matchup_tov: 0, matchup_blk: 0, matchup_fgm: 5, matchup_fga: 10,
    matchup_fg3m: 0, matchup_fg3a: 0, matchup_ftm: 0, matchup_fta: 0, sfl: 0,
    fg_pct: 0.5, fg3_pct: null, fg_pct_shrunk: 0.5, ci_low: 0.2, ci_high: 0.8,
    pts_per_poss: 0.5, team_pts_per_poss: 1, qualifies: true,
    ...over,
  }
}

describe('qualifying filter and extremes', () => {
  const rows = [
    row({ def_player_id: 10, def_player_name: 'Few poss', partial_poss: 4, pts_per_poss: 0.1 }),
    row({ def_player_id: 11, def_player_name: 'Low', partial_poss: 12, pts_per_poss: 0.6 }),
    row({ def_player_id: 12, def_player_name: 'High', partial_poss: 30, pts_per_poss: 1.4 }),
    row({ def_player_id: 13, def_player_name: 'Mid', partial_poss: 25, pts_per_poss: 0.9 }),
    row({ def_player_id: 14, def_player_name: 'No rate', partial_poss: 50, pts_per_poss: null }),
  ]
  it('keeps only rows at or above the possession threshold', () => {
    expect(qualifyingRows(rows, 10).map((r) => r.def_player_id)).toEqual([11, 12, 13, 14])
    expect(qualifyingRows(rows, 25).map((r) => r.def_player_id)).toEqual([12, 13, 14])
    expect(qualifyingRows(rows, 999)).toEqual([])
  })
  it('does not mutate the input order', () => {
    const before = rows.map((r) => r.def_player_id)
    extremes(rows, 10)
    expect(rows.map((r) => r.def_player_id)).toEqual(before)
  })
  it('finds lowest and highest observed efficiency among qualifying rows only', () => {
    const { lowest, highest } = extremes(rows, 10)
    expect(lowest?.def_player_name).toBe('Low')
    expect(highest?.def_player_name).toBe('High')
    expect(extremes(rows, 999)).toEqual({ lowest: null, highest: null })
  })
  it('limits chart rows to the most-sampled before sorting by metric', () => {
    const kept = chartRows(rows, 10, 'pts_per_poss', 2)
    expect(kept.map((r) => r.def_player_name)).toEqual(['Mid', 'High'])
    expect(chartRows(rows, 10, 'pts_per_poss', null).map((r) => r.pts_per_poss)).toEqual([0.6, 0.9, 1.4])
  })
  it('resolves the opponent relative to the view', () => {
    expect(opponentOf(rows[0], 'offense')).toEqual({ id: 10, name: 'Few poss', position: 'F' })
    expect(opponentOf(rows[0], 'defense')).toEqual({ id: 1, name: 'Scorer', position: 'G' })
  })
})

describe('heatmap matrix construction', () => {
  const offense = [
    { player_id: 1, full_name: 'A', position: 'G' },
    { player_id: 2, full_name: 'B', position: 'F' },
    { player_id: 3, full_name: 'C (no cells)', position: 'C' },
  ]
  const defense = [
    { player_id: 9, full_name: 'X', position: 'G' },
    { player_id: 8, full_name: 'Y', position: 'F' },
  ]
  const cell = (off: number, def: number, poss: number, ppp: number | null, low = false): HeatmapCell => ({
    off_player_id: off, def_player_id: def, partial_poss: poss, player_pts: poss * (ppp ?? 0), pts_per_poss: ppp, fg_pct: 0.5, matchup_fga: 4, matchup_fgm: 2, low_sample: low,
  })
  const cells = [cell(1, 9, 30, 1.2), cell(1, 8, 3, 0.4, true), cell(2, 8, 12, 0.9)]

  it('fills missing pairs with null, not zero, and orders axes by sample', () => {
    const m = buildHeatmapMatrix(offense, defense, cells, 12)
    expect(m.offense.map((p) => p.full_name)).toEqual(['A', 'B'])
    expect(m.defense.map((p) => p.full_name)).toEqual(['X', 'Y'])
    expect(m.z).toEqual([[1.2, 0.4], [null, 0.9]])
    expect(m.low).toEqual([[false, true], [false, false]])
    expect(m.cells[1][0]).toBeNull()
    expect(m.truncated).toEqual({ offense: 0, defense: 0 })
  })
  it('truncates each axis to the limit and reports how many were dropped', () => {
    const m = buildHeatmapMatrix(offense, defense, cells, 1)
    expect(m.offense.map((p) => p.player_id)).toEqual([1])
    expect(m.defense.map((p) => p.player_id)).toEqual([9])
    expect(m.z).toEqual([[1.2]])
    expect(m.truncated).toEqual({ offense: 1, defense: 1 })
  })
  it('caps the colour scale at the adequately-sampled maximum, ignoring low-sample outliers', () => {
    expect(colourCap([[5, 1.2], [null, 0.9]], [[true, false], [false, false]])).toBe(1.5)
    expect(colourCap([[1.8, 1.2]], [[false, false]])).toBe(1.8)
    expect(colourCap([[3.1]], [[false]])).toBe(2.0)
    expect(colourCap([], [])).toBe(1.5)
  })
  it('returns an empty matrix for no cells', () => {
    const m = buildHeatmapMatrix(offense, defense, [], 12)
    expect(m.z).toEqual([])
    expect(m.offense).toEqual([])
  })
})

describe('shrinkage display', () => {
  it('shrinks toward the prior by the prior strength in attempts', () => {
    expect(shrinkFgPct(14, 26, { mean: 0.4928464267, strength: 25 })).toBeCloseTo(0.5161011896, 6)
    expect(shrinkFgPct(0, 0, { mean: 0.5, strength: 0 })).toBeNull()
    expect(shrinkFgPct(null, 10, { mean: 0.5, strength: 25 })).toBeNull()
  })
  it('always prints raw and shrunk together', () => {
    expect(shrinkageText(0.5384615385, 0.5161011896)).toBe('53.8% raw · 51.6% shrunk')
    expect(shrinkageText(null, null)).toBe('– raw · – shrunk')
  })
  it('describes the prior with its mean and strength in attempts', () => {
    expect(priorText({ mean: 0.4928, strength: 25 })).toBe('Prior: league matchup FG% 49.3%, strength 25 attempts')
    expect(priorText(null)).toBe('Prior unavailable')
  })
  it('marks low samples by attempts', () => {
    expect(isLowSample({ matchup_fga: 3 })).toBe(true)
    expect(isLowSample({ matchup_fga: null })).toBe(true)
    expect(isLowSample({ matchup_fga: 12 })).toBe(false)
  })
})

describe('season coverage', () => {
  it('lists only seasons whose matchups are loaded, newest first', () => {
    const coverage = {
      '2023-24': { 'Regular Season': { matchups: 'ok' } },
      '2025-26': { 'Regular Season': { matchups: 'partial' } },
      '2019-20': { 'Regular Season': { matchups: 'missing' } },
      '2024-25': { Playoffs: { matchups: 'ok' } },
    }
    expect(seasonsWithMatchups(coverage, 'Regular Season')).toEqual(['2025-26', '2023-24'])
    expect(seasonsWithMatchups(undefined, 'Regular Season')).toEqual([])
  })
})
