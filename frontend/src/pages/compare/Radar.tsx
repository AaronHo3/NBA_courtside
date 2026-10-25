import { useMemo } from 'react'
import type { Data, Layout } from 'plotly.js'
import { Plot, useChartTheme } from '@/components/charts/Plot'
import { formatCellValue } from './format'
import { RADAR_METRICS } from './metrics'
import type { ComparedPlayer, MetricResult, PopulationKind } from './model'
import { POPULATION_LABEL } from './model'
import { cohortNoun } from './format'

type Props = { model: Map<string, MetricResult>; players: ComparedPlayer[]; colors: string[]; populationKind: PopulationKind; minMinutes: number; season: string }

const AXIS_LABEL: Record<string, string> = {
  ts_pct: 'True shooting %', usg_pct: 'Usage %', ast_pct: 'Assist %', reb_pct: 'Rebound %', stl_36: 'Steals per 36', blk_36: 'Blocks per 36',
  tov_pct: 'Turnover % (flipped)', net_rating: 'Net rating',
}

export function Radar({ model, players, colors, populationKind, minMinutes, season }: Props) {
  const t = useChartTheme()
  const theta = RADAR_METRICS.map((k) => AXIS_LABEL[k] ?? k)
  const data = useMemo<Data[]>(
    () =>
      players.map((p, i) => {
        const r = RADAR_METRICS.map((k) => model.get(k)?.cells[i].percentile ?? null)
        const custom = RADAR_METRICS.map((k) => { const res = model.get(k); const c = res?.cells[i]; return `${res ? formatCellValue(res.spec, c?.value, 'per_36') : '–'} · cohort ${c?.cohortSize ?? 0}` })
        return {
          type: 'scatterpolar', mode: 'lines+markers', name: p.name, fill: 'toself', fillcolor: `${colors[i]}26`,
          line: { color: colors[i], width: 2 }, marker: { color: colors[i], size: 6 },
          r: [...r, r[0]], theta: [...theta, theta[0]], customdata: [...custom, custom[0]],
          hovertemplate: '<b>%{r:.0f}th percentile</b> · %{theta}<br>%{customdata}<extra>%{fullData.name}</extra>',
        }
      }),
    [players, colors, model, theta],
  )
  const layout = useMemo<Partial<Layout>>(
    () => ({
      height: 420, margin: { l: 70, r: 70, t: 30, b: 60 }, showlegend: true, legend: { orientation: 'h', y: -0.1 },
      polar: {
        bgcolor: 'rgba(0,0,0,0)',
        radialaxis: { range: [0, 100], tickvals: [25, 50, 75, 100], gridcolor: t.grid, linecolor: t.axis, tickfont: { size: 10, color: t.ink3 }, angle: 90, tickangle: 90 },
        angularaxis: { gridcolor: t.grid, linecolor: t.axis, tickfont: { size: 11, color: t.ink2 }, rotation: 90, direction: 'clockwise' },
      },
    }),
    [t],
  )
  const missing = players.flatMap((p, i) => RADAR_METRICS.filter((k) => model.get(k)?.cells[i].percentile === null).map((k) => `${p.name}: ${AXIS_LABEL[k]}`))
  const cohorts = players.map((p, i) => `${p.name} n=${model.get('ts_pct')?.cells[i].cohortSize ?? 0}${populationKind === 'position' ? ` (${cohortNoun('position', p.position)})` : ''}`)
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div style={{ height: 420 }}><Plot data={data} layout={layout} config={{ displayModeBar: false }} /></div>
      <div className="flex flex-col gap-2 text-xs text-ink-2">
        <p className="font-medium text-ink">How to read this radar</p>
        <p>Each axis is the player’s mid-rank percentile (0–100) within <span className="text-ink">{POPULATION_LABEL[populationKind].toLowerCase()}</span>, {season}, minimum {minMinutes.toLocaleString()} minutes. Higher is better on every axis.</p>
        <p>Turnover % is flipped: a lower turnover rate scores a higher percentile. Steals and blocks are per 36 minutes, not totals. Usage % has no better direction and is shown as-is (higher = larger role).</p>
        <p>Cohort sizes: {cohorts.join('; ')}.</p>
        {missing.length > 0 && <p className="text-warning">No value (gap on the axis) for: {missing.join(', ')}.</p>}
        <p className="text-ink-3">Radar area is not a score: axis order and scale choices change the shape. Use the small multiples and table above for decisions.</p>
      </div>
    </div>
  )
}
