import type { KeyboardEvent, MouseEvent, FocusEvent } from 'react'
import type { HexBin, Shot, ZoneSummary } from '@/lib/types'
import { formatPct } from '@/lib/format'
import { frequencyToOpacity, frequencyToScale, formatMetricValue, type AccuracyMetric, type ColourScale } from './colour'
import { diffTooltip, hexTooltip, shotTooltip, zoneTooltip } from './tooltips'
import type { DiffBin } from './diff'
import { hexPath, providerToFeet, zoneLabel, zoneShapes, type CourtScales } from './geometry'
import type { CourtSelection, FrequencyEncoding, MarkerFilter } from './types'
import { sameSelection } from './types'
import type { CourtGeometry } from '@/lib/types'

export type Ink = { ink: string; ink2: string; ink3: string; axis: string; accent: string; surface: string }

export type InteractionProps = {
  onEnter: (lines: string[], e: MouseEvent | FocusEvent) => void
  onMove: (e: MouseEvent) => void
  onLeave: () => void
  onSelect?: (sel: CourtSelection | null) => void
}

const activate = (e: KeyboardEvent, fn?: () => void) => {
  if (!fn) return
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn() }
}

export function HexLayer({ bins, scales: s, sizeFt, metric, scale, encoding, threshold, hideLowSample, selected, hatchId, ink, io, density }: {
  bins: readonly HexBin[]; scales: CourtScales; sizeFt: number; metric: AccuracyMetric; scale: ColourScale; encoding: FrequencyEncoding
  threshold?: number; hideLowSample?: boolean; selected?: CourtSelection | null; hatchId: string; ink: Ink; io: InteractionProps; density?: boolean
}) {
  const maxF = bins.reduce((m, b) => Math.max(m, b.frequency), 0)
  const R = s.px(sizeFt)
  return (
    <g data-testid="hex-layer">
      {bins.map((b) => {
        const low = threshold !== undefined ? b.fga < threshold : b.low_sample
        if (low && hideLowSample) return null
        const sizeEnc = encoding === 'size' && !density
        const k = sizeEnc ? frequencyToScale(b.frequency, maxF) : 0.96
        const op = sizeEnc ? 1 : frequencyToOpacity(b.frequency, maxF)
        const fill = density ? ink.accent : scale.colour(b[metric])
        const sel = sameSelection(selected, { kind: 'hex', q: b.q, r: b.r })
        const d = hexPath(s.x(b.x_ft), s.y(b.y_ft), R, k)
        const label = `${zoneLabel(b.zone)} bin, ${hexTooltip(b, metric, threshold)[0]}`
        const choose = io.onSelect ? () => io.onSelect?.(sel ? null : { kind: 'hex', q: b.q, r: b.r }) : undefined
        return (
          <g
            key={`${b.q},${b.r}`}
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={sel}
            className="cursor-pointer outline-none"
            onMouseEnter={(e) => io.onEnter(hexTooltip(b, metric, threshold), e)}
            onMouseMove={io.onMove}
            onMouseLeave={io.onLeave}
            onFocus={(e) => io.onEnter(hexTooltip(b, metric, threshold), e)}
            onBlur={io.onLeave}
            onClick={choose}
            onKeyDown={(e) => activate(e, choose)}
          >
            <path d={d} fill={fill ?? 'none'} fillOpacity={low ? op * 0.45 : op} stroke={fill ? 'none' : ink.ink3} strokeDasharray={fill ? undefined : '2 2'} />
            {low && <path d={d} fill={`url(#${hatchId})`} />}
            {sel && <path d={hexPath(s.x(b.x_ft), s.y(b.y_ft), R, 1)} fill="none" stroke={ink.ink} strokeWidth={2} />}
          </g>
        )
      })}
    </g>
  )
}

export function DiffLayer({ bins, scales: s, sizeFt, metric, scale, encoding, hideLowSample, selected, hatchId, ink, io, labels }: {
  bins: readonly DiffBin[]; scales: CourtScales; sizeFt: number; metric: AccuracyMetric; scale: ColourScale; encoding: FrequencyEncoding
  hideLowSample?: boolean; selected?: CourtSelection | null; hatchId: string; ink: Ink; io: InteractionProps; labels: [string, string]
}) {
  const maxF = bins.reduce((m, b) => Math.max(m, b.frequency), 0)
  const R = s.px(sizeFt)
  return (
    <g data-testid="diff-layer">
      {bins.map((b) => {
        if (b.low_sample && hideLowSample) return null
        const k = encoding === 'size' ? frequencyToScale(b.frequency, maxF) : 0.96
        const op = encoding === 'size' ? 1 : frequencyToOpacity(b.frequency, maxF)
        const fill = b.delta === null ? null : scale.colour(b.delta)
        const sel = sameSelection(selected, { kind: 'hex', q: b.q, r: b.r })
        const d = hexPath(s.x(b.x_ft), s.y(b.y_ft), R, k)
        const lines = diffTooltip(b, metric, labels)
        const choose = io.onSelect ? () => io.onSelect?.(sel ? null : { kind: 'hex', q: b.q, r: b.r }) : undefined
        return (
          <g key={`${b.q},${b.r}`} role="button" tabIndex={0} aria-label={`${zoneLabel(b.zone)} bin, ${lines[0]}`} aria-pressed={sel} className="cursor-pointer outline-none"
            onMouseEnter={(e) => io.onEnter(lines, e)} onMouseMove={io.onMove} onMouseLeave={io.onLeave} onFocus={(e) => io.onEnter(lines, e)} onBlur={io.onLeave} onClick={choose} onKeyDown={(e) => activate(e, choose)}>
            <path d={d} fill={fill ?? 'none'} fillOpacity={b.low_sample ? op * 0.45 : op} stroke={fill ? 'none' : ink.ink3} strokeWidth={1} strokeDasharray={fill ? undefined : '3 2'} />
            {b.low_sample && fill && <path d={d} fill={`url(#${hatchId})`} />}
            {sel && <path d={hexPath(s.x(b.x_ft), s.y(b.y_ft), R, 1)} fill="none" stroke={ink.ink} strokeWidth={2} />}
          </g>
        )
      })}
    </g>
  )
}

export function ZoneLayer({ geometry, zones, scales: s, metric, scale, threshold, selected, hatchId, ink, io }: {
  geometry: CourtGeometry; zones: readonly ZoneSummary[]; scales: CourtScales; metric: AccuracyMetric; scale: ColourScale
  threshold?: number; selected?: CourtSelection | null; hatchId: string; ink: Ink; io: InteractionProps
}) {
  const byZone = new Map(zones.map((z) => [z.zone, z]))
  const fontSize = Math.max(9, Math.min(13, s.px(1.3)))
  return (
    <g data-testid="zone-layer">
      {zoneShapes(geometry).map((shape) => {
        const z = byZone.get(shape.zone) ?? null
        const low = z ? (threshold !== undefined ? z.fga < threshold : z.low_sample) : false
        const fill = z ? scale.colour(z[metric]) : null
        const sel = sameSelection(selected, { kind: 'zone', zone: shape.zone })
        const d = shape.path(s)
        const lines = zoneTooltip(z, shape.zone, metric, threshold)
        const choose = io.onSelect ? () => io.onSelect?.(sel ? null : { kind: 'zone', zone: shape.zone }) : undefined
        return (
          <g key={shape.zone} role="button" tabIndex={0} aria-label={`${zoneLabel(shape.zone)}: ${lines[0]}`} aria-pressed={sel} className="cursor-pointer outline-none"
            onMouseEnter={(e) => io.onEnter(lines, e)} onMouseMove={io.onMove} onMouseLeave={io.onLeave} onFocus={(e) => io.onEnter(lines, e)} onBlur={io.onLeave} onClick={choose} onKeyDown={(e) => activate(e, choose)}>
            <path d={d} fillRule="evenodd" fill={fill ?? ink.surface} fillOpacity={fill ? (low ? 0.4 : 0.85) : 0.3} stroke={sel ? ink.ink : ink.axis} strokeWidth={sel ? 2.5 : 1} />
            {low && fill && <path d={d} fillRule="evenodd" fill={`url(#${hatchId})`} />}
            <text x={s.x(shape.label.x_ft)} y={s.y(shape.label.y_ft)} textAnchor="middle" fill={ink.ink} fontSize={fontSize} fontWeight={600} className="tnum pointer-events-none" style={{ paintOrder: 'stroke', stroke: ink.surface, strokeWidth: 3, strokeLinejoin: 'round' }}>
              <tspan x={s.x(shape.label.x_ft)}>{z ? formatMetricValue(metric, z[metric]) : '–'}</tspan>
              <tspan x={s.x(shape.label.x_ft)} dy={fontSize * 1.15} fontWeight={400} fontSize={fontSize * 0.9}>{z ? `${z.fga} FGA · ${formatPct(z.fg_pct, 0)}` : 'no attempts'}</tspan>
            </text>
          </g>
        )
      })}
    </g>
  )
}

export function MarkerLayer({ shots, scales: s, filter, emphasise, ink, io, teamName }: {
  shots: readonly Shot[]; scales: CourtScales; filter: MarkerFilter; emphasise?: (sh: Shot) => boolean; ink: Ink; io: InteractionProps; teamName?: (id: number) => string
}) {
  const r = Math.max(2.2, s.px(0.45))
  const visible = shots.filter((sh) => filter === 'both' || (filter === 'made') === (sh.shot_made_flag === 1))
  return (
    <g data-testid="marker-layer">
      {visible.map((sh) => {
        const { x_ft, y_ft } = providerToFeet(sh.loc_x, sh.loc_y)
        const dim = emphasise ? !emphasise(sh) : false
        const made = sh.shot_made_flag === 1
        const lines = shotTooltip(sh, teamName)
        return (
          <circle
            key={`${sh.game_id}-${sh.game_event_id}`}
            cx={s.x(x_ft)}
            cy={s.y(y_ft)}
            r={r}
            fill={made ? ink.accent : 'none'}
            stroke={made ? ink.surface : ink.ink2}
            strokeWidth={made ? 0.6 : 1.2}
            opacity={dim ? 0.15 : made ? 0.9 : 0.8}
            tabIndex={-1}
            aria-label={lines.join('; ')}
            onMouseEnter={(e) => io.onEnter(lines, e)}
            onMouseMove={io.onMove}
            onMouseLeave={io.onLeave}
          />
        )
      })}
    </g>
  )
}
