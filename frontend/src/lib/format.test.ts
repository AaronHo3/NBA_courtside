import { formatMetric, formatPct, formatSigned, inchesToFtIn, metricLabelWithNorm } from './format'
import type { Metric } from './types'

const pct: Metric = { key: 'ts_pct', label: 'TS%', kind: 'pct', definition: '', formula: null, higher_is_better: true, unit: null, source: '', decimals: 3 }
const counting: Metric = { key: 'pts', label: 'Points', kind: 'counting', definition: '', formula: null, higher_is_better: true, unit: null, source: '', decimals: 1 }

describe('format', () => {
  it('renders missing values as a dash, never zero', () => {
    expect(formatMetric(null, pct)).toBe('–')
    expect(formatMetric(undefined, counting)).toBe('–')
    expect(formatMetric(NaN, counting)).toBe('–')
  })
  it('formats percentages from fractions', () => {
    expect(formatMetric(0.5768, pct)).toBe('57.7%')
    expect(formatPct(null)).toBe('–')
  })
  it('signs deltas', () => {
    expect(formatSigned(2.345)).toBe('+2.3')
    expect(formatSigned(-0.5)).toBe('-0.5')
  })
  it('converts inches', () => {
    expect(inchesToFtIn(79)).toBe(`6'7"`)
    expect(inchesToFtIn(81.5)).toBe(`6'9.5"`)
  })
  it('labels normalised counting stats and leaves rates alone', () => {
    expect(metricLabelWithNorm(counting, 'pts', 'per_36')).toBe('Points / 36')
    expect(metricLabelWithNorm(pct, 'ts_pct', 'per_36')).toBe('TS%')
    expect(metricLabelWithNorm(counting, 'pts', 'totals')).toBe('Points')
  })
})
