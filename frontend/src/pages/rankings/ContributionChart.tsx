import { useMemo } from 'react'
import type { Data, Layout } from 'plotly.js'
import { Plot, useChartTheme } from '@/components/charts/Plot'
import { useMetricIndex } from '@/hooks/useApi'
import { formatMetric } from '@/lib/format'
import type { RankingMeta, RankingRow } from '@/lib/types'
import { formatNormalized, formatScore } from './model'

const ROW_PX = 24
const MIN_HEIGHT = 220

/**
 * One horizontal bar per player, split into component contributions. Bars stack relatively so
 * negative z-score contributions extend left of zero instead of being hidden.
 */
export function ContributionChart({ rows, meta, colors }: { rows: RankingRow[]; meta: RankingMeta; colors: Map<string, string> }) {
  const t = useChartTheme()
  const { get } = useMetricIndex()
  const norm = meta.normalization

  const { data, layout } = useMemo(() => {
    const labels = rows.map((r) => `${r.rank ?? '–'}. ${r.full_name}`)
    const traces: Data[] = meta.components.map((c) => {
      const points = rows.map((r) => r.contributions.find((x) => x.metric === c.metric))
      return {
        type: 'bar',
        orientation: 'h',
        name: c.label,
        y: labels,
        x: points.map((p) => p?.contribution ?? 0),
        marker: { color: colors.get(c.metric) },
        customdata: points.map((p) => [
          p ? formatScore(p.contribution, norm) : '–',
          p ? formatMetric(p.raw, get(c.metric)) : '–',
          p ? formatNormalized(p.normalized, norm) : '–',
          p ? `${(p.weight * 100).toFixed(0)}%` : '–',
          p ? String(p.population_size) : '–',
        ]),
        hovertemplate: `<b>%{customdata[0]}</b> of the score from ${c.label}<br>raw %{customdata[1]} · %{customdata[2]} · weight %{customdata[3]}<br>population %{customdata[4]} players<extra></extra>`,
        showlegend: false,
      } as Data
    })
    const totals: Data = {
      type: 'scatter',
      mode: 'text',
      y: labels,
      // Anchor at the end of the positive stack so labels never sit inside a bar when z-scores are negative.
      x: rows.map((r) => r.contributions.reduce((acc, c) => acc + Math.max(0, c.contribution), 0)),
      text: rows.map((r) => formatScore(r.score, norm)),
      textposition: 'middle right',
      textfont: { color: t.ink2, size: 11 },
      hoverinfo: 'skip',
      showlegend: false,
      cliponaxis: false,
    } as Data
    const layout: Partial<Layout> = {
      barmode: 'relative',
      showlegend: false,
      height: Math.max(MIN_HEIGHT, rows.length * ROW_PX + 70),
      margin: { l: 8, r: 48, t: 8, b: 44 },
      xaxis: { title: { text: norm === 'percentile' ? 'Composite score (0–100)' : 'Composite score (z-score units)' }, zeroline: true, fixedrange: true },
      yaxis: { autorange: 'reversed', automargin: true, fixedrange: true, tickfont: { size: 11, color: t.ink } },
      hovermode: 'closest',
      dragmode: false,
    }
    return { data: [...traces, totals], layout }
  }, [rows, meta, colors, norm, get, t.ink, t.ink2])

  return <Plot data={data} layout={layout} style={{ height: layout.height }} config={{ displayModeBar: false }} />
}
