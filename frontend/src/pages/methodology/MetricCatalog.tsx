import { useMemo, useState } from 'react'
import { Badge, ErrorState, Input } from '@/components/ui'
import { useMetrics } from '@/hooks/useApi'
import type { Metric } from '@/lib/types'
import { Code, P, Section } from './Prose'

const KIND_ORDER = ['counting', 'pct', 'rate', 'rating', 'physical', 'context']

function direction(m: Metric): string {
  if (m.higher_is_better === true) return 'Higher is better'
  if (m.higher_is_better === false) return 'Lower is better'
  return 'Neutral (context)'
}

/** The full catalog served by /api/meta/metrics with a text filter over label, key, kind and definition. */
export function MetricCatalog() {
  const metrics = useMetrics()
  const [filter, setFilter] = useState('')
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const list = metrics.data?.data ?? []
    const filtered = q ? list.filter((m) => [m.label, m.key, m.kind, m.definition, m.formula ?? '', m.source].some((s) => s.toLowerCase().includes(q))) : list
    return [...filtered].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.label.localeCompare(b.label))
  }, [metrics.data, filter])
  const total = metrics.data?.data.length ?? 0

  return (
    <Section
      id="metrics"
      question="What does every metric mean, exactly?"
      method="Definitions, formulas, direction and source for every key the API serves. Percentages are stored as fractions and displayed ×100."
      actions={<Input aria-label="Filter metrics" placeholder="Filter by name, key, kind, definition" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-64" />}
    >
      {metrics.error ? <ErrorState error={metrics.error} retry={() => { void metrics.refetch() }} /> : <P>{rows.length} of {total} metrics{filter ? ` match "${filter}"` : ''}.</P>}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3">
              <th className="py-1 pr-3 font-medium">Metric</th>
              <th className="py-1 pr-3 font-medium">Key</th>
              <th className="py-1 pr-3 font-medium">Kind</th>
              <th className="py-1 pr-3 font-medium">Definition</th>
              <th className="py-1 pr-3 font-medium">Formula</th>
              <th className="py-1 pr-3 font-medium">Direction</th>
              <th className="py-1 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.key} className="border-t border-line align-top">
                <td className="py-1.5 pr-3 whitespace-nowrap text-ink">{m.label}</td>
                <td className="py-1.5 pr-3"><Code>{m.key}</Code></td>
                <td className="py-1.5 pr-3"><Badge>{m.kind}</Badge></td>
                <td className="py-1.5 pr-3 min-w-56 text-ink-2">{m.definition}</td>
                <td className="py-1.5 pr-3 min-w-40 text-xs text-ink-2">{m.formula ? <Code>{m.formula}</Code> : <span className="text-ink-3">provider value</span>}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap text-ink-2">{direction(m)}</td>
                <td className="py-1.5 whitespace-nowrap text-xs text-ink-2">{m.source}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-ink-3">No metric matches that filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </Section>
  )
}
