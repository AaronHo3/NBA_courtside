import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { Data, Layout } from 'plotly.js'
import { ChartFrame } from '@/components/charts/ChartFrame'
import { Plot, useChartTheme } from '@/components/charts/Plot'
import { SEQUENTIAL_BLUE } from '@/components/charts/palette'
import { DataTable, downloadCsv } from '@/components/table/DataTable'
import { Badge, Button, Panel, Select, PlayerIdentity } from '@/components/ui'
import { MetricLabel } from '@/components/ui/MetricLabel'
import { formatNumber, formatPct, formatSigned } from '@/lib/format'
import { useParam } from '@/lib/urlState'
import { useCompare } from '@/store/compare'
import type { RosterRow, TeamSeason } from '@/lib/types'
import { shareRows } from './analysis'
import { Note } from './shared'

const TOP_N = 9
const SORT_OPTIONS = [
  { id: 'min', label: 'Minutes' }, { id: 'pts', label: 'Points' }, { id: 'usg_pct', label: 'USG%' }, { id: 'ts_pct', label: 'TS%' },
  { id: 'net_rating', label: 'NetRtg' }, { id: 'on_off_net', label: 'On/off net' }, { id: 'mpg', label: 'MPG' },
] as const
const CSV_COLS = ['player_id', 'full_name', 'position', 'gp', 'min', 'mpg', 'pts', 'share_min', 'share_pts', 'usg_pct', 'ts_pct', 'net_rating', 'on_net_rating', 'off_net_rating', 'on_off_net', 'traded']

function SharesChart({ roster }: { roster: RosterRow[] }) {
  const t = useChartTheme()
  const rows = useMemo(() => shareRows(roster, TOP_N), [roster])
  const colors = useMemo(() => {
    const steps = [...SEQUENTIAL_BLUE].reverse() // darkest first = most minutes
    return rows.map((r, i) => (r.player_id === null ? t.axis : steps[Math.min(i, steps.length - 1)]))
  }, [rows, t])
  const { data, layout } = useMemo(() => {
    const data: Data[] = rows.map((r, i) => ({
      type: 'bar', orientation: 'h', name: r.label,
      y: ['Points', 'Minutes'], x: [r.sharePts, r.shareMin],
      marker: { color: colors[i], line: { color: t.surface, width: 1 } },
      text: [r.sharePts >= 0.06 ? r.label : '', r.shareMin >= 0.06 ? r.label : ''], textposition: 'inside', insidetextanchor: 'middle', textfont: { size: 11 },
      customdata: [[formatPct(r.sharePts), `${formatNumber(r.pts, 0)} pts`, r.fullName], [formatPct(r.shareMin), `${formatNumber(r.min, 0)} min`, r.fullName]],
      hovertemplate: '<b>%{customdata[0]}</b> of team %{y} · %{customdata[1]}<br>%{customdata[2]}<extra></extra>',
    }))
    const layout: Partial<Layout> = {
      barmode: 'stack', showlegend: false, bargap: 0.25,
      margin: { l: 56, r: 8, t: 4, b: 28 },
      xaxis: { range: [0, 1], tickformat: '.0%', tickfont: { size: 10 } },
      yaxis: { type: 'category', tickfont: { size: 11 } },
    }
    return { data, layout }
  }, [rows, colors, t])
  return (
    <ChartFrame title="Share of team points and minutes" height={150} legend={rows.map((r, i) => ({ label: r.label, color: colors[i] }))}>
      <Plot data={data} layout={layout} config={{ displayModeBar: false }} />
    </ChartFrame>
  )
}

function CompareButton({ row }: { row: RosterRow }) {
  const has = useCompare((s) => s.has(row.player_id))
  const toggle = useCompare((s) => s.toggle)
  return (
    <Button size="sm" variant={has ? 'ghost' : 'default'} aria-pressed={has} aria-label={`${has ? 'Remove' : 'Add'} ${row.full_name} ${has ? 'from' : 'to'} comparison`} onClick={() => toggle({ player_id: row.player_id, full_name: row.full_name, team_abbreviation: row.team_abbreviation })}>
      {has ? 'Added' : 'Compare'}
    </Button>
  )
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Shares of additive totals (minutes, points) plus a per-player table. Ratings are never summed. */
export function RosterPanel({ roster, team, caveat }: { roster: RosterRow[]; team: TeamSeason; caveat?: string }) {
  const [sort, setSort] = useParam('rsort', 'min')
  const columns = useMemo<ColumnDef<RosterRow, unknown>[]>(() => [
    {
      id: 'player', header: 'Player', accessorFn: (r) => r.full_name,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5">
          <PlayerIdentity playerId={row.original.player_id} name={row.original.full_name} team={row.original.team_abbreviation} position={row.original.position} size="xs" />
          {row.original.traded && <Badge tone="warning">traded</Badge>}
        </span>
      ),
    },
    { id: 'position', header: 'Pos', accessorFn: (r) => r.position ?? '', cell: ({ getValue }) => (getValue() as string) || '–' },
    { id: 'gp', header: 'GP', accessorFn: (r) => num(r.gp), cell: ({ getValue }) => formatNumber(getValue() as number | null, 0), meta: { numeric: true }, sortUndefined: 'last' },
    { id: 'min', header: () => <MetricLabel metric="min" normalization="totals" />, accessorFn: (r) => num(r.min), cell: ({ getValue }) => formatNumber(getValue() as number | null, 0), meta: { numeric: true }, sortUndefined: 'last' },
    { id: 'mpg', header: 'MPG', accessorFn: (r) => num(r.mpg), cell: ({ getValue }) => formatNumber(getValue() as number | null, 1), meta: { numeric: true }, sortUndefined: 'last' },
    { id: 'pts', header: () => <MetricLabel metric="pts" normalization="totals" />, accessorFn: (r) => num(r.pts), cell: ({ getValue }) => formatNumber(getValue() as number | null, 0), meta: { numeric: true }, sortUndefined: 'last' },
    { id: 'share_min', header: 'Min share', accessorFn: (r) => num(r.share_min), cell: ({ getValue }) => formatPct(getValue() as number | null), meta: { numeric: true }, sortUndefined: 'last' },
    { id: 'share_pts', header: 'Pts share', accessorFn: (r) => num(r.share_pts), cell: ({ getValue }) => formatPct(getValue() as number | null), meta: { numeric: true }, sortUndefined: 'last' },
    { id: 'usg_pct', header: () => <MetricLabel metric="usg_pct" />, accessorFn: (r) => num(r.usg_pct), cell: ({ getValue }) => { const v = getValue() as number | null; return v === null ? '–' : `${v.toFixed(1)}%` }, meta: { numeric: true }, sortUndefined: 'last' },
    { id: 'ts_pct', header: () => <MetricLabel metric="ts_pct" />, accessorFn: (r) => num(r.ts_pct), cell: ({ getValue }) => formatPct(getValue() as number | null), meta: { numeric: true }, sortUndefined: 'last' },
    { id: 'net_rating', header: () => <MetricLabel metric="net_rating" />, accessorFn: (r) => num(r.net_rating), cell: ({ getValue }) => formatSigned(getValue() as number | null), meta: { numeric: true }, sortUndefined: 'last' },
    { id: 'on_off_net', header: () => <MetricLabel metric="on_off_net" />, accessorFn: (r) => num(r.on_off_net), cell: ({ getValue }) => formatSigned(getValue() as number | null), meta: { numeric: true }, sortUndefined: 'last' },
    { id: 'compare', header: 'Compare', enableSorting: false, cell: ({ row }) => <CompareButton row={row.original} /> },
  ], [])
  const sortId = SORT_OPTIONS.some((o) => o.id === sort) ? sort : 'min'
  return (
    <Panel
      question="Who carries the load?"
      method="Shares of team minutes and points are additive, so the stacked bars sum to the team total. Ratings below are per-player estimates and are not summed."
      actions={
        <>
          <Select aria-label="Sort roster by" value={sortId} onChange={(e) => setSort(e.target.value)}>
            {SORT_OPTIONS.map((o) => <option key={o.id} value={o.id}>Sort: {o.label}</option>)}
          </Select>
          <Button size="sm" onClick={() => downloadCsv(`${team.abbreviation}-${team.season}-roster.csv`, roster as unknown as Record<string, unknown>[], CSV_COLS)} disabled={!roster.length}>Export CSV</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SharesChart roster={roster} />
        <DataTable key={sortId} data={roster} columns={columns} rowKey={(r) => r.player_id} initialSort={[{ id: sortId, desc: true }]} maxHeight={520} dense pinFirstColumn emptyMessage="No roster rows for this season." />
        <Note>{roster.length} players. {caveat ?? 'Team ratings are provider/derived estimates; player ratings do not add up to them.'} On/off net is raw and not adjusted for teammates, opponents or minutes. Traded players show their stint with this team only.</Note>
      </div>
    </Panel>
  )
}
