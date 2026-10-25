import { useCallback, useId, useMemo, useState, type FocusEvent, type MouseEvent } from 'react'
import { clsx } from 'clsx'
import type { CourtGeometry, HexBin, Shot, ZoneSummary } from '@/lib/types'
import { useChartTheme } from '@/components/charts/Plot'
import { colourDomain, makeColourScale, type AccuracyMetric, type Domain, type RangePreset } from './colour'
import { CourtLines } from './Court'
import { CourtLegend } from './CourtLegend'
import type { DiffBin } from './diff'
import { courtScales, zoneShapes } from './geometry'
import { DiffLayer, HexLayer, MarkerLayer, ZoneLayer, type Ink, type InteractionProps } from './layers'
import type { CourtLayer, CourtSelection, FrequencyEncoding, MarkerFilter, TooltipState } from './types'
import { useContainerWidth } from './useContainerWidth'

export type CourtChartProps = {
  /** Court geometry from `/api/analytics/meta/court` (feet, origin at the hoop centre, y toward half court). */
  geometry: CourtGeometry
  /** Which data layer to draw. `density` is hex opacity by share of attempts in a single hue. */
  layer: CourtLayer
  /** Fixed pixel width. When omitted the court fills its container (up to `maxWidth`) and follows its width. */
  width?: number
  /** Upper bound on the responsive width, so a wide panel does not produce a giant court. Default 640. */
  maxWidth?: number
  /** Upper bound on the drawn height in px; the width shrinks to keep the court's aspect ratio. */
  maxHeight?: number
  /** Raw shots for the `markers` layer (provider units: tenths of a foot). */
  shots?: readonly Shot[]
  markerFilter?: MarkerFilter
  /** Dim every shot for which this returns false (e.g. shots outside the selected bin). */
  emphasiseShot?: (shot: Shot) => boolean
  /** Server hexbins (`/api/analytics/shots/hexbins`) for the `hex` and `density` layers. */
  hexbins?: readonly HexBin[]
  /** A − B cells from `mergeDifference`; when set with `layer="hex"` the chart renders deltas instead of `hexbins`. */
  diffBins?: readonly DiffBin[]
  /** Names for the two sides of a difference, used in tooltips and the legend. */
  diffLabels?: [string, string]
  /** Zone summaries (`/api/analytics/shots/zones`) for the `zones` layer. */
  zones?: readonly ZoneSummary[]
  /** Hex circumradius in feet; must match the `size_ft` the bins were requested with. */
  sizeFt?: number
  /** Accuracy metric encoded as colour. Frequency is never encoded as colour. */
  metric?: AccuracyMetric
  /** Fixed colour domain. Defaults to the `standard` preset for the metric; never derived from the data. */
  domain?: Domain
  rangePreset?: RangePreset
  /** How share of attempts is encoded on hexes: hexagon size (sqrt, 35% floor) or opacity. */
  encoding?: FrequencyEncoding
  /** Bins/zones with fewer attempts than this are hatched and desaturated. Defaults to the server's `low_sample` flag. */
  lowSampleThreshold?: number
  hideLowSample?: boolean
  selected?: CourtSelection | null
  /** Provider zone to outline (e.g. while its row in a zone table is hovered). A selected zone is outlined too. */
  highlightZone?: string | null
  /** Clicking (or Enter/Space on) a hex or zone toggles selection. */
  onSelect?: (sel: CourtSelection | null) => void
  showLegend?: boolean
  /** Where the legend sits relative to the court (ignored when `showLegend` is false). */
  legendPlacement?: 'right' | 'below'
  /** Resolve an opponent team id to a short name for marker tooltips. */
  teamName?: (id: number) => string
  /** Accessible title for the SVG. */
  title?: string
  className?: string
}

/**
 * Reusable half-court chart. Frequency and accuracy use separate encodings (size/opacity vs colour),
 * the colour domain is fixed so several charts share one scale, low-sample cells are hatched, and
 * every hex, zone and marker has a tooltip with the values first. Keyboard: Tab to a hex/zone, Enter
 * or Space to select, Escape to clear.
 */
export function CourtChart(props: CourtChartProps) {
  const {
    geometry, layer, width: fixedWidth, maxWidth = 640, maxHeight, shots = [], markerFilter = 'both', emphasiseShot, hexbins = [], diffBins, diffLabels, zones = [],
    sizeFt = 1.5, metric = 'fg_pct', rangePreset = 'standard', encoding = 'size', lowSampleThreshold, hideLowSample, selected, highlightZone, onSelect,
    showLegend = true, legendPlacement = 'right', teamName, title, className,
  } = props
  const t = useChartTheme()
  const [ref, measured] = useContainerWidth<HTMLDivElement>(fixedWidth ?? 480)
  const aspect = (geometry.bounds.x_max - geometry.bounds.x_min) / (geometry.bounds.y_max - geometry.bounds.y_min)
  const heightCap = maxHeight !== undefined ? Math.floor(maxHeight * aspect) : Infinity
  const width = fixedWidth ?? Math.min(measured, maxWidth, heightCap)
  const outlineZone = highlightZone ?? (selected?.kind === 'zone' && layer !== 'zones' ? selected.zone : null)
  const outlineShape = useMemo(() => (outlineZone ? zoneShapes(geometry).find((z) => z.zone === outlineZone) ?? null : null), [geometry, outlineZone])
  const scales = useMemo(() => courtScales(geometry, width), [geometry, width])
  const isDiff = layer === 'hex' && diffBins !== undefined
  const domain = props.domain ?? colourDomain(metric, rangePreset, isDiff)
  const scale = useMemo(() => makeColourScale(metric, domain, t.theme, isDiff), [metric, domain, t.theme, isDiff])
  const hatchId = useId()
  const ink: Ink = { ink: t.ink, ink2: t.ink2, ink3: t.ink3, axis: t.axis, accent: t.accent, surface: t.surface }

  const [tip, setTip] = useState<TooltipState>(null)
  const wrapRef = ref
  const place = useCallback((e: MouseEvent | FocusEvent) => {
    const host = wrapRef.current?.getBoundingClientRect()
    if (!host) return { x: 0, y: 0 }
    if ('clientX' in e && typeof e.clientX === 'number') return { x: e.clientX - host.left, y: e.clientY - host.top }
    const r = (e.target as Element).getBoundingClientRect()
    return { x: r.left + r.width / 2 - host.left, y: r.top - host.top }
  }, [wrapRef])
  const io: InteractionProps = useMemo(() => ({
    onEnter: (lines, e) => setTip({ ...place(e), lines }),
    onMove: (e) => setTip((cur) => (cur ? { ...cur, ...place(e) } : cur)),
    onLeave: () => setTip(null),
    onSelect,
  }), [place, onSelect])

  const threshold = lowSampleThreshold
  const legend = showLegend && (
    <CourtLegend layer={layer} metric={metric} domain={domain} scale={scale} encoding={encoding} threshold={threshold} diff={isDiff} ink={ink} hatchId={hatchId} diffLabels={diffLabels} />
  )

  return (
    <div className={clsx('flex gap-4', legendPlacement === 'right' ? 'flex-col md:flex-row md:items-start' : 'flex-col', className)}>
      <div ref={ref} className="relative min-w-0 flex-1" style={fixedWidth ? { width: fixedWidth, flex: 'none' } : { maxWidth: Math.min(maxWidth, heightCap) }} onKeyDown={(e) => { if (e.key === 'Escape' && onSelect) onSelect(null) }}>
        <svg
          role="img"
          aria-label={title ?? 'Half court shot chart'}
          viewBox={`0 0 ${scales.width} ${scales.height}`}
          width={scales.width}
          height={scales.height}
          className="block max-w-full"
          style={{ fontFamily: 'inherit' }}
        >
          <defs>
            <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke={t.ink3} strokeWidth="1.2" strokeOpacity="0.9" />
            </pattern>
          </defs>
          <rect x="0" y="0" width={scales.width} height={scales.height} fill={t.surface} />
          {layer === 'zones' && <ZoneLayer geometry={geometry} zones={zones} scales={scales} metric={metric} scale={scale} threshold={threshold} selected={selected} hatchId={hatchId} ink={ink} io={io} />}
          {layer === 'hex' && isDiff && <DiffLayer bins={diffBins!} scales={scales} sizeFt={sizeFt} metric={metric} scale={scale} encoding={encoding} hideLowSample={hideLowSample} selected={selected} hatchId={hatchId} ink={ink} io={io} labels={diffLabels ?? ['A', 'B']} />}
          {(layer === 'hex' && !isDiff || layer === 'density') && (
            <HexLayer bins={hexbins} scales={scales} sizeFt={sizeFt} metric={metric} scale={scale} encoding={encoding} threshold={threshold} hideLowSample={hideLowSample} selected={selected} hatchId={hatchId} ink={ink} io={io} density={layer === 'density'} />
          )}
          <CourtLines geometry={geometry} scales={scales} stroke={layer === 'zones' ? t.ink2 : t.ink3} strokeWidth={Math.max(1, Math.min(1.6, scales.pxPerFt / 7))} />
          {outlineShape && (
            <path d={outlineShape.path(scales)} data-testid="zone-outline" data-zone={outlineShape.zone} fillRule="evenodd" fill="none" pointerEvents="none"
              stroke={highlightZone ? t.accent : t.ink} strokeWidth={2.5} strokeDasharray={highlightZone ? '6 3' : undefined} strokeLinejoin="round" />
          )}
          {layer === 'markers' && <MarkerLayer shots={shots} scales={scales} filter={markerFilter} emphasise={emphasiseShot} ink={ink} io={io} teamName={teamName} />}
        </svg>
        {tip && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-20 max-w-[260px] rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 py-1.5 text-xs text-ink"
            style={{ left: tip.x, top: tip.y, transform: `translate(${tip.x > scales.width / 2 ? 'calc(-100% - 10px)' : '10px'}, -100%)` }}
          >
            {tip.lines.map((l, i) => <div key={i} className={clsx(i === 0 ? 'font-semibold tnum' : 'text-ink-2 tnum')}>{l}</div>)}
          </div>
        )}
      </div>
      {legend && <div className={clsx(legendPlacement === 'right' ? 'md:w-48 md:shrink-0' : 'flex flex-wrap gap-x-8')}>{legend}</div>}
    </div>
  )
}
