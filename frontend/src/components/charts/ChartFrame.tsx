import { clsx } from 'clsx'
import type { CSSProperties, ReactNode } from 'react'

export type ChartSwatch = 'pos' | 'neg' | 'accent' | 'neutral' | 'hatched'
export type ChartLegendItem = { label: string; color?: string; swatch?: ChartSwatch }

const SWATCH: Record<ChartSwatch, CSSProperties> = {
  pos: { background: 'var(--pos)' },
  neg: { background: 'var(--neg)' },
  accent: { background: 'var(--accent)' },
  neutral: { background: 'var(--ink-3)' },
  hatched: { background: 'repeating-linear-gradient(45deg, var(--c-hatch) 0 2px, transparent 2px 4px)', boxShadow: 'inset 0 0 0 1px var(--line-strong)' },
}

function swatchStyle(item: ChartLegendItem): CSSProperties {
  if (item.color) return { background: item.color }
  return SWATCH[item.swatch ?? 'neutral']
}

/**
 * Titled container for a chart (Plotly or SVG): the question it answers, legend chips, actions, a fixed
 * plot height so loading and empty states never shift the page, and an explicit unavailable state.
 */
export function ChartFrame({ title, question, legend, actions, height = 320, unavailable, children, className, testId }: {
  title: string
  question?: ReactNode
  legend?: ChartLegendItem[]
  actions?: ReactNode
  height?: number
  /** When set, replaces the chart with this note naming what is missing. */
  unavailable?: ReactNode
  children: ReactNode
  className?: string
  testId?: string
}) {
  return (
    <figure aria-label={title} data-testid={testId} className={clsx('m-0 flex min-w-0 flex-col gap-2', className)}>
      <figcaption className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-5 text-ink">{title}</h3>
          {question && <p className="mt-0.5 max-w-[72ch] text-xs text-ink-2">{question}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        {legend && legend.length > 0 && (
          <ul aria-label="Legend" className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
            {legend.map((item) => (
              <li key={item.label} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={swatchStyle(item)} />
                {item.label}
              </li>
            ))}
          </ul>
        )}
      </figcaption>
      {unavailable ? (
        <div role="note" className="flex items-center justify-center rounded-[var(--radius-control)] border border-dashed border-line-strong px-4 text-center text-sm text-ink-2" style={{ minHeight: height }}>
          {unavailable}
        </div>
      ) : (
        <div className="min-w-0" style={{ height }}>{children}</div>
      )}
    </figure>
  )
}
