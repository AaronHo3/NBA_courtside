import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Data, Layout } from 'plotly.js'
import { Plot, useChartTheme } from '@/components/charts/Plot'
import { Panel, Select } from '@/components/ui'
import { useParam } from '@/lib/urlState'
import type { TeamSeason } from '@/lib/types'
import { labelPositions } from './analysis'
import { SCATTER_PRESETS, TEAM_METRICS, axisFormat, formatTeamMetric, numberAt, teamMetric, wl, axisTitle } from './teamMetrics'
import { useNarrow } from './useNarrow'
import { ChartBox, MetricSelect, Note } from './shared'

const SCATTER_METRICS = TEAM_METRICS.filter((m) => m.key !== 'w')

type Pt = { row: TeamSeason; x: number; y: number }

function normalise(v: number, lo: number, hi: number): number {
  return hi > lo ? (v - lo) / (hi - lo) : 0.5
}

/** Direct-labelled single-hue team scatter; axes whose metric is "lower is better" are reversed so up/right is good. */
export function ProfileScatter({ rows, season }: { rows: TeamSeason[]; season: string }) {
  const t = useChartTheme()
  const narrow = useNarrow()
  const navigate = useNavigate()
  const [x, setX] = useParam('x', 'off_rating')
  const [y, setY] = useParam('y', 'def_rating')
  const preset = SCATTER_PRESETS.find((p) => p.x === x && p.y === y)?.key ?? 'custom'
  const mx = teamMetric(x)
  const my = teamMetric(y)

  const pts = useMemo<Pt[]>(() => rows.flatMap((row) => {
    const xv = numberAt(row, x)
    const yv = numberAt(row, y)
    return xv === null || yv === null ? [] : [{ row, x: xv, y: yv }]
  }), [rows, x, y])

  const { data, layout } = useMemo(() => {
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const [xlo, xhi] = [Math.min(...xs), Math.max(...xs)]
    const [ylo, yhi] = [Math.min(...ys), Math.max(...ys)]
    const xRev = mx.higherIsBetter === false
    const yRev = my.higherIsBetter === false
    const positions = labelPositions(pts.map((p) => ({ x: xRev ? 1 - normalise(p.x, xlo, xhi) : normalise(p.x, xlo, xhi), y: yRev ? 1 - normalise(p.y, ylo, yhi) : normalise(p.y, ylo, yhi) })))
    const meanX = xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0
    const meanY = ys.length ? ys.reduce((s, v) => s + v, 0) / ys.length : 0
    const trace: Data = {
      type: 'scatter', mode: narrow ? 'markers' : 'text+markers', x: xs, y: ys,
      text: pts.map((p) => p.row.abbreviation),
      textposition: positions,
      textfont: { color: t.ink2, size: 11 },
      marker: { color: t.accent, size: 9, line: { color: t.surface, width: 1 } },
      customdata: pts.map((p) => [formatTeamMetric(x, p.x), formatTeamMetric(y, p.y), p.row.full_name, wl(p.row)]),
      hovertemplate: `<b>${mx.short} %{customdata[0]} · ${my.short} %{customdata[1]}</b><br>%{customdata[2]} (%{customdata[3]})<extra></extra>`,
      name: 'Teams',
    }
    const lay: Partial<Layout> = {
      showlegend: false,
      margin: { l: 56, r: 24, t: 12, b: 52 },
      xaxis: { title: { text: axisTitle(x) }, autorange: xRev ? 'reversed' : true, ...axisFormat(x) },
      yaxis: { title: { text: axisTitle(y) }, autorange: yRev ? 'reversed' : true, ...axisFormat(y) },
      shapes: pts.length ? [
        { type: 'line', xref: 'x', yref: 'paper', x0: meanX, x1: meanX, y0: 0, y1: 1, line: { color: t.axis, width: 1, dash: 'dot' } },
        { type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: meanY, y1: meanY, line: { color: t.axis, width: 1, dash: 'dot' } },
      ] : [],
      annotations: pts.length ? [{ xref: 'paper', yref: 'paper', x: 1, y: 1, xanchor: 'right', yanchor: 'top', showarrow: false, text: 'dotted lines: league average', font: { size: 10, color: t.ink3 } }] : [],
    }
    return { data: [trace], layout: lay }
  }, [pts, x, y, mx, my, t, narrow])

  const applyPreset = (key: string) => {
    const p = SCATTER_PRESETS.find((q) => q.key === key)
    if (p) { setX(p.x); setY(p.y) }
  }

  return (
    <Panel
      question="Which team profiles win?"
      method="One point per team season; dotted lines mark the league average so quadrants read as above/below. Reversed axes keep good outcomes up and to the right."
      actions={
        <>
          <Select aria-label="Preset" value={preset} onChange={(e) => applyPreset(e.target.value)}>
            {SCATTER_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            <option value="custom" disabled>Custom</option>
          </Select>
          <MetricSelect ariaLabel="X axis metric" value={x} onChange={setX} options={SCATTER_METRICS} />
          <MetricSelect ariaLabel="Y axis metric" value={y} onChange={setY} options={SCATTER_METRICS} />
        </>
      }
    >
      <ChartBox height={460}>
        <Plot data={data} layout={layout} onClick={(e) => { const i = e.points[0]?.pointIndex; if (i !== undefined && pts[i]) navigate(`/teams/${pts[i].row.team_id}?season=${encodeURIComponent(season)}`) }} />
      </ChartBox>
      <Note>n = {pts.length} teams, {season}. Where the two metrics move together it is an association across one season of team totals, not a cause; schedule, health and opponent quality are not held constant. {narrow ? 'Labels are hidden at this width; hover or tap a point for the team. ' : ''}Click a point to open the team.</Note>
    </Panel>
  )
}
