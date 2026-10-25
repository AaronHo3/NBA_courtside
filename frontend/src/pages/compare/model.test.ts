import { buildCompareModel, type ComparedPlayer } from './model'
import { METRICS } from './metrics'
import type { PlayerRow } from '@/lib/types'

const pop = (id: number, over: Partial<PlayerRow>): PlayerRow =>
  ({ player_id: id, full_name: `P${id}`, team_id: 1, team_abbreviation: 'AAA', position: 'G', is_aggregate: false, age: 25, gp: 70, min: 2000, poss: 4000, normalization: 'totals',
    height_in: 76, weight_lb: 200, wingspan_in: null, standing_reach_in: null, wingspan_height_ratio: null, on_off_net: null, pts: 1000, tov: 100, fga: 800, fta: 200, ...over }) as PlayerRow

const population: PlayerRow[] = [
  pop(1, { pts: 1400, tov: 70 }),
  pop(2, { pts: 1000, tov: 140 }),
  pop(3, { pts: 700, tov: 210, position: 'C' }),
  pop(4, { pts: 2100, tov: 280, min: 100 }), // below any minutes threshold
]
const player = (id: number, slot: number, record: PlayerRow | null = population.find((r) => r.player_id === id) ?? null): ComparedPlayer => ({
  id, name: `P${id}`, team: 'AAA', position: record?.position ?? 'G', slot, record, totalMin: record?.min ?? null, hasSeason: record !== null,
})

describe('buildCompareModel', () => {
  it('highlights the best value per metric, flipping lower-is-better metrics', () => {
    const m = buildCompareModel({ players: [player(1, 0), player(2, 1), player(3, 2)], population, norm: 'per_game', populationKind: 'all', minMinutes: 0, specs: [METRICS.pts, METRICS.tov] })
    expect(m.get('pts')?.best).toBe(0)
    expect(m.get('tov')?.best).toBe(0)
    expect(m.get('tov')?.cells.map((c) => c.rank)).toEqual([1, 2, 3])
    expect(m.get('pts')?.cells[0].value).toBeCloseTo(20)
  })
  it('applies the minutes threshold to the "all" cohort and reports cohort size', () => {
    const m = buildCompareModel({ players: [player(1, 0), player(4, 1)], population, norm: 'per_game', populationKind: 'all', minMinutes: 500, specs: [METRICS.pts] })
    const cells = m.get('pts')!.cells
    expect(cells[0].cohortSize).toBe(3)
    expect(cells[0].percentile).toBeCloseTo((2 + 0.5) / 3 * 100)
    expect(cells[1].belowThreshold).toBe(true)
  })
  it('uses each player’s own positional peers and the comparison group as cohorts', () => {
    const pos = buildCompareModel({ players: [player(1, 0), player(3, 1)], population, norm: 'per_game', populationKind: 'position', minMinutes: 0, specs: [METRICS.pts] })
    expect(pos.get('pts')!.cells[0].cohortSize).toBe(3) // guards 1, 2, 4
    expect(pos.get('pts')!.cells[1].cohortSize).toBe(1) // the only centre
    const grp = buildCompareModel({ players: [player(1, 0), player(2, 1), player(3, 2)], population, norm: 'per_game', populationKind: 'group', minMinutes: 0, specs: [METRICS.pts] })
    expect(grp.get('pts')!.cells.map((c) => c.cohortSize)).toEqual([3, 3, 3])
  })
  it('leaves cells empty for a player without data in the season', () => {
    const m = buildCompareModel({ players: [player(1, 0), player(9, 1, null)], population, norm: 'per_game', populationKind: 'all', minMinutes: 0, specs: [METRICS.pts] })
    expect(m.get('pts')!.cells[1]).toMatchObject({ value: null, percentile: null, rank: null })
    expect(m.get('pts')!.best).toBe(0)
  })
})
