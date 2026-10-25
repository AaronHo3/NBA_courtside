import { clsx } from 'clsx'
import { useChartTheme } from '@/components/charts/Plot'
import { Badge, Panel } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import type { TimelineSeason } from './helpers'

type Props = { seasons: TimelineSeason[]; teams: string[]; focusSeason: string; onFocus: (season: string) => void }

export function CareerTimeline({ seasons, teams, focusSeason, onFocus }: Props) {
  const t = useChartTheme()
  const colour = (abbr: string) => {
    const i = teams.indexOf(abbr)
    return i >= 0 && i < t.series.length ? t.series[i] : t.ink3
  }
  return (
    <Panel className="min-w-0" question="Where has he played, season by season?" method="One cell per season from the season log; a traded season lists every stint with its games and minutes. Select a season to put it in focus.">
      {seasons.length === 0 ? (
        <p className="text-sm text-ink-3">No seasons on record.</p>
      ) : (
        <>
          <ol className="flex max-w-full gap-1.5 overflow-x-auto pb-2" aria-label="Career timeline">
            {seasons.map((s) => {
              const focused = s.season === focusSeason
              return (
                <li key={s.season} className="shrink-0">
                  <button
                    type="button"
                    aria-pressed={focused}
                    onClick={() => onFocus(s.season)}
                    className={clsx('flex min-w-[88px] flex-col gap-1 rounded-[var(--radius-control)] border p-2 text-left text-xs transition-colors hover:border-accent', focused ? 'border-accent bg-accent-soft' : 'border-line bg-raised')}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className={clsx('tnum font-medium', focused ? 'text-ink' : 'text-ink-2')}>{s.season}</span>
                      {s.traded && <Badge tone="warning" className="!px-1.5">Traded</Badge>}
                    </span>
                    {s.stints.map((st) => (
                      <span key={`${st.team_id}-${st.team_abbreviation}`} className="flex items-center gap-1.5" title={st.team_name ?? st.team_abbreviation}>
                        <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colour(st.team_abbreviation) }} />
                        <span className="text-ink">{st.team_abbreviation}</span>
                        <span className="tnum text-ink-3">{formatNumber(st.gp, 0)} gp · {formatNumber(st.min, 0)} min</span>
                      </span>
                    ))}
                  </button>
                </li>
              )
            })}
          </ol>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Teams">
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
        </>
      )}
    </Panel>
  )
}
