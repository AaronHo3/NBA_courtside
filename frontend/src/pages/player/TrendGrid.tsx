import { useMemo } from 'react'
import type { Data, Layout } from 'plotly.js'
import { Plot, useChartTheme } from '@/components/charts/Plot'
import { Panel } from '@/components/ui'
import { formatNumber, formatPct, formatSigned } from '@/lib/format'
import type { PlayerSeasonRow } from '@/lib/types'
import { fg3aRate, ratio } from './helpers'

const LOW_MINUTES = 200

type TrendMetric = { key: string; label: string; value: (r: PlayerSeasonRow) => number | null; format: (n: number) => string }

const TRENDS: TrendMetric[] = [
  { key: 'pts36', label: 'Points / 36', value: (r) => ratio(r.pts, r.min, 36), format: (n) => formatNumber(n, 1) },
  { key: 'ast36', label: 'Assists / 36', value: (r) => ratio(r.ast, r.min, 36), format: (n) => formatNumber(n, 1) },
  { key: 'reb36', label: 'Rebounds / 36', value: (r) => ratio(r.reb, r.min, 36), format: (n) => formatNumber(n, 1) },
  { key: 'ts_pct', label: 'True shooting', value: (r) => (typeof r.ts_pct === 'number' ? r.ts_pct : null), format: (n) => formatPct(n) },
  { key: 'usg_pct', label: 'Usage %', value: (r) => (typeof r.usg_pct === 'number' ? r.usg_pct : null), format: (n) => formatPct(n, 1) },
  { key: 'fg3a_rate', label: '3PA share of FGA', value: (r) => fg3aRate(r.fg3a, r.fga), format: (n) => formatPct(n) },
  { key: 'net_rating', label: 'Net rating', value: (r) => (typeof r.net_rating === 'number' ? r.net_rating : null), format: (n) => formatSigned(n, 1) },
]

type Props = { rows: PlayerSeasonRow[]; focusSeason: string; onFocus: (season: string) => void }

function TrendChart({ metric, rows, focusSeason, onFocus }: { metric: TrendMetric } & Props) {
  const t = useChartTheme()
  const seasons = rows.map((r) => r.season)
  const values = rows.map((r) => metric.value(r))
  const low = rows.map((r) => typeof r.min === 'number' && r.min < LOW_MINUTES)
  const traded = rows.map((r) => r.is_aggregate)
  const step = Math.max(1, Math.ceil(seasons.length / 4))

  const data = useMemo<Data[]>(() => [{
    type: 'scatter',
    mode: 'lines+markers',
    x: seasons,
    y: values,
    name: metric.label,
    line: { color: t.series[0], width: 1.5 },
    marker: {
      size: rows.map((r) => (r.season === focusSeason ? 11 : 7)),
      color: rows.map((r) => (r.season === focusSeason ? t.accent : t.series[0])),
      symbol: rows.map((_, i) => `${traded[i] ? 'diamond' : 'circle'}${low[i] ? '-open' : ''}` as 'circle' | 'circle-open' | 'diamond' | 'diamond-open'),
      line: { width: 1.5, color: rows.map((r) => (r.season === focusSeason ? t.accent : t.series[0])) },
    },
    customdata: rows.map((r, i) => [
      values[i] === null ? '–' : metric.format(values[i] as number),
      r.is_aggregate ? 'TOT (traded season)' : r.team_abbreviation ?? '',
      `${formatNumber(typeof r.min === 'number' ? r.min : null, 0)} min${low[i] ? ' · low sample' : ''}`,
    ]),
    hovertemplate: `%{x}<br>${metric.label}: %{customdata[0]}<br>%{customdata[1]} · %{customdata[2]}<extra></extra>`,
    connectgaps: false,
  }], [seasons, values, rows, metric, t, focusSeason, traded, low])

  const layout = useMemo<Partial<Layout>>(() => ({
    margin: { l: 40, r: 8, t: 6, b: 34 },
    showlegend: false,
    hovermode: 'closest',
    xaxis: { type: 'category', categoryorder: 'array', categoryarray: seasons, tickmode: 'array', tickvals: seasons.filter((_, i) => i % step === 0 || i === seasons.length - 1), tickangle: -35, tickfont: { size: 10, color: t.ink3 }, fixedrange: true },
    yaxis: { tickfont: { size: 10, color: t.ink3 }, fixedrange: true, tickformat: metric.key === 'ts_pct' || metric.key === 'fg3a_rate' ? '.0%' : undefined, zeroline: metric.key === 'net_rating' },
  }), [seasons, step, t, metric.key])

  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 text-xs font-medium text-ink-2">{metric.label}</figcaption>
      <div className="h-40">
        <Plot data={data} layout={layout} config={{ displayModeBar: false }} onClick={(e) => { const s = e.points?.[0]?.x; if (typeof s === 'string') onFocus(s) }} />
      </div>
    </figure>
  )
}

export function TrendGrid({ rows, focusSeason, onFocus }: Props) {
  return (
    <Panel
      question="How has his game changed?"
      method={`Season-by-season rates from season totals (TOT row for traded seasons). Larger filled point = season in focus; diamond = traded season; hollow = under ${LOW_MINUTES} minutes. Select a point to focus that season.`}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">No seasons on record.</p>
      ) : (
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
          {TRENDS.map((m) => <TrendChart key={m.key} metric={m} rows={rows} focusSeason={focusSeason} onFocus={onFocus} />)}
        </div>
      )}
    </Panel>
  )
}
