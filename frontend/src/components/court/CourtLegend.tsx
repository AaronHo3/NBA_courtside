import { useId } from 'react'
import { METRIC_LABEL, formatMetricValue, type AccuracyMetric, type ColourScale, type Domain } from './colour'
import { hexPath } from './geometry'
import type { CourtLayer, FrequencyEncoding } from './types'
import type { Ink } from './layers'

/** Colour bar (fixed domain), frequency encoding key, low-sample and marker swatches. Always rendered beside the court. */
export function CourtLegend({ layer, metric, domain, scale, encoding, threshold, diff, ink, hatchId, diffLabels }: {
  layer: CourtLayer; metric: AccuracyMetric; domain: Domain; scale: ColourScale; encoding: FrequencyEncoding; threshold?: number; diff?: boolean; ink: Ink; hatchId: string; diffLabels?: [string, string]
}) {
  const gradId = useId()
  const [lo, hi] = domain
  const mid = (lo + hi) / 2
  const fmt = (v: number) => formatMetricValue(metric, v, Boolean(diff))
  const diverging = scale.diverging
  const title = layer === 'density'
    ? 'Opacity = frequency (share of attempts)'
    : diff ? `Colour = A − B difference in ${METRIC_LABEL[metric]} (diverging)`
      : diverging ? `Colour = relative accuracy · ${METRIC_LABEL[metric]} (diverging)` : `Colour = accuracy · ${METRIC_LABEL[metric]}`
  const stops = layer === 'density' ? [ink.accent, ink.accent] : scale.stops
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3 text-xs text-ink-2 md:flex-col md:gap-3" data-testid="court-legend">
      {layer !== 'markers' && (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-ink">{title}</span>
          <svg width="170" height="12" role="img" aria-label={`Colour scale from ${fmt(lo)} to ${fmt(hi)}`}>
            <defs>
              <linearGradient id={gradId} x1="0" x2="1" y1="0" y2="0">
                {stops.map((c, i) => <stop key={i} offset={`${(i / (stops.length - 1)) * 100}%`} stopColor={c} stopOpacity={layer === 'density' ? (i === 0 ? 0.25 : 1) : 1} />)}
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="170" height="12" rx="2" fill={`url(#${gradId})`} />
          </svg>
          {layer === 'density' ? (
            <div className="flex w-[170px] justify-between tnum"><span>fewer</span><span>more</span></div>
          ) : (
            <div className="flex w-[170px] justify-between tnum"><span>≤ {fmt(lo)}</span><span>{fmt(mid)}</span><span>≥ {fmt(hi)}</span></div>
          )}
          {layer !== 'density' && <span className="max-w-[260px] text-ink-3">Fixed range; values beyond it are clamped so subjects share one scale.</span>}
          {layer !== 'density' && (
            <span className="max-w-[260px] text-ink-3">
              {diverging ? 'Diverging scale: the middle colour is no difference; the two ends are below and above.' : 'Relative FG% switches to a diverging scale centred on the league zone average.'}
            </span>
          )}
        </div>
      )}
      {(layer === 'hex' || layer === 'density') && (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-ink">{layer === 'density' || encoding === 'opacity' ? 'Opacity = frequency (share of attempts)' : 'Size = frequency (share of attempts)'}</span>
          <div className="flex items-center gap-2">
            <svg width="70" height="26" aria-hidden="true">
              {layer === 'density' || encoding === 'opacity' ? (
                <>
                  <path d={hexPath(13, 13, 11)} fill={ink.ink3} fillOpacity={0.25} />
                  <path d={hexPath(40, 13, 11)} fill={ink.ink3} fillOpacity={0.6} />
                  <path d={hexPath(62, 13, 11)} fill={ink.ink3} fillOpacity={1} />
                </>
              ) : (
                <>
                  <path d={hexPath(13, 13, 11, 0.35)} fill={ink.ink3} />
                  <path d={hexPath(40, 13, 11, 0.65)} fill={ink.ink3} />
                  <path d={hexPath(62, 13, 11, 1)} fill={ink.ink3} />
                </>
              )}
            </svg>
            <span>fewer → more (square-root scale)</span>
          </div>
        </div>
      )}
      {layer !== 'markers' && (
        <div className="flex items-center gap-2">
          <svg width="22" height="22" aria-hidden="true"><path d={hexPath(11, 11, 10)} fill={ink.ink3} fillOpacity={0.35} /><path d={hexPath(11, 11, 10)} fill={`url(#${hatchId})`} /></svg>
          <span>Hatched: {threshold !== undefined ? `fewer than ${threshold} attempts` : 'low sample'}</span>
        </div>
      )}
      {diff && (
        <div className="flex items-center gap-2">
          <svg width="22" height="22" aria-hidden="true"><path d={hexPath(11, 11, 10)} fill="none" stroke={ink.ink3} strokeDasharray="3 2" /></svg>
          <span>Hollow: only one subject shot here{diffLabels ? ` (A = ${diffLabels[0]}, B = ${diffLabels[1]})` : ''}</span>
        </div>
      )}
      {layer === 'markers' && (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-ink">Shot result</span>
          <div className="flex items-center gap-2"><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill={ink.accent} /></svg><span>Made (filled)</span></div>
          <div className="flex items-center gap-2"><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke={ink.ink2} strokeWidth="1.4" /></svg><span>Missed (ring)</span></div>
        </div>
      )}
    </div>
  )
}
