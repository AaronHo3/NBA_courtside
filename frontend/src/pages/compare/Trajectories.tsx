import { useMemo } from 'react'
import type { Data, Layout } from 'plotly.js'
import { Plot, useChartTheme } from '@/components/charts/Plot'
import { Panel, Segmented } from '@/components/ui'
import type { PlayerProfile } from '@/lib/types'
import { formatCellValue } from './format'
import { alignTrajectory, num, seasonSeries, type AlignMode } from './math'
import { METRICS, TRAJECTORY_METRICS } from './metrics'
import type { ComparedPlayer } from './model'
import { PlayerLegend } from './PlayerLegend'
import { SpecLabel } from './SpecLabel'

type Props = { players: ComparedPlayer[]; colors: string[]; profiles: Map<number, PlayerProfile>; mode: AlignMode; setMode: (m: AlignMode) => void }

const LOW_MINUTES = 250
const CHART_HEIGHT = 220

export const MODE_OPTIONS: Array<{ value: AlignMode; label: string; title: string }> = [
  { value: 'season', label: 'Same season', title: 'Calendar seasons side by side' },
  { value: 'age', label: 'Age', title: 'Age at each season' },
  { value: 'career_year', label: 'Career year', title: 'Years since first season on record' },
]
const MODE_TEXT: Record<AlignMode, string> = {
  season: 'Same-season view: each x position is one calendar season, so you are comparing the same league context.',
  age: 'Age-aligned view: x is the player’s age in that season, so players from different eras line up by development stage, not by season.',
  career_year: 'Career-year-aligned view: x is years since each player’s first season on record (1 = rookie season on record).',
}

export function Trajectories({ players, colors, profiles, mode, setMode }: Props) {
  const t = useChartTheme()
  const allSeasons = useMemo(() => [...new Set(players.flatMap((p) => (profiles.get(p.id)?.seasons ?? []).map((s) => s.season)))].sort(), [players, profiles])
  const xaxis = useMemo<Partial<Layout['xaxis']>>(() => {
    if (mode === 'season') return { type: 'category', categoryorder: 'array', categoryarray: allSeasons, tickangle: -45 }
    if (mode === 'age') return { title: { text: 'Age at season' }, dtick: 2 }
    return { title: { text: 'Career year' }, dtick: 1, tick0: 1 }
  }, [mode, allSeasons])

  return (
    <Panel
      question="How did their careers unfold?"
      method={MODE_TEXT[mode]}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <Segmented ariaLabel="Trajectory x-axis" value={mode} onChange={setMode} options={MODE_OPTIONS} />
          <PlayerLegend players={players} colors={colors} />
        </div>
      }
    >
      <p className="mb-3 text-xs text-ink-3">One line per player per metric; each season uses the full-season aggregate for traded players. Open markers: seasons under {LOW_MINUTES} minutes (low sample).</p>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
        {TRAJECTORY_METRICS.map((k) => {
          const spec = METRICS[k]
          const data: Data[] = players.map((p, i) => {
            const rows = seasonSeries(profiles.get(p.id)?.seasons ?? [])
            const pts = alignTrajectory(rows, mode, (r) => spec.value(r, 'per_game'))
            const byX = new Map(rows.map((r) => [r.season, r]))
            return {
              type: 'scatter',
              mode: 'lines+markers',
              name: p.name,
              x: pts.map((q) => q.x),
              y: pts.map((q) => q.y),
              line: { color: colors[i], width: 2 },
              marker: { color: colors[i], size: 7, symbol: pts.map((q) => ((num(byX.get(q.season)?.min) ?? 0) < LOW_MINUTES ? 'circle-open' : 'circle')), line: { width: 2, color: colors[i] } },
              customdata: pts.map((q) => {
                const r = byX.get(q.season)
                const minutes = num(r?.min)
                return [formatCellValue(spec, q.y, 'per_game'), `${q.season}${q.team ? ` (${q.team})` : ''}`, `age ${formatCellValue(METRICS.gp, num(r?.age), 'per_game') === '–' ? '–' : (num(r?.age) ?? 0).toFixed(1)}`, minutes !== null && minutes < LOW_MINUTES ? ` · ${Math.round(minutes)} min, low sample` : '']
              }),
              hovertemplate: '<b>%{customdata[0]}</b> · %{fullData.name}<br>%{customdata[1]}, %{customdata[2]}%{customdata[3]}<extra></extra>',
              showlegend: false,
            }
          })
          const layout: Partial<Layout> = {
            height: CHART_HEIGHT,
            margin: { l: 44, r: 8, t: 10, b: mode === 'season' ? 48 : 36 },
            showlegend: false,
            hovermode: 'closest',
            xaxis: { ...xaxis, automargin: true, tickfont: { size: 10, color: t.ink3 } },
            yaxis: { tickformat: spec.kind === 'pct' ? '.0%' : undefined, nticks: 5, automargin: true, zeroline: spec.kind === 'rating' },
          }
          return (
            <figure key={k} className="min-w-0 rounded-[var(--radius-control)] border border-line p-2">
              <figcaption className="mb-1"><SpecLabel spec={spec} norm="per_game" /></figcaption>
              <div style={{ height: CHART_HEIGHT }}>
                <Plot data={data} layout={layout} config={{ displayModeBar: false }} />
              </div>
            </figure>
          )
        })}
      </div>
    </Panel>
  )
}
