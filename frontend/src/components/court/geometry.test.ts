import { describe, expect, it } from 'vitest'
import type { CourtGeometry } from '@/lib/types'
import { courtScales, hexCentre, hexCorners, hexPath, pointToHex, providerToFeet, threePointArcEndpoints, threePointPath, zoneShapes } from './geometry'

export const GEOMETRY: CourtGeometry = {
  bounds: { x_min: -25, x_max: 25, y_min: -5.25, y_max: 41.75 },
  hoop: { cx: 0, cy: 0, r: 0.75 },
  backboard: { x1: -3, x2: 3, y: -1.25 },
  paint: { x: -8, y: -5.25, width: 16, height: 19 },
  inner_paint: { x: -6, y: -5.25, width: 12, height: 19 },
  free_throw_circle: { cx: 0, cy: 13.75, r: 6 },
  restricted_area: { cx: 0, cy: 0, r: 4 },
  three_point: { radius: 23.75, corner_x: 22, corner_break_y: 8.94776508408664, baseline_y: -5.25 },
  half_court: { y: 41.75 },
  center_circle: { cx: 0, cy: 41.75, r: 6 },
}

describe('providerToFeet', () => {
  it('divides tenths of a foot by ten', () => {
    expect(providerToFeet(28, -20)).toEqual({ x_ft: 2.8, y_ft: -2 })
  })
})

describe('courtScales', () => {
  it('preserves the 50 × 47 ft aspect ratio and puts the baseline at the bottom', () => {
    const s = courtScales(GEOMETRY, 500)
    expect(s.pxPerFt).toBe(10)
    expect(s.height).toBeCloseTo(470)
    expect(s.x(-25)).toBe(0)
    expect(s.x(25)).toBe(500)
    expect(s.y(41.75)).toBe(0) // half-court line at the top
    expect(s.y(-5.25)).toBeCloseTo(470) // baseline at the bottom
    expect(s.y(0)).toBeCloseTo(417.5) // hoop near the bottom
  })
  it('round-trips feet → pixels → feet', () => {
    const s = courtScales(GEOMETRY, 333)
    for (const [x, y] of [[0, 0], [-22, 8.9], [17.3, 30.1], [25, -5.25]]) {
      expect(s.invX(s.x(x))).toBeCloseTo(x, 9)
      expect(s.invY(s.y(y))).toBeCloseTo(y, 9)
    }
    expect(s.px(1)).toBeCloseTo(333 / 50)
  })
})

describe('three-point line', () => {
  it('arc endpoints sit at x = ±22 and y = sqrt(23.75² − 22²)', () => {
    const { left, right, cornerBreakY } = threePointArcEndpoints(GEOMETRY)
    const expected = Math.sqrt(23.75 ** 2 - 22 ** 2)
    expect(cornerBreakY).toBeCloseTo(expected, 12)
    expect(cornerBreakY).toBeCloseTo(8.94776508408664, 10)
    expect(left).toEqual({ x: -22, y: cornerBreakY })
    expect(right).toEqual({ x: 22, y: cornerBreakY })
    expect(Math.hypot(left.x, left.y)).toBeCloseTo(23.75, 10)
  })
  it('path joins the corner segments to the arc at exactly those points', () => {
    const s = courtScales(GEOMETRY, 500)
    const d = threePointPath(GEOMETRY, s)
    const yBreak = s.y(8.94776508408664).toFixed(3)
    expect(d).toBe(`M30,470 L30,${yBreak} A237.5,237.5 0 0 1 470,${yBreak} L470,470`)
  })
})

describe('hexagons', () => {
  it('pointy-top corners have a vertex straight up and straight down', () => {
    const pts = hexCorners(0, 0, 2)
    const ys = pts.map((p) => Number(p.y.toFixed(9)))
    expect(ys).toContain(2)
    expect(ys).toContain(-2)
    const xs = pts.map((p) => Math.abs(Number(p.x.toFixed(9))))
    expect(Math.max(...xs)).toBeCloseTo(Math.sqrt(3), 9) // flat sides at x = ±R·√3/2
    for (const p of pts) expect(Math.hypot(p.x, p.y)).toBeCloseTo(2, 9)
  })
  it('scale shrinks the hexagon about its centre', () => {
    const pts = hexCorners(10, 10, 4, 0.5)
    for (const p of pts) expect(Math.hypot(p.x - 10, p.y - 10)).toBeCloseTo(2, 9)
    expect(hexPath(0, 0, 1)).toMatch(/^M[-\d.]+,[-\d.]+(L[-\d.]+,[-\d.]+){5}Z$/)
  })
  it('hexCentre matches the server lattice and pointToHex inverts it', () => {
    const R = 1.5
    expect(hexCentre(1, 1, R)).toEqual({ x_ft: expect.closeTo(3.897114317, 6), y_ft: 2.25 })
    expect(hexCentre(-1, 2, R)).toEqual({ x_ft: expect.closeTo(0, 9), y_ft: 4.5 })
    for (const [q, r] of [[0, 0], [1, 1], [-3, 3], [7, -2], [-10, 19]]) {
      const c = hexCentre(q, r, R)
      expect(pointToHex(c.x_ft, c.y_ft, R)).toEqual({ q, r })
      // a point nudged within the hex still rounds to the same bin
      expect(pointToHex(c.x_ft + 0.4, c.y_ft - 0.4, R)).toEqual({ q, r })
    }
  })
})

describe('zoneShapes', () => {
  it('covers the six provider zones with a path each', () => {
    const s = courtScales(GEOMETRY, 500)
    const shapes = zoneShapes(GEOMETRY)
    expect(shapes.map((z) => z.zone).sort()).toEqual(['Above the Break 3', 'In The Paint (Non-RA)', 'Left Corner 3', 'Mid-Range', 'Restricted Area', 'Right Corner 3'])
    for (const z of shapes) expect(z.path(s)).toMatch(/^M/)
    const corner = shapes.find((z) => z.zone === 'Left Corner 3')!
    expect(corner.path(s)).toBe(`M0,470 H30 V${s.y(8.94776508408664).toFixed(3)} H0 Z`)
  })
})
