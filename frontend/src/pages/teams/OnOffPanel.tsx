import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { Data, Layout } from 'plotly.js'
import { Plot, useChartTheme } from '@/components/charts/Plot'
import { DataTable } from '@/components/table/DataTable'
import { EmptyState, Panel } from '@/components/ui'
import { formatNumber, formatSigned } from '@/lib/format'
import type { OnOffRow } from '@/lib/types'
import { ChartBox, LegendChips, Note } from './shared'

const CAVEAT = 'Raw on/off is not adjusted for teammates, opponents, or minutes: a starter is "off" mostly against benches, and a reserve’s "on" minutes come in different game states. It describes the team with and without a player; it does not say the player caused the gap.'
const LOW_MIN = 300

function Dumbbell({ rows }: { rows: OnOffRow[] }) {
  const t = useChartTheme()
  const { data, layout } = useMemo(() => {
    const names = rows.map((r) => r.full_name)
    const connectors: Data[] = rows.map((r) => ({
      type: 'scatter', mode: 'lines', x: [r.off_net_rating, r.on_net_rating], y: [r.full_name, r.full_name], line: { color: t.axis, width: 2 }, hoverinfo: 'skip', showlegend: false,
    }))
    const mk = (key: 'on_net_rating' | 'off_net_rating', name: string, color: string): Data => ({
      type: 'scatter', mode: 'markers', name, x: rows.map((r) => r[key]), y: names,
      marker: { color, size: 10, line: { color: t.surface, width: 1 } },
      customdata: rows.map((r) => [formatSigned(r[key]), formatNumber(key === 'on_net_rating' ? r.on_min : r.off_min, 0), formatSigned(r.on_off_net)]),
      hovertemplate: `<b>%{customdata[0]} net ${key === 'on_net_rating' ? 'on' : 'off'}</b> · %{customdata[1]} min<br>%{y} · on−off %{customdata[2]}<extra></extra>`,
    })
    const data: Data[] = [...connectors, mk('off_net_rating', 'Off floor', t.series[1]), mk('on_net_rating', 'On floor', t.series[0])]
    const layout: Partial<Layout> = {
      showlegend: false,
      margin: { l: 150, r: 16, t: 4, b: 40 },
      xaxis: { title: { text: 'Team net rating' }, zeroline: true },
      yaxis: { type: 'category', categoryorder: 'array', categoryarray: names, autorange: 'reversed', tickfont: { size: 11 } },
    }
    return { data, layout }
  }, [rows, t])
  return (
    <div className="flex flex-col gap-2">
      <LegendChips ariaLabel="On/off legend" items={[{ label: 'Team net rating with player on floor', color: t.series[0] }, { label: 'With player off floor', color: t.series[1] }]} />
      <ChartBox height={60 + 24 * rows.length}>
        <Plot data={data} layout={layout} config={{ displayModeBar: false }} />
      </ChartBox>
    </div>
  )
}

/** Team ratings with each player on vs off the floor, sorted by the on−off gap. */
export function OnOffPanel({ rows }: { rows: OnOffRow[] }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => b.on_off_net - a.on_off_net), [rows])
  const lowMin = sorted.filter((r) => r.on_min < LOW_MIN || r.off_min < LOW_MIN).length
  const columns = useMemo<ColumnDef<OnOffRow, unknown>[]>(() => [
    { id: 'player', header: 'Player', accessorFn: (r) => r.full_name, cell: ({ row }) => <span className={row.original.on_min < LOW_MIN ? 'text-ink-3' : undefined}>{row.original.full_name}{row.original.on_min < LOW_MIN ? ' *' : ''}</span> },
    { id: 'gp', header: 'GP', accessorFn: (r) => r.gp, cell: ({ getValue }) => formatNumber(getValue() as number, 0), meta: { numeric: true } },
    { id: 'on_min', header: 'On min', accessorFn: (r) => r.on_min, cell: ({ getValue }) => formatNumber(getValue() as number, 0), meta: { numeric: true } },
    { id: 'off_min', header: 'Off min', accessorFn: (r) => r.off_min, cell: ({ getValue }) => formatNumber(getValue() as number, 0), meta: { numeric: true } },
    { id: 'on_off_rating', header: 'On ORtg', accessorFn: (r) => r.on_off_rating, cell: ({ getValue }) => formatNumber(getValue() as number, 1), meta: { numeric: true } },
    { id: 'on_def_rating', header: 'On DRtg', accessorFn: (r) => r.on_def_rating, cell: ({ getValue }) => formatNumber(getValue() as number, 1), meta: { numeric: true } },
    { id: 'on_net_rating', header: 'On net', accessorFn: (r) => r.on_net_rating, cell: ({ getValue }) => formatSigned(getValue() as number), meta: { numeric: true } },
    { id: 'off_off_rating', header: 'Off ORtg', accessorFn: (r) => r.off_off_rating, cell: ({ getValue }) => formatNumber(getValue() as number, 1), meta: { numeric: true } },
    { id: 'off_def_rating', header: 'Off DRtg', accessorFn: (r) => r.off_def_rating, cell: ({ getValue }) => formatNumber(getValue() as number, 1), meta: { numeric: true } },
    { id: 'off_net_rating', header: 'Off net', accessorFn: (r) => r.off_net_rating, cell: ({ getValue }) => formatSigned(getValue() as number), meta: { numeric: true } },
    { id: 'on_off_net', header: 'On − off', accessorFn: (r) => r.on_off_net, cell: ({ getValue }) => <span className="font-medium">{formatSigned(getValue() as number)}</span>, meta: { numeric: true } },
  ], [])
  return (
    <Panel question="Did the team play better with him on the floor?" method="Team offensive, defensive and net rating split by whether each player was on the floor; sorted by the on − off gap.">
      {!rows.length ? (
        <EmptyState title="No on/off data for this season" body="On/off splits are loaded for 2023-24 onward in this dataset." />
      ) : (
        <div className="flex flex-col gap-4">
          <Dumbbell rows={sorted} />
          <DataTable data={sorted} columns={columns} rowKey={(r) => r.player_id} initialSort={[{ id: 'on_off_net', desc: true }]} height={440} dense />
          <Note>{CAVEAT}{lowMin ? ` * ${lowMin} player${lowMin === 1 ? '' : 's'} with fewer than ${LOW_MIN} minutes on or off: treat those gaps as noise.` : ''}</Note>
        </div>
      )}
    </Panel>
  )
}
