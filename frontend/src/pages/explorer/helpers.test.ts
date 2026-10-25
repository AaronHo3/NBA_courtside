import { activePreset, axisReversed, clampSelection, formatWithUnit, groupMetricOptions, isLowSample, median, primaryPosition, tableMetricKeys, totalMinutes } from './helpers'
import type { Metric, PlayerRow } from '@/lib/types'

const metric = (key: string, kind: Metric['kind'], extra: Partial<Metric> = {}): Metric => ({
  key, label: key.toUpperCase(), kind, definition: '', formula: null, higher_is_better: true, unit: null, source: 'test', decimals: 1, ...extra,
})
const row = (over: Partial<PlayerRow>): PlayerRow => ({
  player_id: 1, full_name: 'A', team_id: 1, team_abbreviation: 'AAA', position: 'G', is_aggregate: false, age: 25, gp: 50, min: 20, poss: 100,
  normalization: 'per_game', height_in: 78, weight_lb: 200, wingspan_in: null, standing_reach_in: null, wingspan_height_ratio: null, on_off_net: null, ...over,
})

describe('groupMetricOptions', () => {
  const metrics = [metric('pts', 'counting'), metric('ts_pct', 'pct'), metric('wingspan_in', 'physical'), metric('age', 'context'), metric('usg_pct', 'rate')]
  it('groups numeric columns present in rows by kind, in the fixed kind order', () => {
    const rows = [row({ pts: 10, ts_pct: 0.5, usg_pct: 20 }), row({ pts: null, ts_pct: 0.6 })]
    const groups = groupMetricOptions(metrics, rows, 'per_36')
    expect(groups.map((g) => g.kind)).toEqual(['counting', 'pct', 'rate', 'context'])
    expect(groups[0].options).toEqual([{ key: 'pts', label: 'PTS / 36' }])
    expect(groups.find((g) => g.kind === 'physical')).toBeUndefined()
  })
  it('falls back to the whole catalog when there are no rows yet', () => {
    expect(groupMetricOptions(metrics, [], 'per_game').flatMap((g) => g.options.map((o) => o.key))).toEqual(['pts', 'ts_pct', 'usg_pct', 'wingspan_in', 'age'])
  })
})

describe('clampSelection', () => {
  it('keeps the first n unique ids and counts what was dropped', () => {
    expect(clampSelection([5, 3, 5, 9, 1, 2, 7, 8], 6)).toEqual({ kept: [5, 3, 9, 1, 2, 7], dropped: 1 })
  })
  it('ignores invalid ids and reports zero dropped when within the cap', () => {
    expect(clampSelection([0, NaN, 4, 4], 6)).toEqual({ kept: [4], dropped: 0 })
  })
})

describe('position and presets', () => {
  it('maps combo positions to their primary position', () => {
    expect(primaryPosition('G-F')).toBe('G')
    expect(primaryPosition('F-C')).toBe('F')
    expect(primaryPosition('c')).toBe('C')
    expect(primaryPosition(null)).toBeNull()
    expect(primaryPosition('X')).toBeNull()
  })
  it('recognises the active preset from axis state', () => {
    expect(activePreset({ x: 'usg_pct', y: 'ts_pct', size: 'pts', color: 'none' })?.key).toBe('usage-ts')
    expect(activePreset({ x: 'usg_pct', y: 'ts_pct', size: 'none', color: 'none' })).toBeUndefined()
  })
  it('reverses only lower-is-better axes', () => {
    expect(axisReversed(metric('def_rating', 'rating', { higher_is_better: false }))).toBe(true)
    expect(axisReversed(metric('pts', 'counting'))).toBe(false)
    expect(axisReversed(undefined)).toBe(false)
  })
})

describe('sample size and formatting', () => {
  it('recovers season minutes from per-game rows and leaves totals alone', () => {
    expect(totalMinutes(row({ normalization: 'per_game', min: 20, gp: 50 }))).toBe(1000)
    expect(totalMinutes(row({ normalization: 'per_36', min: 480 }))).toBe(480)
    expect(isLowSample(row({ gp: 5 }), 10, 100)).toBe(true)
    expect(isLowSample(row({ gp: 50, min: 20 }), 10, 100)).toBe(false)
  })
  it('formats values with catalog units and dashes for missing values', () => {
    expect(formatWithUnit(21.44, metric('usg_pct', 'rate', { unit: '%' }))).toBe('21.4%')
    expect(formatWithUnit(84.5, metric('wingspan_in', 'physical', { unit: 'in', decimals: 2 }))).toBe('84.50 in')
    expect(formatWithUnit(0.612, metric('ts_pct', 'pct', { decimals: 3 }))).toBe('61.2%')
    expect(formatWithUnit(null, metric('pts', 'counting'))).toBe('–')
  })
  it('orders table metrics: active axes first, defaults after, no duplicates or sentinels', () => {
    const keys = tableMetricKeys(['fga', 'ts_pct', 'none', 'position', 'min'])
    expect(keys.slice(0, 2)).toEqual(['fga', 'ts_pct'])
    expect(keys.filter((k) => k === 'ts_pct')).toHaveLength(1)
    expect(keys).not.toContain('none')
    expect(keys).not.toContain('min')
  })
  it('computes medians ignoring nulls', () => {
    expect(median([3, null, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([null])).toBeNull()
  })
})
