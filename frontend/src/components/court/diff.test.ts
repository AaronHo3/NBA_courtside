import { describe, expect, it } from 'vitest'
import type { HexBin } from '@/lib/types'
import { mergeDifference } from './diff'

const bin = (q: number, r: number, fga: number, fgm: number, extra: Partial<HexBin> = {}): HexBin => ({
  q, r, x_ft: q * 2.598 + r * 1.299, y_ft: r * 2.25, zone: 'Mid-Range', fga, fgm, pts: fgm * 2,
  fg_pct: fga ? fgm / fga : null, ci_low: null, ci_high: null, low_sample: fga < 5, pts_per_fga: fga ? (fgm * 2) / fga : null,
  frequency: 0, league_fg_pct: 0.42, rel_fg_pct: fga ? fgm / fga - 0.42 : null, ...extra,
})

describe('mergeDifference', () => {
  it('subtracts B from A on matching (q, r) bins', () => {
    const a = [bin(0, 0, 10, 6), bin(1, 1, 20, 8)]
    const b = [bin(0, 0, 10, 4), bin(1, 1, 10, 4)]
    const out = mergeDifference(a, b, 'fg_pct', 1.5)
    expect(out).toHaveLength(2)
    const z = out.find((d) => d.q === 0 && d.r === 0)!
    expect(z.delta).toBeCloseTo(0.2)
    expect(z.fga).toBe(20)
    expect(out.find((d) => d.q === 1)!.delta).toBeCloseTo(0)
  })
  it('keeps bins present on only one side as hollow (delta null) with that side\'s attempts', () => {
    const out = mergeDifference([bin(0, 0, 10, 6)], [bin(2, -1, 8, 2)], 'rel_fg_pct', 1.5)
    expect(out).toHaveLength(2)
    const onlyA = out.find((d) => d.q === 0)!
    const onlyB = out.find((d) => d.q === 2)!
    expect(onlyA.delta).toBeNull()
    expect(onlyA.b).toBeNull()
    expect(onlyB.delta).toBeNull()
    expect(onlyB.a).toBeNull()
    expect(onlyB.fga).toBe(8)
    expect(onlyA.frequency).toBeCloseTo(10 / 18)
  })
  it('flags low sample when either side is below the threshold', () => {
    const out = mergeDifference([bin(0, 0, 30, 10)], [bin(0, 0, 3, 1)], 'pts_per_fga', 1.5, 5)
    expect(out[0].low_sample).toBe(true)
    expect(mergeDifference([bin(0, 0, 30, 10)], [bin(0, 0, 12, 1)], 'pts_per_fga', 1.5, 5)[0].low_sample).toBe(false)
  })
  it('does not mutate its inputs', () => {
    const a = [bin(0, 0, 10, 6)]
    const snapshot = JSON.stringify(a)
    mergeDifference(a, [], 'fg_pct', 1.5)
    expect(JSON.stringify(a)).toBe(snapshot)
  })
})
