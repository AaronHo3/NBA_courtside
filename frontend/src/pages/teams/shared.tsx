import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { Info, Select } from '@/components/ui'
import { teamMetric, type TeamMetricDef } from './teamMetrics'

/** Method / caveat line under a chart. */
export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx('mt-2 text-xs leading-4 text-ink-3 max-w-prose', className)}>{children}</p>
}

/** Metric header with its definition on hover/focus. `definition` overrides the registry (e.g. server meta.definitions). */
export function MetricHeader({ metric, definition, short }: { metric: string; definition?: string; short?: boolean }) {
  const m = teamMetric(metric)
  const text = [definition ?? m.definition, m.higherIsBetter === false ? 'Lower is better.' : null].filter(Boolean).join(' ')
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span>{short ? m.short : m.label}</span>
      <Info text={text} />
    </span>
  )
}

export function MetricSelect({ label, value, onChange, options, ariaLabel }: { label?: string; ariaLabel?: string; value: string; onChange: (v: string) => void; options: readonly TeamMetricDef[] }) {
  return (
    <Select label={label} aria-label={ariaLabel ?? label} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
    </Select>
  )
}

/** HTML legend for charts whose Plotly legend would crowd the plot (small multiples, many stacked segments). */
export function LegendChips({ items, ariaLabel }: { items: Array<{ label: string; color: string; hollow?: boolean }>; ariaLabel: string }) {
  return (
    <ul aria-label={ariaLabel} className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 p-0 text-xs text-ink-2 list-none">
      {items.map((it, i) => (
        <li key={`${i}-${it.label}`} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: it.color, background: it.hollow ? 'transparent' : it.color }} />
          {it.label}
        </li>
      ))}
    </ul>
  )
}
