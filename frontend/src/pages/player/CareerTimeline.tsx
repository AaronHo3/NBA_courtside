import { clsx } from 'clsx'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useChartTheme } from '@/components/charts/Plot'
import { Badge, Button, Panel } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import type { TimelineSeason } from './helpers'

type Props = { seasons: TimelineSeason[]; teams: string[]; focusSeason: string; onFocus: (season: string) => void }

/** Cell width (Tailwind `w-[160px]`) plus the 6px gap; one button press moves about a strip-width. */
const CELL_PX = 160
const GAP_PX = 6
const FADE_PX = 32

type Edges = { start: boolean; end: boolean }

function edgesOf(el: HTMLElement): Edges {
  const max = el.scrollWidth - el.clientWidth
  return { start: el.scrollLeft > 1, end: max - el.scrollLeft > 1 }
}

/** Mask the strip's overflowing edges so the cut-off reads as "more this way" on any background. */
function fadeMask({ start, end }: Edges): CSSProperties | undefined {
  if (!start && !end) return undefined
  const mask = `linear-gradient(to right, ${start ? 'transparent' : '#000'} 0, #000 ${start ? FADE_PX : 0}px, #000 calc(100% - ${end ? FADE_PX : 0}px), ${end ? 'transparent' : '#000'} 100%)`
  return { maskImage: mask, WebkitMaskImage: mask }
}

function useStripScroll(focusSeason: string, count: number) {
  const ref = useRef<HTMLOListElement>(null)
  const [edges, setEdges] = useState<Edges>({ start: false, end: false })
  const sync = useCallback(() => { if (ref.current) setEdges(edgesOf(ref.current)) }, [])

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [sync])

  // Bring the focus season into view horizontally without scrolling the page.
  useLayoutEffect(() => {
    const el = ref.current
    const cell = el?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (el && cell) {
      const li = cell.parentElement ?? cell
      const left = li.offsetLeft - el.offsetLeft
      if (left < el.scrollLeft || left + li.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollLeft = Math.max(0, left - (el.clientWidth - li.offsetWidth) / 2)
    }
    sync()
  }, [focusSeason, count, sync])

  const page = (dir: -1 | 1) => {
    const el = ref.current
    if (!el) return
    const step = Math.max(CELL_PX + GAP_PX, Math.floor((el.clientWidth - FADE_PX) / (CELL_PX + GAP_PX)) * (CELL_PX + GAP_PX))
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: dir * step, behavior: reduce ? 'auto' : 'smooth' })
  }
  return { ref, edges, sync, page }
}

export function CareerTimeline({ seasons, teams, focusSeason, onFocus }: Props) {
  const t = useChartTheme()
  const { ref, edges, sync, page } = useStripScroll(focusSeason, seasons.length)
  const colour = (abbr: string) => {
    const i = teams.indexOf(abbr)
    return i >= 0 && i < t.series.length ? t.series[i] : t.ink3
  }
  const overflow = edges.start || edges.end
  return (
    <Panel
      className="min-w-0"
      question="Where has he played, season by season?"
      method="One cell per season from the season log; a traded season lists every stint with its games and minutes. Select a season to put it in focus."
      actions={seasons.length > 0 ? (
        <div className="flex items-center gap-1" role="group" aria-label="Scroll the timeline">
          <Button size="sm" aria-label="Earlier seasons" disabled={!edges.start} onClick={() => page(-1)}>←</Button>
          <Button size="sm" aria-label="Later seasons" disabled={!edges.end} onClick={() => page(1)}>→</Button>
        </div>
      ) : undefined}
    >
      {seasons.length === 0 ? (
        <p className="text-sm text-ink-3">No seasons on record.</p>
      ) : (
        <>
          <ol
            ref={ref}
            onScroll={sync}
            className="flex max-w-full snap-x snap-proximity gap-1.5 overflow-x-auto pb-2 [scrollbar-width:thin]"
            style={fadeMask(edges)}
            aria-label="Career timeline"
          >
            {seasons.map((s) => {
              const focused = s.season === focusSeason
              return (
                <li key={s.season} className="shrink-0 snap-start">
                  <button
                    type="button"
                    aria-pressed={focused}
                    onClick={() => onFocus(s.season)}
                    onFocus={(e) => { if (e.currentTarget.matches?.(':focus-visible')) e.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }) }}
                    className={clsx('flex h-full w-[160px] flex-col gap-1 rounded-[var(--radius-control)] border p-2 text-left text-xs transition-colors hover:border-accent', focused ? 'border-accent bg-accent-soft' : 'border-line bg-raised')}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className={clsx('tnum font-medium', focused ? 'text-ink' : 'text-ink-2')}>{s.season}</span>
                      {s.traded && <Badge tone="warning" className="!px-1.5">Traded</Badge>}
                    </span>
                    {s.stints.map((st) => (
                      <span key={`${st.team_id}-${st.team_abbreviation}`} className="flex flex-col" title={st.team_name ?? st.team_abbreviation}>
                        <span className="flex items-center gap-1.5">
                          <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colour(st.team_abbreviation) }} />
                          <span className="text-ink">{st.team_abbreviation}</span>
                        </span>
                        <span className="tnum pl-4 text-ink-3">{formatNumber(st.gp, 0)} gp · {formatNumber(st.min, 0)} min</span>
                      </span>
                    ))}
                  </button>
                </li>
              )
            })}
          </ol>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Teams">
              {teams.map((abbr) => {
                const name = seasons.flatMap((s) => s.stints).find((st) => st.team_abbreviation === abbr)?.team_name
                return (
                  <li key={abbr} className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colour(abbr) }} />
                    {name ? `${name} (${abbr})` : abbr}
                  </li>
                )
              })}
            </ul>
            {overflow && <span className="text-xs text-ink-3">{seasons.length} seasons · scroll or use ← → for more</span>}
          </div>
        </>
      )}
    </Panel>
  )
}
