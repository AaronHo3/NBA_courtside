import { useMemo } from 'react'
import type { Data, Layout } from 'plotly.js'
import { ChartFrame } from '@/components/charts/ChartFrame'
import { Plot, useChartTheme } from '@/components/charts/Plot'
import { Badge, EmptyState, Loading, Panel, Refetching } from '@/components/ui'
import { useRosterMetrics } from '@/hooks/useApi'
import { useParam } from '@/lib/urlState'
import { formatNumber } from '@/lib/format'
import type { RosterMetricsRow } from '@/lib/types'
import { labelPositions, linearFit, pearson } from './analysis'
import { ROSTER_DESCRIPTORS, ROSTER_OUTCOMES, TEAM_METRICS, axisFormat, formatTeamMetric, numberAt, teamMetric, wl, axisTitle } from './teamMetrics'
import { useNarrow } from './useNarrow'
import { MetricHeader, MetricSelect, Note } from './shared'

const OUTCOME_DEFS = TEAM_METRICS.filter((m) => (ROSTER_OUTCOMES as readonly string[]).includes(m.key))
const CONFOUNDING = 'Association, not effect: roster shape, coaching, health, schedule and opponent quality move together, and a correlation across 30 team-seasons cannot separate them. Nothing here says a roster descriptor caused a result.'

function describeR(r: number | null): string {
  if (r === null) return 'not computable'
  const a = Math.abs(r)
  const strength = a < 0.2 ? 'negligible' : a < 0.4 ? 'weak' : a < 0.6 ? 'moderate' : 'strong'
  return `${strength} ${r < 0 ? 'negative' : 'positive'}`
}

/** Roster descriptor (x) vs outcome (y) across the league with Pearson r, n and an OLS line. */
export function RosterShapePanel({ season }: { season: string }) {
  const t = useChartTheme()
  const narrow = useNarrow()
  const q = useRosterMetrics({ season })
  const [x, setX] = useParam('rx', 'usage_gini')
  const [y, setY] = useParam('ry', 'net_rating')
  const rows = useMemo(() => q.data?.data ?? [], [q.data])
  const definitions = q.data?.meta.definitions ?? {}
  const mx = teamMetric(x)
  const my = teamMetric(y)

  const pts = useMemo(() => rows.flatMap((row: RosterMetricsRow) => {
    const xv = numberAt(row, x)
    const yv = numberAt(row, y)
    return xv === null || yv === null ? [] : [{ row, x: xv, y: yv }]
  }), [rows, x, y])
  const stats = useMemo(() => pearson(pts.map((p) => [p.x, p.y] as [number, number])), [pts])
  const fit = useMemo(() => linearFit(pts.map((p) => [p.x, p.y] as [number, number])), [pts])

  const { data, layout } = useMemo(() => {
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const [xlo, xhi] = [Math.min(...xs), Math.max(...xs)]
    const [ylo, yhi] = [Math.min(...ys), Math.max(...ys)]
    const yRev = my.higherIsBetter === false
    const norm = (v: number, lo: number, hi: number) => (hi > lo ? (v - lo) / (hi - lo) : 0.5)
    const positions = labelPositions(pts.map((p) => ({ x: norm(p.x, xlo, xhi), y: yRev ? 1 - norm(p.y, ylo, yhi) : norm(p.y, ylo, yhi) })))
    const traces: Data[] = [{
      type: 'scatter', mode: narrow ? 'markers' : 'text+markers', x: xs, y: ys, name: 'Teams',
      text: pts.map((p) => p.row.abbreviation), textposition: positions, textfont: { color: t.ink2, size: 11 },
      marker: { color: t.accent, size: 9, line: { color: t.surface, width: 1 } },
      customdata: pts.map((p) => [formatTeamMetric(x, p.x), formatTeamMetric(y, p.y), p.row.full_name, wl(p.row)]),
      hovertemplate: `<b>${mx.short} %{customdata[0]} · ${my.short} %{customdata[1]}</b><br>%{customdata[2]} (%{customdata[3]})<extra></extra>`,
    }]
    if (fit && xs.length) {
      traces.push({
        type: 'scatter', mode: 'lines', name: 'Least-squares line', x: [xlo, xhi], y: [fit.intercept + fit.slope * xlo, fit.intercept + fit.slope * xhi],
        line: { color: t.ink3, width: 1.5, dash: 'dash' }, hoverinfo: 'skip',
      })
    }
    const lay: Partial<Layout> = {
      showlegend: true,
      legend: { orientation: 'h', y: -0.22, font: { color: t.ink2, size: 11 } },
      margin: { l: 56, r: 24, t: 12, b: 64 },
      xaxis: { title: { text: mx.label }, ...axisFormat(x) },
      yaxis: { title: { text: axisTitle(y) }, autorange: yRev ? 'reversed' : true, ...axisFormat(y) },
    }
    return { data: traces, layout: lay }
  }, [pts, fit, x, y, mx, my, t, narrow])

  return (
    <Panel
      question="Does roster shape relate to results?"
      method="Pick a roster descriptor and an outcome; each point is a team season. Pearson r is computed in the browser over teams with both values."
      actions={
        <>
          <MetricSelect ariaLabel="Roster descriptor (x axis)" value={x} onChange={setX} options={ROSTER_DESCRIPTORS} />
          <MetricSelect ariaLabel="Outcome (y axis)" value={y} onChange={setY} options={OUTCOME_DEFS} />
        </>
      }
    >
      <Refetching loading={q.isFetching} error={q.error} retry={() => q.refetch()}>
        {q.isLoading ? (
          <Loading label="Loading roster descriptors" />
        ) : !pts.length ? (
          <EmptyState title="No roster descriptors for this season" body="The roster-metrics endpoint returned no teams with both values." />
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold tnum text-ink">r = {stats.r === null ? '–' : formatNumber(stats.r, 2)}</span>
              <span className="text-ink-2">{describeR(stats.r)} association (n = {stats.n} teams, one season)</span>
              <Badge tone="warning">association, not cause</Badge>
              <span className="ml-auto inline-flex items-center gap-3 text-xs text-ink-3">
                <MetricHeader metric={x} definition={definitions[x]} short />
                <MetricHeader metric={y} definition={definitions[y]} short />
              </span>
            </div>
            <ChartFrame title={`${mx.label} vs ${my.label}`} height={440}>
              <Plot data={data} layout={layout} />
            </ChartFrame>
          </>
        )}
      </Refetching>
      <Note>{narrow ? 'Labels are hidden at this width; hover or tap a point for the team. ' : ''}{CONFOUNDING}{q.data?.meta.caveat ? ` ${q.data.meta.caveat}` : ''}</Note>
    </Panel>
  )
}
