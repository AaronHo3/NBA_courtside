import {
  alignTrajectory, astTo, bestIndex, fg3aRate, ftaRate, normalizeCounting, percentileRank, rankInGroup, seasonRowFor, shootingPct, tovPct,
} from './math'
import type { PlayerSeasonRow } from '@/lib/types'

const row = (over: Partial<PlayerSeasonRow>): PlayerSeasonRow =>
  ({ player_id: 1, season: '2024-25', season_type: 'Regular Season', is_aggregate: false, gp: 10, min: 200, poss: 400, ...over }) as PlayerSeasonRow

describe('rate helpers', () => {
  it('return null for zero or missing denominators, never NaN or Infinity', () => {
    expect(fg3aRate({ fg3a: 5, fga: 0 })).toBeNull()
    expect(ftaRate({ fta: 5, fga: null })).toBeNull()
    expect(shootingPct(3, 0)).toBeNull()
    expect(astTo({ ast: 4, tov: 0 })).toBeNull()
    expect(tovPct({ tov: 0, fga: 0, fta: 0 })).toBeNull()
  })
  it('compute the standard formulas', () => {
    expect(fg3aRate({ fg3a: 40, fga: 100 })).toBeCloseTo(0.4)
    expect(ftaRate({ fta: 25, fga: 100 })).toBeCloseTo(0.25)
    expect(shootingPct(45, 100)).toBeCloseTo(0.45)
    expect(astTo({ ast: 30, tov: 10 })).toBeCloseTo(3)
    expect(tovPct({ tov: 10, fga: 80, fta: 25 })).toBeCloseTo(10 / (80 + 0.44 * 25 + 10))
  })
})

describe('normalizeCounting', () => {
  const r = { gp: 10, min: 200, poss: 400 }
  it('scales per game, per 36 and per 100 and leaves totals alone', () => {
    expect(normalizeCounting(100, r, 'totals')).toBe(100)
    expect(normalizeCounting(100, r, 'per_game')).toBe(10)
    expect(normalizeCounting(100, r, 'per_36')).toBe(18)
    expect(normalizeCounting(100, r, 'per_100')).toBe(25)
  })
  it('returns null when the denominator is zero or missing', () => {
    expect(normalizeCounting(100, { gp: 0, min: 0, poss: null }, 'per_game')).toBeNull()
    expect(normalizeCounting(100, { gp: 0, min: 0, poss: null }, 'per_36')).toBeNull()
    expect(normalizeCounting(100, { gp: 0, min: 0, poss: null }, 'per_100')).toBeNull()
    expect(normalizeCounting(null, r, 'per_game')).toBeNull()
  })
})

describe('bestIndex and rankInGroup respect direction', () => {
  it('picks the highest when higher is better and the lowest when lower is better', () => {
    expect(bestIndex([10, 30, 20], true)).toBe(1)
    expect(bestIndex([10, 30, 20], false)).toBe(0)
  })
  it('ignores nulls and declines to pick when direction is unknown or there is a tie', () => {
    expect(bestIndex([null, 5, null], true)).toBe(1)
    expect(bestIndex([null, null], true)).toBeNull()
    expect(bestIndex([1, 2], null)).toBeNull()
    expect(bestIndex([7, 7, 1], true)).toBeNull()
  })
  it('ranks within the group with ties sharing a rank', () => {
    expect(rankInGroup([10, 30, 20], true)).toEqual([3, 1, 2])
    expect(rankInGroup([10, 30, 20], false)).toEqual([1, 3, 2])
    expect(rankInGroup([5, 5, 1, null], true)).toEqual([1, 1, 3, null])
  })
})

describe('percentileRank', () => {
  const cohort = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  it('uses mid-ranks and flips lower-is-better metrics so higher is always better', () => {
    expect(percentileRank(cohort, 10, true)).toBeCloseTo(95)
    expect(percentileRank(cohort, 1, true)).toBeCloseTo(5)
    expect(percentileRank(cohort, 1, false)).toBeCloseTo(95)
    expect(percentileRank(cohort, 10, false)).toBeCloseTo(5)
  })
  it('returns null for empty cohorts or missing values', () => {
    expect(percentileRank([], 3, true)).toBeNull()
    expect(percentileRank(cohort, null, true)).toBeNull()
  })
})

describe('seasonRowFor', () => {
  it('prefers the aggregate row when a player was traded and the single stint otherwise', () => {
    const rows = [
      row({ season: '2024-25', team_abbreviation: 'AAA', pts: 100 }),
      row({ season: '2024-25', team_abbreviation: 'BBB', pts: 50 }),
      row({ season: '2024-25', team_abbreviation: 'TOT', is_aggregate: true, pts: 150 }),
      row({ season: '2023-24', team_abbreviation: 'AAA', pts: 80 }),
    ]
    expect(seasonRowFor(rows, '2024-25')?.pts).toBe(150)
    expect(seasonRowFor(rows, '2023-24')?.pts).toBe(80)
    expect(seasonRowFor(rows, '2019-20')).toBeNull()
  })
})

describe('alignTrajectory', () => {
  const rows = [
    row({ season: '2021-22', age: 22.5, pts: 500, min: 1000, gp: 50 }),
    row({ season: '2022-23', age: 23.5, pts: 800, min: 1600, gp: 80 }),
    row({ season: '2022-23', age: 23.5, pts: 300, min: 600, gp: 30, team_abbreviation: 'TOT', is_aggregate: true }),
    row({ season: '2024-25', age: 25.5, pts: 900, min: 1500, gp: 75 }),
  ]
  const pts36 = (r: PlayerSeasonRow) => normalizeCounting(r.pts as number, r, 'per_36')
  it('uses calendar seasons, the aggregate row per season, and skips nothing', () => {
    const pts = alignTrajectory(rows, 'season', pts36)
    expect(pts.map((p) => p.x)).toEqual(['2021-22', '2022-23', '2024-25'])
    expect(pts[1].y).toBeCloseTo(18)
  })
  it('aligns by age at season', () => {
    expect(alignTrajectory(rows, 'age', pts36).map((p) => p.x)).toEqual([22.5, 23.5, 25.5])
  })
  it('aligns by career year starting at 1 even when seasons are missing in between', () => {
    expect(alignTrajectory(rows, 'career_year', pts36).map((p) => p.x)).toEqual([1, 2, 3])
  })
  it('drops points whose age is unknown in age mode', () => {
    const noAge = [row({ season: '2021-22', age: null, pts: 10 }), row({ season: '2022-23', age: 24, pts: 10 })]
    expect(alignTrajectory(noAge, 'age', pts36).map((p) => p.x)).toEqual([24])
  })
})
