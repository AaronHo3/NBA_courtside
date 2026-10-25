import { useMemo } from 'react'
import type { Data, Layout } from 'plotly.js'
import { ChartFrame } from '@/components/charts/ChartFrame'
import { Plot, useChartTheme } from '@/components/charts/Plot'
import { EmptyState, Panel } from '@/components/ui'
import type { TeamSeason } from '@/lib/types'
import { axisFormat, formatTeamMetric, numberAt, teamMetric, wl } from './teamMetrics'
import { Note } from './shared'

const TREND_METRICS = ['net_rating', 'off_rating', 'def_rating', 'pace', 'efg_pct', 'fg3a_rate'] as const

function TrendChart({ metric, rows, focus }: { metric: string; rows: TeamSeason[]; focus: string }) {
  const t = useChartTheme()
  const m = teamMetric(metric)
  const { data, layout } = useMemo(() => {
    const seasons = rows.map((r) => r.season)
    const vals = rows.map((r) => numberAt(r, metric))
    const focusIdx = seasons.indexOf(focus)
    const data: Data[] = [{
      type: 'scatter', mode: 'lines+markers', name: m.label, x: seasons, y: vals, connectgaps: false,
      line: { color: t.accent, width: 2 },
      marker: { size: seasons.map((s) => (s === focus ? 11 : 6)), color: seasons.map((s) => (s === focus ? t.ink : t.accent)), line: { color: t.surface, width: 1 } },
      customdata: rows.map((r, i) => [formatTeamMetric(metric, vals[i]), wl(r)]),
      hovertemplate: `<b>%{customdata[0]}</b> ${m.short}<br>%{x} · %{customdata[1]}<extra></extra>`,
    }]
    const layout: Partial<Layout> = {
      showlegend: false,
      margin: { l: 44, r: 8, t: 6, b: 36 },
      xaxis: { type: 'category', tickangle: -45, tickfont: { size: 9 }, tickvals: seasons, ticktext: seasons.map((s) => s.slice(2)) },
      yaxis: { autorange: m.higherIsBetter === false ? 'reversed' : true, tickfont: { size: 10 }, ...axisFormat(metric), zeroline: metric === 'net_rating' },
      shapes: focusIdx >= 0 ? [{ type: 'rect', xref: 'x', yref: 'paper', x0: focusIdx - 0.5, x1: focusIdx + 0.5, y0: 0, y1: 1, fillcolor: t.accent, opacity: 0.1, line: { width: 0 } }] : [],
    }
    return { data, layout }
  }, [rows, metric, focus, m, t])
  return (
    <ChartFrame title={m.label} question={m.higherIsBetter === false ? 'Axis reversed, up is better' : undefined} height={170} className="rounded-[var(--radius-control)] border border-line p-2">
      <Plot data={data} layout={layout} config={{ displayModeBar: false }} />
    </ChartFrame>
  )
}

/** Small multiples across every season on file; the season in focus is shaded and its point enlarged. */
export function TrendPanel({ rows, focus }: { rows: TeamSeason[]; focus: string }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => a.season.localeCompare(b.season)), [rows])
  return (
    <Panel question="How has this team trended?" method={`One chart per metric, one y-axis each; ${focus} is shaded. Seasons are regular season only.`}>
      {sorted.length < 2 ? (
        <EmptyState title="Not enough seasons to draw a trend" body="Trends need at least two seasons for this team." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {TREND_METRICS.map((k) => <TrendChart key={k} metric={k} rows={sorted} focus={focus} />)}
        </div>
      )}
      <Note>n = {sorted.length} seasons. Season-to-season change mixes roster turnover, health and schedule; ratings are provider/derived estimates.</Note>
    </Panel>
  )
}
