import { useId } from 'react'
import { useChartTheme } from '@/components/charts/Plot'
import { colourDomain, makeColourScale, type AccuracyMetric, type Domain, type RangePreset } from './colour'
import { CourtLegend } from './CourtLegend'
import type { Ink } from './layers'
import type { CourtLayer, FrequencyEncoding } from './types'

export type CourtKeyProps = {
  layer: CourtLayer
  metric: AccuracyMetric
  domain?: Domain
  rangePreset?: RangePreset
  encoding: FrequencyEncoding
  threshold?: number
  diff?: boolean
  diffLabels?: [string, string]
}

/**
 * The court legend on its own, for layouts that place it away from the chart (e.g. a side column).
 * Uses the same fixed colour scale as `CourtChart` for the same metric, domain and diff flag.
 */
export function CourtKey({ layer, metric, domain, rangePreset = 'standard', encoding, threshold, diff = false, diffLabels }: CourtKeyProps) {
  const t = useChartTheme()
  const hatchId = useId()
  const d = domain ?? colourDomain(metric, rangePreset, diff)
  const scale = makeColourScale(metric, d, t.theme, diff)
  const ink: Ink = { ink: t.ink, ink2: t.ink2, ink3: t.ink3, axis: t.axis, accent: t.accent, surface: t.surface }
  return (
    <div>
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <defs>
          <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={t.ink3} strokeWidth="1.2" strokeOpacity="0.9" />
          </pattern>
        </defs>
      </svg>
      <CourtLegend layer={layer} metric={metric} domain={d} scale={scale} encoding={encoding} threshold={threshold} diff={diff} ink={ink} hatchId={hatchId} diffLabels={diffLabels} />
    </div>
  )
}
