import { describe, expect, it } from 'vitest'
import { clampToDomain, colourDomain, formatMetricValue, frequencyToScale, makeColourScale, normalise } from './colour'

describe('colour domains', () => {
  it('are fixed presets, symmetric for diverging metrics', () => {
    expect(colourDomain('fg_pct', 'standard')).toEqual([0.25, 0.75])
    expect(colourDomain('rel_fg_pct', 'standard')).toEqual([-0.15, 0.15])
    expect(colourDomain('pts_per_fga', 'standard', true)).toEqual([-0.3, 0.3])
    const [lo, hi] = colourDomain('fg_pct', 'narrow', true)
    expect(lo).toBe(-hi)
  })
  it('clamps values outside the domain to the ends', () => {
    const d = colourDomain('fg_pct', 'standard')
    expect(clampToDomain(0.9, d)).toBe(0.75)
    expect(clampToDomain(0.1, d)).toBe(0.25)
    expect(clampToDomain(0.5, d)).toBe(0.5)
    expect(normalise(2, d)).toBe(1)
    expect(normalise(-1, d)).toBe(0)
    expect(normalise(0.5, d)).toBeCloseTo(0.5)
  })
  it('gives the same colour for the same value regardless of the data', () => {
    const scale = makeColourScale('rel_fg_pct', colourDomain('rel_fg_pct', 'standard'), 'dark')
    expect(scale.colour(0.05)).toBe(scale.colour(0.05))
    expect(scale.colour(0.4)).toBe(scale.colour(0.15)) // clamped
    expect(scale.colour(null)).toBeNull()
    expect(scale.diverging).toBe(true)
    expect(makeColourScale('fg_pct', colourDomain('fg_pct', 'standard'), 'light').diverging).toBe(false)
  })
})

describe('frequency encoding', () => {
  it('uses a sqrt scale with a 35% floor', () => {
    expect(frequencyToScale(0, 0.1)).toBe(0.35)
    expect(frequencyToScale(0.1, 0.1)).toBeCloseTo(1)
    expect(frequencyToScale(0.025, 0.1)).toBeCloseTo(0.35 + 0.65 * 0.5)
    expect(frequencyToScale(0.5, 0.1)).toBeCloseTo(1) // never above full size
  })
})

describe('formatMetricValue', () => {
  it('formats percentages, relative points and points per FGA', () => {
    expect(formatMetricValue('fg_pct', 0.4567)).toBe('45.7%')
    expect(formatMetricValue('rel_fg_pct', 0.0763)).toBe('+7.6 pts')
    expect(formatMetricValue('rel_fg_pct', -0.0763)).toBe('-7.6 pts')
    expect(formatMetricValue('pts_per_fga', 1.1794)).toBe('1.18')
    expect(formatMetricValue('fg_pct', 0.05, true)).toBe('+5.0 pts')
    expect(formatMetricValue('fg_pct', null)).toBe('–')
  })
})
