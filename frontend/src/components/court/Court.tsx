import type { CourtGeometry } from '@/lib/types'
import { circlePath, threePointPath, type CourtScales } from './geometry'

const f = (n: number) => Number(n.toFixed(3))

/**
 * Half-court markings drawn from `/api/analytics/meta/court` geometry (feet, origin at the hoop centre),
 * hoop at the bottom of the SVG. Pure presentation: no data, no interaction.
 */
export function CourtLines({ geometry: g, scales: s, stroke, strokeWidth = 1.5 }: { geometry: CourtGeometry; scales: CourtScales; stroke: string; strokeWidth?: number }) {
  const ft = g.free_throw_circle
  const ftR = s.px(ft.r)
  const ra = g.restricted_area
  const raR = s.px(ra.r)
  const cc = g.center_circle
  const ccR = s.px(cc.r)
  const b = g.bounds
  return (
    <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" data-testid="court-lines">
      <rect x={s.x(b.x_min)} y={s.y(b.y_max)} width={s.px(b.x_max - b.x_min)} height={s.px(b.y_max - b.y_min)} />
      <rect x={s.x(g.paint.x)} y={s.y(g.paint.y + g.paint.height)} width={s.px(g.paint.width)} height={s.px(g.paint.height)} />
      <rect x={s.x(g.inner_paint.x)} y={s.y(g.inner_paint.y + g.inner_paint.height)} width={s.px(g.inner_paint.width)} height={s.px(g.inner_paint.height)} />
      {/* free-throw circle: solid upper half, dashed lower half */}
      <path d={`M${f(s.x(ft.cx - ft.r))},${f(s.y(ft.cy))} A${f(ftR)},${f(ftR)} 0 0 1 ${f(s.x(ft.cx + ft.r))},${f(s.y(ft.cy))}`} />
      <path d={`M${f(s.x(ft.cx + ft.r))},${f(s.y(ft.cy))} A${f(ftR)},${f(ftR)} 0 0 1 ${f(s.x(ft.cx - ft.r))},${f(s.y(ft.cy))}`} strokeDasharray={`${f(s.px(1))} ${f(s.px(0.8))}`} />
      {/* restricted area: arc above the hoop with short legs down to the backboard */}
      <path d={`M${f(s.x(ra.cx - ra.r))},${f(s.y(g.backboard.y))} V${f(s.y(ra.cy))} A${f(raR)},${f(raR)} 0 0 1 ${f(s.x(ra.cx + ra.r))},${f(s.y(ra.cy))} V${f(s.y(g.backboard.y))}`} />
      <line x1={s.x(g.backboard.x1)} x2={s.x(g.backboard.x2)} y1={s.y(g.backboard.y)} y2={s.y(g.backboard.y)} strokeWidth={strokeWidth * 1.6} />
      <line x1={s.x(g.hoop.cx)} x2={s.x(g.hoop.cx)} y1={s.y(g.backboard.y)} y2={s.y(g.hoop.cy - g.hoop.r)} />
      <path d={circlePath(s.x(g.hoop.cx), s.y(g.hoop.cy), s.px(g.hoop.r))} />
      <path d={threePointPath(g, s)} data-testid="three-point-line" />
      <line x1={s.x(b.x_min)} x2={s.x(b.x_max)} y1={s.y(g.half_court.y)} y2={s.y(g.half_court.y)} />
      {/* centre circle: only the half on this side of the half-court line is visible */}
      <path d={`M${f(s.x(cc.cx - cc.r))},${f(s.y(cc.cy))} A${f(ccR)},${f(ccR)} 0 0 0 ${f(s.x(cc.cx + cc.r))},${f(s.y(cc.cy))}`} />
    </g>
  )
}
