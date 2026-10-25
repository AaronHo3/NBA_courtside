import { Info } from '@/components/ui'
import { useMetricIndex } from '@/hooks/useApi'
import type { Normalization } from '@/lib/types'
import { labelFor, type MetricSpec } from './metrics'

/** Metric heading with a definition tooltip assembled from the catalog and the spec's own note. */
export function SpecLabel({ spec, norm }: { spec: MetricSpec; norm: Normalization }) {
  const { get } = useMetricIndex()
  const cat = spec.catalogKey ? get(spec.catalogKey) : undefined
  const parts = [cat?.definition, cat?.formula && !spec.note ? `Formula: ${cat.formula}` : null, spec.note, spec.higherIsBetter === false ? 'Lower is better; ranks and percentiles are flipped accordingly.' : null, spec.higherIsBetter === null ? 'No better direction; nothing is highlighted as best.' : null, cat ? `Source: ${cat.source}` : null].filter(Boolean)
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-xs font-medium text-ink-2">
      <span className="truncate">{labelFor(spec, norm)}{spec.unit === 'in' ? ' (in)' : ''}</span>
      {parts.length > 0 && <Info text={parts.join(' ')} />}
    </span>
  )
}
