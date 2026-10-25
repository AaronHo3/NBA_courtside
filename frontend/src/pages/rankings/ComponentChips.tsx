import type { LensComponent } from '@/lib/types'

export function Swatch({ color }: { color: string | undefined }) {
  return <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color ?? 'var(--ink-3)' }} />
}

/** Legend for the stacked chart and a compact recap of the components in use. */
export function ComponentLegend({ components, colors }: { components: ReadonlyArray<LensComponent>; colors: Map<string, string> }) {
  if (components.length < 2) return null
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2" aria-label="Chart legend: components">
      {components.map((c) => (
        <li key={c.metric} className="inline-flex items-center gap-1.5">
          <Swatch color={colors.get(c.metric)} />
          <span>{c.label}</span>
          <span className="text-ink-3">{c.higher_is_better ? '↑' : '↓'}</span>
        </li>
      ))}
    </ul>
  )
}
