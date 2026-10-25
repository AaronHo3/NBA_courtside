import { filterLineups, labelPositions, linearFit, pearson, rankOf, shareRows, stintBars } from './analysis'
import type { LineupRow, RosterRow, TeamSeasonDetail } from '@/lib/types'

describe('pearson', () => {
  it('drops pairs with null or NaN and reports n', () => {
    const pairs: Array<[number | null, number | null]> = [[1, 2], [2, 4], [3, 6], [null, 8], [5, null], [Number.NaN, 1]]
    const { r, n } = pearson(pairs)
    expect(n).toBe(3)
    expect(r).toBeCloseTo(1, 6)
  })
  it('returns null r for fewer than three pairs or zero variance', () => {
    expect(pearson([[1, 2], [2, 3]])).toEqual({ r: null, n: 2 })
    expect(pearson([[1, 2], [1, 3], [1, 4]]).r).toBeNull()
  })
  it('detects a negative association', () => {
    const { r } = pearson([[1, 10], [2, 8], [3, 7], [4, 3], [5, 1]])
    expect(r).toBeLessThan(-0.95)
  })
  it('fits a line through the kept pairs', () => {
    const fit = linearFit([[0, 1], [1, 3], [2, 5], [null, 9]])
    expect(fit).not.toBeNull()
    expect(fit!.slope).toBeCloseTo(2)
    expect(fit!.intercept).toBeCloseTo(1)
  })
})

const roster = (rows: Array<Partial<RosterRow> & { player_id: number; full_name: string }>): RosterRow[] =>
  rows.map((r) => ({ team_id: 1, team_abbreviation: 'AAA', position: null, is_aggregate: false, age: null, gp: 10, poss: null, normalization: 'totals', height_in: null, weight_lb: null, wingspan_in: null, standing_reach_in: null, wingspan_height_ratio: null, on_off_net: null, share_min: null, share_pts: null, share_fga: null, share_ast: null, share_reb: null, mpg: null, traded: false, on_net_rating: null, off_net_rating: null, min: 0, pts: 0, ...r }) as RosterRow)

describe('shareRows', () => {
  it('computes additive shares from totals, sorts by minutes and folds the tail into Others', () => {
    const rows = shareRows(roster([
      { player_id: 1, full_name: 'Ann Able', min: 500, pts: 300 },
      { player_id: 2, full_name: 'Bo Baker', min: 300, pts: 100 },
      { player_id: 3, full_name: 'Cy Cole', min: 150, pts: 50 },
      { player_id: 4, full_name: 'Di Dunn', min: 50, pts: 50 },
    ]), 2)
    expect(rows.map((r) => r.label)).toEqual(['Able', 'Baker', 'Others (2)'])
    expect(rows[0].shareMin).toBeCloseTo(0.5)
    expect(rows[0].sharePts).toBeCloseTo(0.6)
    expect(rows[2].shareMin).toBeCloseTo(0.2)
    expect(rows.reduce((s, r) => s + r.shareMin, 0)).toBeCloseTo(1)
    expect(rows.reduce((s, r) => s + r.sharePts, 0)).toBeCloseTo(1)
  })
  it('adds an initial when two players share a surname', () => {
    const rows = shareRows(roster([{ player_id: 1, full_name: 'Orion Quintero', min: 10, pts: 1 }, { player_id: 2, full_name: 'Mia Quintero', min: 5, pts: 1 }]), 5)
    expect(rows.map((r) => r.label)).toEqual(['O. Quintero', 'M. Quintero'])
  })
  it('treats missing totals as zero and never divides by zero', () => {
    const rows = shareRows(roster([{ player_id: 1, full_name: 'Ann Able', min: null as unknown as number, pts: null as unknown as number }]), 5)
    expect(rows).toHaveLength(1)
    expect(rows[0].shareMin).toBe(0)
  })
})

describe('stintBars', () => {
  const stints: TeamSeasonDetail['stints'] = [
    { player_id: 1, full_name: 'Ann Able', team_id: 1, gp: 80, min: 2400, first_game: '2025-10-22T00:00:00', last_game: '2026-04-03T00:00:00', season_stints: 1 },
    { player_id: 2, full_name: 'Bo Baker', team_id: 1, gp: 30, min: 600, first_game: '2025-12-23T00:00:00', last_game: '2026-04-03T00:00:00', season_stints: 2 },
    { player_id: 3, full_name: 'Cy Cole', team_id: 1, gp: 2, min: 10, first_game: '2025-10-22T00:00:00', last_game: '2025-10-22T00:00:00', season_stints: 1 },
  ]
  it('maps stints to dated bars with minute-scaled widths and traded flags', () => {
    const { bars, hasDates } = stintBars(stints, new Set([2]))
    expect(hasDates).toBe(true)
    expect(bars.map((b) => b.name)).toEqual(['Ann Able', 'Cy Cole', 'Bo Baker']) // start date, then minutes
    expect(bars[0].durationMs).toBeGreaterThan(bars[2].durationMs)
    expect(bars[1].durationMs).toBeGreaterThan(0) // one-day stint still visible
    expect(bars[0].width).toBeCloseTo(0.9)
    expect(bars[1].width).toBeCloseTo(0.2, 1)
    expect(bars[2].traded).toBe(true)
    expect(bars[0].traded).toBe(false)
    expect(bars[0].start).toBe('2025-10-22')
  })
  it('reports hasDates=false when any stint lacks game dates', () => {
    const { hasDates, bars } = stintBars([{ ...stints[0], first_game: null, last_game: null }], new Set())
    expect(hasDates).toBe(false)
    expect(bars[0].start).toBeNull()
  })
})

describe('filterLineups', () => {
  const lineup = (id: string, poss: number | null, net: number): LineupRow =>
    ({ group_id: id, group_name: id, player_ids: [], gp: 1, w: 1, l: 0, min: 10, poss, off_rating: 100, def_rating: 100, net_rating: net, pace: 100, pts: 10 }) as LineupRow
  it('keeps lineups at or above the threshold and sorts by possessions', () => {
    const kept = filterLineups([lineup('a', 40, 1), lineup('b', 50, 2), lineup('c', 500, 3), lineup('d', null, 4)], 50)
    expect(kept.map((l) => l.group_id)).toEqual(['c', 'b'])
  })
  it('treats a non-positive threshold as no filter but still drops null possessions', () => {
    expect(filterLineups([lineup('a', 1, 0), lineup('d', null, 0)], 0)).toHaveLength(1)
  })
})

describe('labelPositions / rankOf', () => {
  it('moves the second of two coincident labels to a different side', () => {
    const pos = labelPositions([{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.1, y: 0.1 }])
    expect(pos[0]).not.toBe(pos[1])
    expect(pos).toHaveLength(3)
  })
  it('ranks with direction and ignores nulls', () => {
    expect(rankOf(5, [1, 5, null, 9], true)).toEqual({ rank: 2, of: 3 })
    expect(rankOf(5, [1, 5, null, 9], false)).toEqual({ rank: 2, of: 3 })
    expect(rankOf(null, [1], true)).toBeNull()
  })
})
