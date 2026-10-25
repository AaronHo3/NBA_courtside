import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { Data, Layout } from 'plotly.js'
import { Plot, useChartTheme } from '@/components/charts/Plot'
import { DataTable } from '@/components/table/DataTable'
import { Input, Panel, Refetching, Segmented } from '@/components/ui'
import { MetricLabel } from '@/components/ui/MetricLabel'
import { useMetricIndex, usePercentiles } from '@/hooks/useApi'
import { formatMetric, formatNumber, isNil } from '@/lib/format'
import { useNumberParam, useParam } from '@/lib/urlState'
import type { PercentileEntry, SeasonType } from '@/lib/types'
import { useCompare } from '@/store/compare'

type Population = 'all' | 'position' | 'team' | 'custom'
const POPULATIONS: Array<{ value: Population; label: string; title: string }> = [
  { value: 'all', label: 'All qualified', title: 'Every player meeting the minutes threshold' },
  { value: 'position', label: 'Positional peers', title: 'Players listed at the same position' },
  { value: 'team', label: 'Teammates', title: 'Players on the same team this season' },
  { value: 'custom', label: 'Selected players', title: 'The comparison group in the tray' },
]
const SMALL_POPULATION = 20

function isPopulation(v: string): v is Population {
  return POPULATIONS.some((p) => p.value === v)
}

type Props = { playerId: number; season: string; seasonType: SeasonType }

export function PercentilesPanel({ playerId, season, seasonType }: Props) {
  const [popRaw, setPop] = useParam('pop', 'all')
  const population: Population = isPopulation(popRaw) ? popRaw : 'all'
  const [minMinutes, setMinMinutes] = useNumberParam('minmin', 0)
  const comparePlayers = useCompare((s) => s.players)
  const compareIds = useMemo(() => comparePlayers.map((p) => p.player_id), [comparePlayers])
  const t = useChartTheme()
  const { get } = useMetricIndex()

  const customEmpty = population === 'custom' && compareIds.length === 0
  const q = usePercentiles(playerId, {
    season,
    season_type: seasonType,
    population,
    ids: population === 'custom' ? compareIds : undefined,
    min_minutes: minMinutes > 0 ? minMinutes : undefined,
  })
  const entries = useMemo(() => q.data?.data.metrics ?? [], [q.data])
  const pop = q.data?.data.population
  const plotted = useMemo(() => entries.filter((e) => !isNil(e.percentile)), [entries])
  const flipped = plotted.filter((e) => get(e.metric)?.higher_is_better === false).map((e) => get(e.metric)?.label ?? e.metric)

  const data = useMemo<Data[]>(() => {
    const rows = [...plotted].reverse()
    return [{
      type: 'bar',
      orientation: 'h',
      x: rows.map((e) => e.percentile),
      y: rows.map((e) => get(e.metric)?.label ?? e.metric),
      name: 'Percentile',
      marker: { color: rows.map((e) => (e.population_size < SMALL_POPULATION ? t.ink3 : t.accent)) },
      customdata: rows.map((e) => [formatMetric(e.value, get(e.metric)), formatNumber(e.population_size, 0), e.normalization ? ` (${e.normalization.replace('_', ' ')})` : '']),
      hovertemplate: '%{y}: %{x:.0f}th percentile<br>Value %{customdata[0]}%{customdata[2]}<br>Population n = %{customdata[1]}<extra></extra>',
    }]
  }, [plotted, get, t])

  const layout = useMemo<Partial<Layout>>(() => ({
    margin: { l: 110, r: 12, t: 6, b: 32 },
    showlegend: false,
    bargap: 0.3,
    xaxis: { range: [0, 100], dtick: 25, title: { text: 'Percentile within population' }, fixedrange: true },
    yaxis: { automargin: true, fixedrange: true, tickfont: { size: 11 } },
    shapes: [{ type: 'line', x0: 50, x1: 50, y0: 0, y1: 1, yref: 'paper', line: { color: t.axis, width: 1, dash: 'dot' } }],
  }), [t])

  const columns = useMemo<ColumnDef<PercentileEntry, unknown>[]>(() => [
    { id: 'metric', accessorFn: (e) => get(e.metric)?.label ?? e.metric, header: 'Metric', cell: (c) => <MetricLabel metric={c.row.original.metric} normalization={c.row.original.normalization ?? 'per_game'} /> },
    { id: 'value', accessorFn: (e) => e.value, header: 'Value', meta: { numeric: true }, sortUndefined: 'last', cell: (c) => formatMetric(c.row.original.value, get(c.row.original.metric)) },
    { id: 'percentile', accessorFn: (e) => e.percentile, header: 'Percentile', meta: { numeric: true }, sortUndefined: 'last', cell: (c) => (isNil(c.row.original.percentile) ? '–' : formatNumber(c.row.original.percentile, 0)) },
    { id: 'n', accessorFn: (e) => e.population_size, header: 'n', meta: { numeric: true }, cell: (c) => (c.row.original.population_size < SMALL_POPULATION ? <span className="text-warning" title="Small population">{c.row.original.population_size}</span> : c.row.original.population_size) },
  ], [get])

  return (
    <Panel
      question="Where does he rank among his peers?"
      method={`Percentile of each metric within the chosen population for ${season}; counting stats compare per game. Lower-is-better metrics are already flipped so a higher percentile is always better.`}
    >
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="max-w-full overflow-x-auto"><div className="w-max"><Segmented<Population> ariaLabel="Population" value={population} onChange={(v) => setPop(v)} options={POPULATIONS} /></div></div>
        <Input label="Min minutes" type="number" min={0} step={50} value={minMinutes} onChange={(e) => setMinMinutes(Number(e.target.value) || 0)} className="w-24" />
      </div>
      {customEmpty && <p className="mb-3 text-xs text-warning">The comparison group is empty, so the population falls back to all qualified players. Add players to compare to use this option.</p>}
      <Refetching loading={q.isFetching} error={q.error} retry={() => q.refetch()}>
        {q.isLoading && !q.data ? (
          <p className="text-sm text-ink-3">Loading percentiles…</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
            <div className="min-w-0">
              <p className="mb-1 text-xs text-ink-2">
                Population: {pop?.label ?? '–'} · n = {pop ? formatNumber(pop.size, 0) : '–'}{pop && pop.min_minutes > 0 ? ` · ≥ ${formatNumber(pop.min_minutes, 0)} minutes` : ''}
                {pop && pop.size < SMALL_POPULATION && <span className="text-warning"> · small population, percentiles are coarse</span>}
              </p>
              <div style={{ height: Math.max(200, entries.length * 30 + 44) }}>
                <Plot data={data} layout={layout} config={{ displayModeBar: false }} />
              </div>
              {flipped.length > 0 && <p className="mt-1 text-xs text-ink-3">Lower is better for {flipped.join(', ')}; their percentiles were flipped server-side.</p>}
            </div>
            <div className="min-w-0"><DataTable data={entries} columns={columns} rowKey={(e) => e.metric} dense height={Math.max(200, entries.length * 30 + 44)} emptyMessage="No percentiles for this season." /></div>
          </div>
        )}
      </Refetching>
    </Panel>
  )
}
