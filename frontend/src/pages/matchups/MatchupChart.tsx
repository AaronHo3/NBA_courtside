import { useMemo } from 'react'
import type { Data, Layout } from 'plotly.js'
import { Plot, useChartTheme } from '@/components/charts/Plot'
import { Segmented, Select } from '@/components/ui'
import type { MatchupRow } from '@/lib/types'
import { chartRows, opponentOf, type ChartMetric, type MatchupView, type Prior } from './helpers'

type Props = {
  rows: MatchupRow[]
  view: MatchupView
  minPoss: number
  metric: ChartMetric
  limit: number | null
  prior: Prior | null
  onMetricChange: (m: ChartMetric) => void
  onLimitChange: (n: number | null) => void
  onSelectRow: (row: MatchupRow) => void
}

const ROW_PX = 22
const MIN_HEIGHT = 240
const MAX_HEIGHT = 1100

function markerSizes(rows: MatchupRow[]): number[] {
  const max = Math.max(1, ...rows.map((r) => r.partial_poss ?? 0))
  return rows.map((r) => 6 + 14 * Math.sqrt((r.partial_poss ?? 0) / max))
}

function hoverLines(r: MatchupRow): string {
  const parts = [
    `${(r.pts_per_poss ?? 0).toFixed(2)} pts/poss`,
    `${r.partial_poss ?? 0} partial poss · ${r.gp} gp · ${(r.matchup_min ?? 0).toFixed(1)} min`,
    `${r.player_pts ?? 0} pts · ${r.matchup_fgm ?? 0}/${r.matchup_fga ?? 0} FG · ${r.matchup_fg3m ?? 0}/${r.matchup_fg3a ?? 0} 3P · ${r.matchup_ftm ?? 0}/${r.matchup_fta ?? 0} FT`,
    `FG% raw ${pct(r.fg_pct)} · shrunk ${pct(r.fg_pct_shrunk)} · Wilson ${pct(r.ci_low)}–${pct(r.ci_high)}`,
    `${r.matchup_ast ?? 0} ast · ${r.matchup_tov ?? 0} tov · ${r.matchup_blk ?? 0} blk · ${r.sfl ?? 0} shooting fouls`,
  ]
  return parts.join('<br>')
}

function pct(v: number | null): string {
  return v === null || v === undefined ? '–' : `${(v * 100).toFixed(1)}%`
}

export function MatchupChartControls({ metric, limit, onMetricChange, onLimitChange }: Pick<Props, 'metric' | 'limit' | 'onMetricChange' | 'onLimitChange'>) {
  return (
    <>
      <Segmented<ChartMetric>
        ariaLabel="Chart metric"
        value={metric}
        onChange={onMetricChange}
        options={[
          { value: 'pts_per_poss', label: 'Pts / poss' },
          { value: 'fg_pct_shrunk', label: 'FG% (shrunk)' },
        ]}
      />
      <Select aria-label="Rows shown" value={limit === null ? 'all' : String(limit)} onChange={(e) => onLimitChange(e.target.value === 'all' ? null : Number(e.target.value))}>
        <option value="20">20 most-sampled</option>
        <option value="40">40 most-sampled</option>
        <option value="all">All qualifying</option>
      </Select>
    </>
  )
}

/** Horizontal dot chart of qualifying matchups; Wilson error bars for FG%; marker area tracks possessions. */
export function MatchupChart({ rows, view, minPoss, metric, limit, prior, onSelectRow }: Props) {
  const t = useChartTheme()
  const shown = useMemo(() => chartRows(rows, minPoss, metric, limit), [rows, minPoss, metric, limit])
  const names = shown.map((r) => opponentOf(r, view).name)
  const sizes = markerSizes(shown)
  const height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, shown.length * ROW_PX + 90))
  const customdata = shown.map((r) => opponentOf(r, view).id)

  const data: Data[] = useMemo(() => {
    if (metric === 'pts_per_poss') {
      return [{
        type: 'scatter', mode: 'markers', name: 'Pts per poss', orientation: 'h',
        x: shown.map((r) => r.pts_per_poss), y: names, customdata,
        marker: { size: sizes, color: t.series[0], opacity: 0.85, line: { color: t.surface, width: 1 } },
        text: shown.map(hoverLines), hovertemplate: '%{text}<br><b>%{y}</b><extra></extra>',
      }]
    }
    return [
      {
        type: 'scatter', mode: 'markers', name: 'Raw FG% (95% Wilson)',
        x: shown.map((r) => r.fg_pct), y: names, customdata,
        error_x: {
          type: 'data', symmetric: false,
          array: shown.map((r) => (r.ci_high ?? 0) - (r.fg_pct ?? 0)),
          arrayminus: shown.map((r) => (r.fg_pct ?? 0) - (r.ci_low ?? 0)),
          color: t.ink3, thickness: 1, width: 0,
        },
        marker: { size: sizes.map((s) => s * 0.6), color: t.ink3, opacity: 0.7, symbol: 'circle-open', line: { width: 1.5 } },
        text: shown.map(hoverLines), hovertemplate: '%{text}<br><b>%{y}</b><extra></extra>',
      },
      {
        type: 'scatter', mode: 'markers', name: 'Shrunk FG%',
        x: shown.map((r) => r.fg_pct_shrunk), y: names, customdata,
        marker: { size: sizes, color: t.series[0], opacity: 0.85, line: { color: t.surface, width: 1 } },
        text: shown.map(hoverLines), hovertemplate: '%{text}<br><b>%{y}</b><extra></extra>',
      },
    ]
  }, [metric, shown, names, sizes, customdata, t])

  const layout: Partial<Layout> = useMemo(() => {
    const isPct = metric === 'fg_pct_shrunk'
    const shapes: Partial<Layout>['shapes'] = isPct && prior ? [{
      type: 'line', xref: 'x', yref: 'paper', x0: prior.mean, x1: prior.mean, y0: 0, y1: 1,
      line: { color: t.ink3, width: 1, dash: 'dot' },
    }] : []
    const annotations: Partial<Layout>['annotations'] = isPct && prior ? [{
      xref: 'x', yref: 'paper', x: prior.mean, y: 1, yanchor: 'bottom', showarrow: false,
      text: `prior ${pct(prior.mean)}`, font: { size: 10, color: t.ink3 },
    }] : []
    return {
      height,
      margin: { l: 12, r: 16, t: 18, b: 44 }, // y-axis automargin sizes the name column
      showlegend: isPct,
      legend: { orientation: 'h', y: -0.05 - 40 / height, x: 0, font: { color: t.ink2, size: 11 } },
      hovermode: 'closest',
      xaxis: { title: { text: isPct ? 'FG%' : 'Points per partial possession' }, tickformat: isPct ? '.0%' : '.2f', zeroline: false, rangemode: 'tozero' },
      yaxis: { type: 'category', automargin: true, tickfont: { size: 11 }, categoryorder: 'array', categoryarray: names },
      shapes, annotations,
    }
  }, [metric, prior, height, names, t])

  if (!shown.length) return <p className="text-sm text-ink-3">No qualifying matchups to plot at ≥ {minPoss} partial possessions.</p>

  return (
    <div style={{ height }}>
      <Plot
        data={data}
        layout={layout}
        onClick={(e) => {
          const idx = e.points?.[0]?.pointIndex
          if (idx !== undefined && shown[idx]) onSelectRow(shown[idx])
        }}
      />
      <p className="sr-only">Chart of {shown.length} qualifying matchups; use the table below for keyboard access to the same rows.</p>
    </div>
  )
}
