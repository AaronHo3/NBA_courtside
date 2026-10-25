import { useMetricIndex } from '@/hooks/useApi'
import { metricLabelWithNorm } from '@/lib/format'
import type { Normalization } from '@/lib/types'
import { Info } from './index'

/** Metric name with its definition, formula and source on hover/focus. */
export function MetricLabel({ metric, normalization = 'per_game', showInfo = true }: { metric: string; normalization?: Normalization; showInfo?: boolean }) {
  const { get } = useMetricIndex()
  const m = get(metric)
  const text = m ? [m.definition, m.formula ? `Formula: ${m.formula}` : null, `Source: ${m.source}`, m.higher_is_better === false ? 'Lower is better.' : null].filter(Boolean).join(' ') : metric
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span>{metricLabelWithNorm(m, metric, normalization)}</span>
      {showInfo && <Info text={text} />}
    </span>
  )
}
