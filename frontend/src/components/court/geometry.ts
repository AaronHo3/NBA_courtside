import type { CourtGeometry } from '@/lib/types'

/** Provider LOC_X/LOC_Y are tenths of a foot from the hoop centre. */
export const PROVIDER_UNITS_PER_FOOT = 10

export function providerToFeet(loc_x: number, loc_y: number): { x_ft: number; y_ft: number } {
  return { x_ft: loc_x / PROVIDER_UNITS_PER_FOOT, y_ft: loc_y / PROVIDER_UNITS_PER_FOOT }
}

export type Point = { x: number; y: number }

/**
 * Feet → pixels for a half court drawn with the hoop toward the bottom of the SVG:
 * x_ft increases to the right, y_ft increases upward on screen (baseline at the bottom).
 * Aspect ratio is preserved: 50 ft wide by 47 ft tall by default.
 */
export type CourtScales = {
  width: number
  height: number
  pxPerFt: number
  x: (ft: number) => number
  y: (ft: number) => number
  /** Length in feet → length in pixels. */
  px: (ft: number) => number
  invX: (px: number) => number
  invY: (px: number) => number
}

export function courtScales(g: CourtGeometry, width: number): CourtScales {
  const wFt = g.bounds.x_max - g.bounds.x_min
  const hFt = g.bounds.y_max - g.bounds.y_min
  const pxPerFt = width / wFt
  const height = hFt * pxPerFt
  return {
    width,
    height,
    pxPerFt,
    x: (ft) => (ft - g.bounds.x_min) * pxPerFt,
    y: (ft) => (g.bounds.y_max - ft) * pxPerFt,
    px: (ft) => ft * pxPerFt,
    invX: (px) => px / pxPerFt + g.bounds.x_min,
    invY: (px) => g.bounds.y_max - px / pxPerFt,
  }
}

/** Where the straight corner segments meet the arc: x = ±corner_x, y = sqrt(r² − corner_x²). */
export function threePointArcEndpoints(g: CourtGeometry): { left: Point; right: Point; cornerBreakY: number } {
  const { radius, corner_x } = g.three_point
  const cornerBreakY = Math.sqrt(radius * radius - corner_x * corner_x)
  return { left: { x: -corner_x, y: cornerBreakY }, right: { x: corner_x, y: cornerBreakY }, cornerBreakY }
}

const f = (n: number) => Number(n.toFixed(3))

/**
 * Three-point line as one SVG path in pixel space: left corner segment up from the baseline,
 * the arc over the top (passing through (0, radius)), and the right corner segment down.
 * In screen coordinates (y down) travelling left → top → right is clockwise, i.e. sweep flag 1.
 */
export function threePointPath(g: CourtGeometry, s: CourtScales): string {
  const { left, right } = threePointArcEndpoints(g)
  const base = g.three_point.baseline_y
  const r = s.px(g.three_point.radius)
  return [
    `M${f(s.x(left.x))},${f(s.y(base))}`,
    `L${f(s.x(left.x))},${f(s.y(left.y))}`,
    `A${f(r)},${f(r)} 0 0 1 ${f(s.x(right.x))},${f(s.y(right.y))}`,
    `L${f(s.x(right.x))},${f(s.y(base))}`,
  ].join(' ')
}

/** Full circle path (two arcs) in pixel space. */
export function circlePath(cx: number, cy: number, r: number): string {
  return `M${f(cx - r)},${f(cy)} A${f(r)},${f(r)} 0 1 0 ${f(cx + r)},${f(cy)} A${f(r)},${f(r)} 0 1 0 ${f(cx - r)},${f(cy)} Z`
}

// --- hexagons -------------------------------------------------------------------------------

/** Corners of a pointy-top hexagon with circumradius R centred at (cx, cy); `scale` shrinks it about its centre. */
export function hexCorners(cx: number, cy: number, R: number, scale = 1): Point[] {
  const rr = R * scale
  return Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 180) * (30 + 60 * k)
    return { x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) }
  })
}

export function hexPath(cx: number, cy: number, R: number, scale = 1): string {
  const pts = hexCorners(cx, cy, R, scale)
  return `M${pts.map((p) => `${f(p.x)},${f(p.y)}`).join('L')}Z`
}

/** Centre (feet) of axial bin (q, r) on the server's pointy-top lattice with circumradius R. */
export function hexCentre(q: number, r: number, R: number): { x_ft: number; y_ft: number } {
  return { x_ft: R * Math.sqrt(3) * (q + r / 2), y_ft: R * 1.5 * r }
}

/** Axial bin containing a point (feet), using cube rounding; inverse of `hexCentre`. */
export function pointToHex(x_ft: number, y_ft: number, R: number): { q: number; r: number } {
  const qf = ((Math.sqrt(3) / 3) * x_ft - y_ft / 3) / R
  const rf = ((2 / 3) * y_ft) / R
  const sf = -qf - rf
  let q = Math.round(qf)
  let r = Math.round(rf)
  const sr = Math.round(sf)
  const dq = Math.abs(q - qf)
  const dr = Math.abs(r - rf)
  const ds = Math.abs(sr - sf)
  if (dq > dr && dq > ds) q = -r - sr
  else if (dr > ds) r = -q - sr
  return { q: q + 0, r: r + 0 } // `+ 0` folds -0 into 0 so keys compare cleanly
}

// --- provider zones -------------------------------------------------------------------------

export type ZoneShape = { zone: string; path: (s: CourtScales) => string; label: { x_ft: number; y_ft: number } }

/**
 * Approximate the six provider "basic" zones from the court constants. Restricted area = circle of
 * the restricted-area radius; paint (non-RA) = paint rectangle minus that circle; mid-range = inside
 * the three-point line minus the paint; corner threes = strips outside x = ±corner_x below the corner
 * break; above the break = everything beyond the arc. Paths use the even-odd rule for holes.
 */
export function zoneShapes(g: CourtGeometry): ZoneShape[] {
  const { left, right, cornerBreakY } = threePointArcEndpoints(g)
  const base = g.three_point.baseline_y
  const paintTop = g.paint.y + g.paint.height
  const half = g.paint.width / 2
  const ra = g.restricted_area
  const rect = (s: CourtScales, x0: number, y0: number, x1: number, y1: number) =>
    `M${f(s.x(x0))},${f(s.y(y0))} H${f(s.x(x1))} V${f(s.y(y1))} H${f(s.x(x0))} Z`
  const raCircle = (s: CourtScales) => circlePath(s.x(ra.cx), s.y(ra.cy), s.px(ra.r))
  const insideArc = (s: CourtScales) => {
    const r = s.px(g.three_point.radius)
    return `M${f(s.x(left.x))},${f(s.y(base))} L${f(s.x(left.x))},${f(s.y(left.y))} A${f(r)},${f(r)} 0 0 1 ${f(s.x(right.x))},${f(s.y(right.y))} L${f(s.x(right.x))},${f(s.y(base))} Z`
  }
  const aboveBreak = (s: CourtScales) => {
    const r = s.px(g.three_point.radius)
    return [
      `M${f(s.x(g.bounds.x_min))},${f(s.y(cornerBreakY))}`,
      `L${f(s.x(left.x))},${f(s.y(left.y))}`,
      `A${f(r)},${f(r)} 0 0 1 ${f(s.x(right.x))},${f(s.y(right.y))}`,
      `L${f(s.x(g.bounds.x_max))},${f(s.y(cornerBreakY))}`,
      `L${f(s.x(g.bounds.x_max))},${f(s.y(g.bounds.y_max))}`,
      `L${f(s.x(g.bounds.x_min))},${f(s.y(g.bounds.y_max))} Z`,
    ].join(' ')
  }
  return [
    { zone: 'Restricted Area', path: raCircle, label: { x_ft: 0, y_ft: 1.2 } },
    { zone: 'In The Paint (Non-RA)', path: (s) => `${rect(s, -half, base, half, paintTop)} ${raCircle(s)}`, label: { x_ft: 0, y_ft: 9.5 } },
    { zone: 'Mid-Range', path: (s) => `${insideArc(s)} ${rect(s, -half, base, half, paintTop)}`, label: { x_ft: 0, y_ft: 18.5 } },
    { zone: 'Left Corner 3', path: (s) => rect(s, g.bounds.x_min, base, left.x, cornerBreakY), label: { x_ft: (g.bounds.x_min + left.x) / 2, y_ft: 2.5 } },
    { zone: 'Right Corner 3', path: (s) => rect(s, right.x, base, g.bounds.x_max, cornerBreakY), label: { x_ft: (g.bounds.x_max + right.x) / 2, y_ft: 2.5 } },
    { zone: 'Above the Break 3', path: aboveBreak, label: { x_ft: 0, y_ft: 29 } },
  ]
}

/** Short display names for provider zones (sentence case). */
export const ZONE_LABEL: Record<string, string> = {
  'Restricted Area': 'Restricted area',
  'In The Paint (Non-RA)': 'Paint (non-RA)',
  'Mid-Range': 'Mid-range',
  'Left Corner 3': 'Left corner 3',
  'Right Corner 3': 'Right corner 3',
  'Above the Break 3': 'Above the break 3',
  Backcourt: 'Backcourt',
}
export const zoneLabel = (z: string) => ZONE_LABEL[z] ?? z
