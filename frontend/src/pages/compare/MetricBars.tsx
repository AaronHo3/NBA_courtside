import { useMemo } from 'react'
import type { Data, Layout } from 'plotly.js'
import { Plot, useChartTheme } from '@/components/charts/Plot'
import type { Normalization } from '@/lib/types'
import { formatCellValue, percentileText, rankText } from './format'
import { initials, num } from './math'
import type { ComparedPlayer, MetricResult, PopulationKind } from './model'
import { SpecLabel } from './SpecLabel'

type Props = { result: MetricResult; players: ComparedPlayer[]; colors: string[]; norm: Normalization; populationKind: PopulationKind; minMinutes: number }

const CHART_HEIGHT = 190

/** Axis range with headroom for outside value labels; bars always include zero, dot plots fit the data. */
export function yRange(values: Array<number | null>, kind: string): [number, number] | undefined {
  const xs = values.map((v) => num(v)).filter((v): v is number => v !== null)
  if (!xs.length) return undefined
  const lo = Math.min(...xs)
  const hi = Math.max(...xs)
  if (kind === 'physical') {
    const pad = Math.max((hi - lo) * 0.6, Math.abs(hi) * 0.02, 0.5)
    return [lo - pad, hi + pad]
  }
  const span = Math.max(hi, 0) - Math.min(lo, 0) || Math.abs(hi) || 1
  return [Math.min(lo, 0) - (lo < 0 ? span * 0.22 : 0), Math.max(hi, 0) + span * 0.22]
}

/** Short, unique tick labels: initials (surnames overlap even at three players); duplicates get a slot number. */
export function tickLabels(players: ComparedPlayer[]): string[] {
  const base = players.map((p) => initials(p.name))
  return base.map((l, i) => (base.indexOf(l) !== i || base.lastIndexOf(l) !== i ? `${l} ${i + 1}` : l))
}

/** One small multiple: one bar per player, fixed order and colour. */
export function MetricBars({ result, players, colors, norm, populationKind, minMinutes }: Props) {
  const t = useChartTheme()
  const { spec, cells, best } = result
  const labels = useMemo(() => tickLabels(players), [players])
  const data = useMemo<Data[]>(() => {
    const customdata = cells.map((c, i) => [
      formatCellValue(spec, c.value, norm, { long: true }),
      `${players[i].name}${players[i].team ? ` (${players[i].team})` : ''}`,
      rankText(c, players.length, i === best),
      percentileText(c, populationKind, players[i].position),
      c.belowThreshold ? `Below the ${minMinutes.toLocaleString()}-minute eligibility threshold` : '',
    ])
    const hovertemplate = '<b>%{customdata[0]}</b> · %{customdata[1]}<br>%{customdata[2]}<br>%{customdata[3]}<br>%{customdata[4]}<extra></extra>'
    const values = cells.map((c) => c.value)
    const text = cells.map((c) => formatCellValue(spec, c.value, norm))
    if (spec.kind === 'physical') {
      // Measurements differ by a few inches on a base of 70+, so a dot plot on a data-fitted axis beats bars from zero.
      return [{
        type: 'scatter', mode: 'markers+text', x: labels, y: values,
        marker: { color: colors, size: 14, symbol: 'circle', line: { width: 2, color: t.surface } },
        text, textposition: 'top center', textfont: { size: 10, color: t.ink2 }, cliponaxis: false,
        customdata, hovertemplate, showlegend: false,
      }]
    }
    const bars: Data = {
      type: 'bar',
      x: labels,
      y: values,
      marker: { color: colors, opacity: cells.map((c) => (c.belowThreshold ? 0.45 : 1)), line: { width: cells.map((_, i) => (i === best ? 2 : 0)), color: t.ink } },
      customdata,
      hovertemplate,
      showlegend: false,
    }
    if (players.length > 4) return [bars]
    // Value labels as their own text trace: Plotly's bar-text fit check runs before the container has a width and hides them.
    const labelsTrace: Data = {
      type: 'scatter', mode: 'text', x: labels, y: values.map((v) => (v !== null && v < 0 ? 0 : v)), text,
      textposition: 'top center', textfont: { size: 10, color: t.ink2 }, cliponaxis: false, hoverinfo: 'skip', showlegend: false,
    }
    return [bars, labelsTrace]
  }, [cells, spec, norm, players, best, populationKind, minMinutes, labels, colors, t.ink, t.ink2, t.surface])
  const layout = useMemo<Partial<Layout>>(
    () => ({
      height: CHART_HEIGHT,
      margin: { l: 40, r: 6, t: 18, b: 26 },
      showlegend: false,
      dragmode: false,
      hovermode: 'closest',
      bargap: 0.3,
      xaxis: { type: 'category', fixedrange: true, tickfont: { size: 11, color: t.ink3 }, tickangle: 0, automargin: true, range: spec.kind === 'physical' ? [-0.6, players.length - 0.4] : undefined },
      yaxis: {
        fixedrange: true,
        range: yRange(cells.map((c) => c.value), spec.kind),
        tickformat: spec.kind === 'pct' ? '.0%' : undefined,
        nticks: 4,
        automargin: true,
        zeroline: true,
      },
    }),
    [spec.kind, t.ink3, players.length, cells],
  )
  return (
    <figure className="min-w-0 rounded-[var(--radius-control)] border border-line p-2">
      <figcaption className="mb-1 flex items-center justify-between gap-1">
        <SpecLabel spec={spec} norm={norm} />
      </figcaption>
      <div style={{ height: CHART_HEIGHT }} aria-label={`${spec.label}: ${players.map((p, i) => `${p.name} ${formatCellValue(spec, cells[i].value, norm)}`).join(', ')}`}>
        <Plot data={data} layout={layout} config={{ displayModeBar: false }} />
      </div>
    </figure>
  )
}
