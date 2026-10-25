import { clsx } from 'clsx'
import type { CategoryDef } from '@/fantasy/api/types'
import { isClose, pct } from './format'

/**
 * The user's simulated chance of taking each category this week, one row per league category in the
 * league's order. Bars share a fixed 0–100% scale with a 50% tick; close calls (40–60%) carry an amber
 * dot and the word "close" so colour is never the only cue.
 */
export function CategoryOutlook({ categories, chanceOf }: { categories: CategoryDef[]; chanceOf: (key: string) => number | null }) {
  return (
    <ul className="flex flex-col" aria-label="Your chance of winning each category">
      {categories.map((c) => {
        const p = chanceOf(c.key)
        const close = isClose(p)
        return (
          <li key={c.key} data-testid="category-row" className="grid min-h-7 grid-cols-[6.5rem_minmax(0,1fr)_2.75rem_3.5rem] items-center gap-2 text-xs">
            <span data-testid="category-label" className="truncate text-ink-2">
              {c.label}
              {!c.higher_is_better && <span className="text-ink-3" title="lower is better"> ↓</span>}
            </span>
            <span className="relative h-2 overflow-hidden rounded-full bg-raised" aria-hidden="true">
              {p != null && <span className={clsx('absolute inset-y-0 left-0 rounded-full', close ? 'bg-warning' : p > 0.5 ? 'bg-pos' : 'bg-neg')} style={{ width: `${Math.max(0, Math.min(1, p)) * 100}%` }} />}
              <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
            </span>
            <span className="text-right tnum text-ink">{pct(p)}</span>
            <span className="flex items-center gap-1 text-ink-2">
              {close && (
                <>
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
                  <span>close</span>
                </>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
