import { useCallback, useMemo, type ReactNode } from 'react'
import type { Data, Layout, PlotMouseEvent, PlotSelectionEvent, Shape } from 'plotly.js'
import { Plot, useChartTheme } from '@/components/charts/Plot'
import { SEQUENTIAL_BLUE, toColorscale } from '@/components/charts/palette'
import { Button, Toggle } from '@/components/ui'
import { MetricLabel } from '@/components/ui/MetricLabel'
import { formatMetric, metricLabelWithNorm } from '@/lib/format'
import type { Metric, Normalization, PlayerRow } from '@/lib/types'
import { activePreset, axisReversed, formatWithUnit, isLowSample, median, numeric, NONE, POSITION, POSITIONS, primaryPosition, PRESETS, type MetricGroup, type Preset } from './helpers'

const CHART_HEIGHT = 520
const BASE_SIZE = 8
const SIZE_RANGE: [number, number] = [5, 26]
const LOW_SAMPLE_OPACITY = 0.4
const OPACITY = 0.85

export interface ExplorerChartProps {
  rows: PlayerRow[]
  groups: MetricGroup[]
  getMetric: (key: string) => Metric | undefined
  normalization: Normalization
  x: string
  y: string
  size: string
  color: string
  medians: boolean
  minGp: number
  minMinutes: number
  /** Ids drawn with a bold ring: the comparison group plus the row selected in the table. */
  highlightedIds: number[]
  /** Pointer over a marker (null when it leaves); the table mirrors it. */
  onPointHover?: (id: number | null) => void
  onChange: (patch: { x?: string; y?: string; size?: string; color?: string; medians?: boolean }) => void
  onPreset: (p: Preset) => void
  onPointClick: (playerId: number) => void
  onLasso: (playerIds: number[]) => void
}

function AxisControl({ label, metric, normalization, value, onChange, groups, extras }: { label: string; metric: string; normalization: Normalization; value: string; onChange: (v: string) => void; groups: MetricGroup[]; extras?: ReactNode }) {
  const isMetric = metric !== NONE && metric !== POSITION
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-ink-3">
      <span className="flex items-center gap-1 whitespace-nowrap">
        <span>{label}</span>
        {isMetric && <span className="text-ink-2">· <MetricLabel metric={metric} normalization={normalization} /></span>}
      </span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="control text-sm text-ink">
        {extras}
        {groups.map((g) => (
          <optgroup key={g.kind} label={g.label}>
            {g.options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  )
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
  const { rows, groups, getMetric, normalization, x, y, size, color, medians, minGp, minMinutes, highlightedIds, onChange, onPreset, onPointClick, onLasso, onPointHover } = props
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
    const ring = { color: t.surface, width: 1 }
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
          line: ring,
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

    const highlighted = plotted.filter((r) => highlightedIds.includes(r.player_id))
    if (highlighted.length) {
      const sizes = sm ? sizesFor(plotted.map((r) => numeric(r, size))) : plotted.map(() => BASE_SIZE)
      const sizeById = new Map(plotted.map((r, i) => [r.player_id, sizes[i]]))
      traces.push({
        type: 'scatter',
        mode: 'markers',
        name: 'Selected / comparing',
        x: highlighted.map((r) => numeric(r, x)),
        y: highlighted.map((r) => numeric(r, y)),
        customdata: highlighted.map((r) => r.player_id),
        hoverinfo: 'skip',
        marker: { symbol: 'circle-open', size: highlighted.map((r) => (sizeById.get(r.player_id) ?? BASE_SIZE) + 7), color: t.ink, line: { color: t.ink, width: 2.5 }, opacity: 1 },
      } as Data)
    }
    return traces
  }, [plotted, colorIsPosition, cm, sm, x, y, size, color, t, hoverFor, minGp, minMinutes, highlightedIds, normalization])

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
    const showlegend = data.length >= 2
    return {
      height: CHART_HEIGHT,
      showlegend,
      legend: { orientation: 'h', y: -0.16, x: 0, font: { color: t.ink2, size: 11 }, itemsizing: 'constant' },
      margin: { l: 60, r: cm ? 88 : 16, t: 12, b: showlegend ? 72 : 52 },
      hovermode: 'closest',
      dragmode: 'zoom',
      xaxis: { title: { text: axisTitle(xm, x, normalization) }, tickformat: tickFormat(xm), autorange: axisReversed(xm) ? 'reversed' : true, zeroline: false },
      yaxis: { title: { text: axisTitle(ym, y, normalization) }, tickformat: tickFormat(ym), autorange: axisReversed(ym) ? 'reversed' : true, zeroline: false },
      shapes,
      annotations,
    }
  }, [medians, plotted, x, y, xm, ym, cm, t, data.length, normalization])

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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick presets">
        <span className="mr-1 text-xs text-ink-3">Presets</span>
        {PRESETS.map((p) => (
          <Button key={p.key} size="sm" variant={current?.key === p.key ? 'primary' : 'default'} aria-pressed={current?.key === p.key} title={p.note} onClick={() => onPreset(p)}>
            {p.label}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
        <AxisControl label="X axis" metric={x} normalization={normalization} value={x} onChange={(v) => onChange({ x: v })} groups={groups} />
        <AxisControl label="Y axis" metric={y} normalization={normalization} value={y} onChange={(v) => onChange({ y: v })} groups={groups} />
        <AxisControl label="Bubble size" metric={size} normalization={normalization} value={size} onChange={(v) => onChange({ size: v })} groups={groups} extras={<option value={NONE}>None (uniform)</option>} />
        <AxisControl
          label="Colour"
          metric={color}
          normalization={normalization}
          value={color}
          onChange={(v) => onChange({ color: v })}
          groups={groups}
          extras={<><option value={NONE}>None</option><option value={POSITION}>Position (G / F / C)</option></>}
        />
        <div className="pb-1.5"><Toggle checked={medians} onChange={(v) => onChange({ medians: v })} label="Median lines" /></div>
      </div>
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
          <Plot data={data} layout={layout} onClick={handleClick} onSelected={handleSelected} onHover={(e) => { const id = Number(e.points[0]?.customdata); if (Number.isFinite(id)) onPointHover?.(id) }} onUnhover={() => onPointHover?.(null)} />
        )}
      </div>
      <p className="text-[11px] text-ink-3">Click a marker to open the player. Use the box or lasso tool in the chart toolbar to add players to the comparison group. Hover any marker for its values.</p>
    </div>
  )
}
