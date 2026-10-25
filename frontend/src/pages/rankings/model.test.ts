import type { Metric, RankingMeta, RankingRow } from '@/lib/types'
import { addComponent, csvRows, decodeComponents, detectOverlaps, encodeComponents, MAX_COMPONENTS, normalizeWeights, selectableMetrics } from './model'

const metric = (key: string, kind: Metric['kind'] = 'counting', higher: boolean | null = true): Metric =>
  ({ key, label: key.toUpperCase(), kind, definition: '', formula: null, higher_is_better: higher, unit: null, source: '', decimals: 1 })

describe('custom composite URL codec', () => {
  it('round-trips metric, weight and direction', () => {
    const comps = [
      { metric: 'ts_pct', weight: 2, higher_is_better: true },
      { metric: 'tov', weight: 0.5, higher_is_better: false },
      { metric: 'def_rating', weight: 1.25, higher_is_better: false },
    ]
    const encoded = encodeComponents(comps)
    expect(encoded).toBe('ts_pct:2:h,tov:0.5:l,def_rating:1.25:l')
    expect(decodeComponents(encoded)).toEqual(comps)
  })
  it('drops malformed, negative and duplicate entries instead of throwing', () => {
    expect(decodeComponents('pts:1:h,pts:2:h,:1:h,ast:abc:h,reb:-1:h,blk:1:x,stl:1')).toEqual([
      { metric: 'pts', weight: 1, higher_is_better: true },
      { metric: 'stl', weight: 1, higher_is_better: true },
    ])
    expect(decodeComponents(null)).toEqual([])
    expect(decodeComponents('')).toEqual([])
  })
  it('caps the number of components', () => {
    const many = Array.from({ length: MAX_COMPONENTS + 3 }, (_, i) => `m${i}:1:h`).join(',')
    expect(decodeComponents(many)).toHaveLength(MAX_COMPONENTS)
  })
})

describe('weight normalisation', () => {
  it('turns weights into shares that sum to one', () => {
    const shares = normalizeWeights([{ weight: 2 }, { weight: 1 }, { weight: 1 }])
    expect(shares).toEqual([0.5, 0.25, 0.25])
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })
  it('treats all-zero weights as undefined shares rather than dividing by zero', () => {
    expect(normalizeWeights([{ weight: 0 }, { weight: 0 }])).toEqual([0, 0])
  })
  it('ignores negative weights', () => {
    expect(normalizeWeights([{ weight: -1 }, { weight: 1 }])).toEqual([0, 1])
  })
})

describe('overlap warnings', () => {
  it('flags strongly overlapping pairs regardless of order and explains why', () => {
    const warnings = detectOverlaps([{ metric: 'net_rating' }, { metric: 'pts' }, { metric: 'off_rating' }, { metric: 'fgm' }])
    expect(warnings.map((w) => [w.a, w.b])).toEqual([
      ['pts', 'fgm'],
      ['off_rating', 'net_rating'],
    ])
    expect(warnings.every((w) => w.reason.length > 10)).toBe(true)
  })
  it('is silent when no pair overlaps', () => {
    expect(detectOverlaps([{ metric: 'ts_pct' }, { metric: 'reb' }, { metric: 'ast' }])).toEqual([])
  })
})

describe('builder helpers', () => {
  it('excludes context metrics and already chosen ones from the picker', () => {
    const catalog = [metric('gp', 'context'), metric('pts'), metric('ast'), metric('pace', 'context', null)]
    expect(selectableMetrics(catalog, [{ metric: 'ast' }]).map((m) => m.key)).toEqual(['pts'])
  })
  it('seeds direction from the catalog and never mutates the input', () => {
    const before = [{ metric: 'pts', weight: 1, higher_is_better: true }]
    const after = addComponent(before, metric('tov', 'counting', false))
    expect(before).toHaveLength(1)
    expect(after[1]).toEqual({ metric: 'tov', weight: 1, higher_is_better: false })
  })
})

describe('csv shaping', () => {
  it('writes raw, normalised and contribution columns per component', () => {
    const meta = { components: [{ metric: 'pts', weight: 1, higher_is_better: true, label: 'Points', kind: 'counting', scaled: true }] } as unknown as RankingMeta
    const row = {
      rank: 1, player_id: 1, full_name: 'A', team_abbreviation: 'X', position: 'G', age: 20, gp: 10, min: 100, score: 90, eligible: true, missing: [],
      contributions: [{ metric: 'pts', raw: 20, normalized: 90, normalization: 'percentile', higher_is_better: true, weight: 1, contribution: 90, population_size: 50 }],
      pts: 20,
    } as RankingRow
    expect(csvRows([row], meta)[0]).toMatchObject({ player: 'A', pts: 20, pts_normalized: 90, pts_contribution: 90 })
  })
})
