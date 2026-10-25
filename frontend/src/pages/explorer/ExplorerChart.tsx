import { useCallback, useMemo } from 'react'
import type { Config, Data, Layout, PlotMouseEvent, PlotSelectionEvent, Shape } from 'plotly.js'
import { baseConfig, Plot, useChartTheme } from '@/components/charts/Plot'
import { SEQUENTIAL_BLUE, toColorscale } from '@/components/charts/palette'
import { formatMetric, metricLabelWithNorm } from '@/lib/format'
import type { Metric, Normalization, PlayerRow } from '@/lib/types'
import { activePreset, axisReversed, encodingLegend, formatWithUnit, isLowSample, median, numeric, NONE, POSITION, POSITIONS, primaryPosition } from './helpers'

const CHART_HEIGHT = 520
const BASE_SIZE = 7
const SIZE_RANGE: [number, number] = [5, 22]
const LOW_SAMPLE_OPACITY = 0.25
const OPACITY = 0.55
const RING_PAD = 7

/** Only the tools the caption names: box select, lasso, reset axes. */
const CHART_CONFIG: Partial<Config> = { ...baseConfig, modeBarButtons: [['select2d', 'lasso2d', 'resetScale2d']], displaylogo: false }

export interface ExplorerChartProps {
  rows: PlayerRow[]
  getMetric: (key: string) => Metric | undefined
  normalization: Normalization
  x: string
  y: string
  size: string
  color: string
  medians: boolean
  minGp: number
  minMinutes: number
  /** The selected player (URL `sel`), ringed in accent. */
  selectedId: number | null
  /** The comparison group plus the hovered row, ringed in ink. */
  markedIds: number[]
  /** Pointer over a marker (null when it leaves); the table mirrors it. */
  onPointHover?: (id: number | null) => void
  onPointClick: (playerId: number) => void
  onLasso: (playerIds: number[]) => void
}

/** Square-root scale from metric values to marker diameters in px; nulls draw at the minimum. */
function sizesFor(values: Array<number | null>): number[] {
  const finite = values.filter((v): v is number => v !== null)
  if (!finite.length) return values.map(() => BASE_SIZE)
  const lo = Math.min(...finite)
  const span = Math.max(...finite) - lo
  const [minPx, maxPx] = SIZE_RANGE
  return values.map((v) => (v === null || span === 0 ? minPx : minPx + Math.sqrt((v - lo) / span) * (maxPx - minPx)))
}

function axisTitle(metric: Metric | undefined, key: string, normalization: Normalization): string {
  const base = metricLabelWithNorm(metric, key, normalization)
  const unit = metric?.unit && metric.kind !== 'pct' ? ` (${metric.unit})` : ''
  return axisReversed(metric) ? `${base}${unit} — reversed, lower is better` : `${base}${unit}`
}

function tickFormat(metric: Metric | undefined): string | undefined {
  return metric?.kind === 'pct' ? '.0%' : undefined
}

export function ExplorerChart(props: ExplorerChartProps) {
  const { rows, getMetric, normalization, x, y, size, color, medians, minGp, minMinutes, selectedId, markedIds, onPointClick, onLasso, onPointHover } = props
  const t = useChartTheme()
  const xm = getMetric(x)
  const ym = getMetric(y)
  const sm = size !== NONE ? getMetric(size) : undefined
  const colorIsPosition = color === POSITION
  const cm = !colorIsPosition && color !== NONE ? getMetric(color) : undefined

  const plotted = useMemo(() => rows.filter((r) => numeric(r, x) !== null && numeric(r, y) !== null), [rows, x, y])
  const unplotted = rows.length - plotted.length

  const hoverFor = useCallback(
    (r: PlayerRow): string => {
      const line = (key: string, m: Metric | undefined, role: string) => `${formatWithUnit(r[key], m)}  ${metricLabelWithNorm(m, key, normalization)} <span style="opacity:.7">(${role})</span>`
      const parts = [
        `<b>${r.full_name}</b>${r.is_aggregate ? ' · TOT (pooled stints)' : ''}`,
        `${r.team_abbreviation ?? '–'} · ${r.position ?? '–'} · age ${formatMetric(r.age, getMetric('age'))} · ${formatMetric(r.gp, getMetric('gp'))} gp · ${formatMetric(r.min, getMetric('min'))} ${metricLabelWithNorm(getMetric('min'), 'min', normalization).toLowerCase()}`,
        line(x, xm, 'x'),
        line(y, ym, 'y'),
        sm ? line(size, sm, 'size') : null,
        cm ? line(color, cm, 'colour') : null,
        `${formatWithUnit(r.ts_pct, getMetric('ts_pct'))} TS% · ${formatWithUnit(r.usg_pct, getMetric('usg_pct'))} USG%`,
        isLowSample(r, minGp, minMinutes) ? '<i>Below sample thresholds</i>' : null,
      ]
      return parts.filter(Boolean).join('<br>')
    },
    [x, y, size, color, xm, ym, sm, cm, normalization, getMetric, minGp, minMinutes],
  )

  const data = useMemo<Data[]>(() => {
    const outline = { color: t.surface, width: 1 }
    const traceFor = (name: string, subset: PlayerRow[], markerColor: string | number[], extra: Partial<Record<string, unknown>> = {}): Data => {
      const sizes = sm ? sizesFor(subset.map((r) => numeric(r, size))) : subset.map(() => BASE_SIZE)
      return {
        type: 'scatter',
        mode: 'markers',
        name,
        x: subset.map((r) => numeric(r, x)),
        y: subset.map((r) => numeric(r, y)),
        customdata: subset.map((r) => r.player_id),
        hovertext: subset.map(hoverFor),
        hoverinfo: 'text',
        marker: {
          size: sizes,
          color: markerColor,
          opacity: subset.map((r) => (isLowSample(r, minGp, minMinutes) ? LOW_SAMPLE_OPACITY : OPACITY)),
          line: outline,
          ...extra,
        },
        selected: { marker: { opacity: 1 } },
        unselected: { marker: { opacity: 0.25 } },
      } as Data
    }

    const traces: Data[] = []
    if (colorIsPosition) {
      POSITIONS.forEach((p, i) => {
        const subset = plotted.filter((r) => primaryPosition(r.position) === p)
        if (subset.length) traces.push(traceFor(p === 'G' ? 'Guards' : p === 'F' ? 'Forwards' : 'Centers', subset, t.series[i]))
      })
      const unlisted = plotted.filter((r) => primaryPosition(r.position) === null)
      if (unlisted.length) traces.push(traceFor('No listed position', unlisted, t.ink3))
    } else if (cm) {
      const withValue = plotted.filter((r) => numeric(r, color) !== null)
      const without = plotted.filter((r) => numeric(r, color) === null)
      const scale = t.theme === 'dark' ? [...SEQUENTIAL_BLUE.slice(0, 10)].reverse() : SEQUENTIAL_BLUE
      if (withValue.length) {
        traces.push(
          traceFor('Players', withValue, withValue.map((r) => numeric(r, color) as number), {
            colorscale: toColorscale(scale),
            showscale: true,
            colorbar: {
              title: { text: metricLabelWithNorm(cm, color, normalization), side: 'right', font: { color: t.ink2, size: 11 } },
              thickness: 12,
              len: 0.7,
              outlinewidth: 0,
              tickfont: { color: t.ink3, size: 10 },
              tickformat: tickFormat(cm),
              x: 1.02,
            },
          }),
        )
      }
      if (without.length) traces.push(traceFor(`No ${metricLabelWithNorm(cm, color, normalization)}`, without, t.ink3))
    } else {
      traces.push(traceFor('Players', plotted, t.series[0]))
    }

    // Overlay rings: the comparison group / hovered row in ink, the selected player in accent on top.
    const sizes = sm ? sizesFor(plotted.map((r) => numeric(r, size))) : plotted.map(() => BASE_SIZE)
    const sizeById = new Map(plotted.map((r, i) => [r.player_id, sizes[i]]))
    const ring = (name: string, subset: PlayerRow[], colour: string, width: number): Data => ({
      type: 'scatter',
      mode: 'markers',
      name,
      showlegend: false,
      x: subset.map((r) => numeric(r, x)),
      y: subset.map((r) => numeric(r, y)),
      customdata: subset.map((r) => r.player_id),
      hoverinfo: 'skip',
      marker: { symbol: 'circle-open', size: subset.map((r) => (sizeById.get(r.player_id) ?? BASE_SIZE) + RING_PAD), color: colour, line: { color: colour, width }, opacity: 1 },
    } as Data)
    const marked = plotted.filter((r) => markedIds.includes(r.player_id) && r.player_id !== selectedId)
    if (marked.length) traces.push(ring('Comparing', marked, t.ink, 1.5))
    const selected = plotted.filter((r) => r.player_id === selectedId)
    if (selected.length) traces.push(ring('Selected', selected, t.accent, 2.5))
    return traces
  }, [plotted, colorIsPosition, cm, sm, x, y, size, color, t, hoverFor, minGp, minMinutes, markedIds, selectedId, normalization])

  const legendTraces = data.filter((d) => (d as { showlegend?: boolean }).showlegend !== false).length
  const layout = useMemo<Partial<Layout>>(() => {
    const shapes: Array<Partial<Shape>> = []
    const annotations: NonNullable<Layout['annotations']> = []
    if (medians) {
      const mx = median(plotted.map((r) => numeric(r, x)))
      const my = median(plotted.map((r) => numeric(r, y)))
      const line = { color: t.ink3, width: 1, dash: 'dot' as const }
      if (mx !== null) {
        shapes.push({ type: 'line', xref: 'x', yref: 'paper', x0: mx, x1: mx, y0: 0, y1: 1, line })
        annotations.push({ xref: 'x', yref: 'paper', x: mx, y: 1, text: `median ${formatWithUnit(mx, xm)}`, showarrow: false, xanchor: 'left', yanchor: 'top', font: { color: t.ink3, size: 10 }, xshift: 4 })
      }
      if (my !== null) {
        shapes.push({ type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: my, y1: my, line })
        annotations.push({ xref: 'paper', yref: 'y', x: 1, y: my, text: `median ${formatWithUnit(my, ym)}`, showarrow: false, xanchor: 'right', yanchor: 'bottom', font: { color: t.ink3, size: 10 }, yshift: 2 })
      }
    }
    const showlegend = legendTraces >= 2
    return {
      height: CHART_HEIGHT,
      showlegend,
      legend: { orientation: 'h', y: -0.16, x: 0, font: { color: t.ink2, size: 11 }, itemsizing: 'constant' },
      margin: { l: 60, r: cm ? 88 : 16, t: 12, b: showlegend ? 72 : 52 },
      hovermode: 'closest',
      dragmode: 'select',
      xaxis: { title: { text: axisTitle(xm, x, normalization) }, tickformat: tickFormat(xm), autorange: axisReversed(xm) ? 'reversed' : true, zeroline: false },
      yaxis: { title: { text: axisTitle(ym, y, normalization) }, tickformat: tickFormat(ym), autorange: axisReversed(ym) ? 'reversed' : true, zeroline: false },
      shapes,
      annotations,
    }
  }, [medians, plotted, x, y, xm, ym, cm, t, legendTraces, normalization])

  const handleClick = useCallback(
    (e: Readonly<PlotMouseEvent>) => {
      const id = e.points?.[0]?.customdata
      if (typeof id === 'number') onPointClick(id)
    },
    [onPointClick],
  )
  const handleSelected = useCallback(
    (e: Readonly<PlotSelectionEvent> | undefined) => {
      if (!e?.points?.length) return
      const ids = e.points.map((p) => p.customdata).filter((v): v is number => typeof v === 'number')
      if (ids.length) onLasso(ids)
    },
    [onLasso],
  )

  const current = activePreset({ x, y, size, color })
  const lowCount = plotted.filter((r) => isLowSample(r, minGp, minMinutes)).length

  return (
    <div className="flex flex-col gap-2">
      {(current?.note || unplotted > 0 || lowCount > 0) && (
        <p className="text-xs text-ink-2">
          {current?.note && <span>{current.note} </span>}
          {unplotted > 0 && <span>{unplotted} of {rows.length} players lack a value for one of these axes and are not plotted (they stay in the table). </span>}
          {lowCount > 0 && <span>Faded markers: {lowCount} players below the sample thresholds ({minGp} games, {minMinutes} minutes).</span>}
        </p>
      )}
      <div style={{ height: CHART_HEIGHT }} className="w-full">
        {plotted.length === 0 ? (
          <p className="pt-10 text-center text-sm text-ink-3">No player has values on both axes under the current filters.</p>
        ) : (
          <Plot data={data} layout={layout} config={CHART_CONFIG} onClick={handleClick} onSelected={handleSelected} onHover={(e) => { const id = Number(e.points[0]?.customdata); if (Number.isFinite(id)) onPointHover?.(id) }} onUnhover={() => onPointHover?.(null)} />
        )}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
        <p data-testid="explorer-encoding" className="text-ink-2">{encodingLegend(size, color, getMetric, normalization)}</p>
        <p className="text-ink-3">Drag to box-select · lasso · reset</p>
      </div>
    </div>
  )
}
