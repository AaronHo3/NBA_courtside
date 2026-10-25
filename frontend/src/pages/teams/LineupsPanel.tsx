import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { Data, Layout } from 'plotly.js'
import { Plot, useChartTheme } from '@/components/charts/Plot'
import { DataTable, downloadCsv } from '@/components/table/DataTable'
import { Button, EmptyState, Input, Panel } from '@/components/ui'
import { formatNumber, formatSigned } from '@/lib/format'
import type { LineupRow } from '@/lib/types'
import { filterLineups } from './analysis'
import { ChartBox, LegendChips, MetricHeader, Note } from './shared'

const CSV_COLS = ['group_name', 'gp', 'w', 'l', 'min', 'poss', 'off_rating', 'def_rating', 'net_rating', 'pace', 'pts']

function LineupDots({ all, minPoss }: { all: LineupRow[]; minPoss: number }) {
  const t = useChartTheme()
  const { data, layout } = useMemo(() => {
    const rows = all.filter((l) => typeof l.poss === 'number')
    const mk = (subset: LineupRow[], name: string, symbol: 'circle' | 'circle-open'): Data => ({
      type: 'scatter', mode: 'markers', name,
      x: subset.map((l) => l.poss), y: subset.map((l) => l.net_rating),
      marker: { symbol, size: 10, color: t.accent, line: { width: 1.5, color: t.accent } },
      customdata: subset.map((l) => [formatSigned(l.net_rating), formatNumber(l.poss, 0), l.group_name, `${Math.round(l.w)}–${Math.round(l.l)}`, formatNumber(l.gp, 0)]),
      hovertemplate: '<b>%{customdata[0]} net</b> · %{customdata[1]} poss<br>%{customdata[2]}<br>%{customdata[3]}, %{customdata[4]} GP<extra></extra>',
    })
    const data: Data[] = [
      mk(rows.filter((l) => (l.poss ?? 0) >= minPoss), `≥ ${minPoss} possessions`, 'circle'),
      mk(rows.filter((l) => (l.poss ?? 0) < minPoss), `Below ${minPoss} possessions (unstable)`, 'circle-open'),
    ]
    const layout: Partial<Layout> = {
      showlegend: false,
      margin: { l: 52, r: 16, t: 8, b: 44 },
      xaxis: { title: { text: 'Possessions' }, rangemode: 'tozero' },
      yaxis: { title: { text: 'Net rating' }, zeroline: true },
      shapes: minPoss > 0 ? [{ type: 'line', xref: 'x', yref: 'paper', x0: minPoss, x1: minPoss, y0: 0, y1: 1, line: { color: t.axis, width: 1, dash: 'dot' } }] : [],
    }
    return { data, layout }
  }, [all, minPoss, t])
  return (
    <div className="flex flex-col gap-2">
      <LegendChips ariaLabel="Lineup legend" items={[{ label: `≥ ${minPoss} possessions`, color: t.accent }, { label: `Below ${minPoss} possessions (unstable)`, color: t.accent, hollow: true }]} />
      <ChartBox height={300}>
        <Plot data={data} layout={layout} />
      </ChartBox>
    </div>
  )
}

/** Five-man groups above a possession floor; the floor is a URL parameter so views are shareable. */
export function LineupsPanel({ lineups, minPoss, setMinPoss, team }: { lineups: LineupRow[]; minPoss: number; setMinPoss: (v: number | null) => void; team: { abbreviation: string; season: string } }) {
  const kept = useMemo(() => filterLineups(lineups, minPoss), [lineups, minPoss])
  const columns = useMemo<ColumnDef<LineupRow, unknown>[]>(() => [
    { id: 'lineup', header: 'Lineup', accessorFn: (r) => r.group_name, cell: ({ getValue }) => <span className="block max-w-[28rem] truncate" title={getValue() as string}>{getValue() as string}</span> },
    { id: 'gp', header: 'GP', accessorFn: (r) => r.gp, cell: ({ getValue }) => formatNumber(getValue() as number, 0), meta: { numeric: true } },
    { id: 'wl', header: 'W–L', accessorFn: (r) => r.w, cell: ({ row }) => `${Math.round(row.original.w)}–${Math.round(row.original.l)}`, meta: { numeric: true } },
    { id: 'min', header: 'Min', accessorFn: (r) => r.min, cell: ({ getValue }) => formatNumber(getValue() as number, 0), meta: { numeric: true } },
    { id: 'poss', header: 'Poss', accessorFn: (r) => r.poss, cell: ({ getValue }) => formatNumber(getValue() as number | null, 0), meta: { numeric: true } },
    { id: 'off_rating', header: () => <MetricHeader metric="off_rating" short />, accessorFn: (r) => r.off_rating, cell: ({ getValue }) => formatNumber(getValue() as number | null, 1), meta: { numeric: true } },
    { id: 'def_rating', header: () => <MetricHeader metric="def_rating" short />, accessorFn: (r) => r.def_rating, cell: ({ getValue }) => formatNumber(getValue() as number | null, 1), meta: { numeric: true } },
    { id: 'net_rating', header: () => <MetricHeader metric="net_rating" short />, accessorFn: (r) => r.net_rating, cell: ({ getValue }) => formatSigned(getValue() as number | null, 1), meta: { numeric: true } },
    { id: 'pace', header: 'Pace', accessorFn: (r) => r.pace, cell: ({ getValue }) => formatNumber(getValue() as number | null, 1), meta: { numeric: true } },
  ], [])
  return (
    <Panel
      question="Which five-man groups worked?"
      method="Lineups with at least the chosen possessions, most-used first. Hollow dots in the chart fall below the floor."
      actions={
        <>
          <Input aria-label="Minimum possessions" type="number" min={0} step={10} value={minPoss} onChange={(e) => setMinPoss(e.target.value === '' ? 0 : Number(e.target.value))} className="w-32" />
          <Button size="sm" onClick={() => downloadCsv(`${team.abbreviation}-${team.season}-lineups.csv`, kept as unknown as Record<string, unknown>[], CSV_COLS)} disabled={!kept.length}>Export CSV</Button>
        </>
      }
    >
      {!lineups.length ? (
        <EmptyState title="No lineup data for this season" body="Lineup splits are loaded for 2023-24 onward in this dataset; earlier seasons have team and player totals only." />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-ink-2">Showing {kept.length} of {lineups.length} lineups with ≥ {formatNumber(minPoss, 0)} possessions.</p>
          <LineupDots all={lineups} minPoss={minPoss} />
          <DataTable data={kept} columns={columns} rowKey={(r) => r.group_id} initialSort={[{ id: 'poss', desc: true }]} height={400} dense emptyMessage="No lineups reach this possession floor; lower it to see more." />
          <Note>Lineup ratings are estimates from the provider's five-man splits: a few hundred possessions can move net rating by double digits, and the five players' individual ratings are not summed here. Minutes and possessions are the sample behind each row.</Note>
        </div>
      )}
    </Panel>
  )
}
