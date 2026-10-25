import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import type { Data, Layout } from 'plotly.js'
import { Plot, useChartTheme } from '@/components/charts/Plot'
import { DataTable } from '@/components/table/DataTable'
import { Badge, EmptyState, Panel, Refetching } from '@/components/ui'
import { useZones } from '@/hooks/useApi'
import { formatNumber, formatPct, isNil, wilsonText } from '@/lib/format'
import type { SeasonType, ZoneSummary } from '@/lib/types'

type Props = { playerId: number; season: string; seasonType: SeasonType }

function signedPct(v: number | null): string {
  if (isNil(v)) return '–'
  return `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)} pts`
}

export function ShootingSummary({ playerId, season, seasonType }: Props) {
  const q = useZones({ season, season_type: seasonType, player_id: playerId })
  const t = useChartTheme()
  const zones = useMemo(() => [...(q.data?.data ?? [])].sort((a, b) => b.frequency - a.frequency), [q.data])
  const meta = q.data?.meta
  const labLink = <Link to={`/shooting?player=${playerId}&season=${season}`} className="text-sm font-medium text-accent hover:underline">Open in the shooting lab</Link>

  const data = useMemo<Data[]>(() => {
    const rows = [...zones].reverse()
    return [{
      type: 'bar',
      orientation: 'h',
      x: rows.map((z) => z.frequency),
      y: rows.map((z) => z.zone),
      name: 'Share of FGA',
      marker: { color: rows.map((z) => (z.low_sample ? t.ink3 : t.accent)) },
      customdata: rows.map((z) => [formatPct(z.fg_pct), formatNumber(z.fga, 0), formatPct(z.league_fg_pct), z.low_sample ? ' · low sample' : '']),
      hovertemplate: '%{y}<br>%{x:.1%} of FGA (%{customdata[1]} att.)<br>FG%% %{customdata[0]} vs league %{customdata[2]}%{customdata[3]}<extra></extra>',
    }]
  }, [zones, t])
  const layout = useMemo<Partial<Layout>>(() => ({
    margin: { l: 130, r: 12, t: 6, b: 32 },
    showlegend: false,
    bargap: 0.3,
    xaxis: { tickformat: '.0%', title: { text: 'Share of field-goal attempts' }, fixedrange: true, rangemode: 'tozero' },
    yaxis: { automargin: true, fixedrange: true, tickfont: { size: 11 } },
  }), [])

  const columns = useMemo<ColumnDef<ZoneSummary, unknown>[]>(() => [
    { id: 'zone', accessorKey: 'zone', header: 'Zone', cell: (c) => <span className="inline-flex items-center gap-1.5">{c.getValue<string>()}{c.row.original.low_sample && <Badge tone="warning">Low sample</Badge>}</span> },
    { id: 'fga', accessorKey: 'fga', header: 'FGA', meta: { numeric: true }, cell: (c) => formatNumber(c.getValue<number>(), 0) },
    { id: 'frequency', accessorKey: 'frequency', header: 'Frequency', meta: { numeric: true }, cell: (c) => formatPct(c.getValue<number>()) },
    { id: 'fg_pct', accessorKey: 'fg_pct', header: 'FG%', meta: { numeric: true }, sortUndefined: 'last', cell: (c) => formatPct(c.getValue<number | null>()) },
    { id: 'league_fg_pct', accessorKey: 'league_fg_pct', header: 'League FG% in zone', meta: { numeric: true }, sortUndefined: 'last', cell: (c) => formatPct(c.getValue<number | null>()) },
    { id: 'rel_fg_pct', accessorKey: 'rel_fg_pct', header: 'Relative FG%', meta: { numeric: true }, sortUndefined: 'last', cell: (c) => { const v = c.getValue<number | null>(); return <span className={isNil(v) ? '' : v > 0 ? 'text-good' : v < 0 ? 'text-critical' : ''}>{signedPct(v)}</span> } },
    { id: 'pts_per_fga', accessorKey: 'pts_per_fga', header: 'Pts / FGA', meta: { numeric: true }, sortUndefined: 'last', cell: (c) => formatNumber(c.getValue<number | null>(), 2) },
    { id: 'ci', accessorFn: (z) => z.ci_low, header: '95% interval', meta: { numeric: true }, enableSorting: false, cell: (c) => wilsonText(c.row.original.ci_low, c.row.original.ci_high) || '–' },
  ], [])

  return (
    <Panel
      question="Where does he shoot from, and how well?"
      method={`Shot zones for ${season}: share of attempts, FG% against the league's FG% from the same zone, and a 95% Wilson interval. Zones under the attempt threshold are flagged.`}
      actions={labLink}
    >
      <Refetching loading={q.isFetching} error={q.error} retry={() => q.refetch()}>
        {q.isLoading && !q.data ? (
          <p className="text-sm text-ink-3">Loading zones…</p>
        ) : meta && meta.available === false ? (
          <EmptyState title={`No shot detail for ${season}`} body={meta.reason ?? 'Shot-level data is not available for this season.'} action={labLink} />
        ) : zones.length === 0 ? (
          <EmptyState title={`No shots recorded for ${season}`} action={labLink} />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[2fr_3fr]">
            <div className="min-w-0">
              <p className="mb-1 text-xs text-ink-2">{formatNumber(meta?.total_fga ?? zones.reduce((s, z) => s + z.fga, 0), 0)} attempts · grey bars are low-sample zones</p>
              <div style={{ height: Math.max(180, zones.length * 30 + 60) }}>
                <Plot data={data} layout={layout} config={{ displayModeBar: false }} />
              </div>
            </div>
            <div className="min-w-0"><DataTable data={zones} columns={columns} rowKey={(z) => z.zone} dense height={Math.max(180, zones.length * 30 + 60)} initialSort={[{ id: 'frequency', desc: true }]} /></div>
          </div>
        )}
      </Refetching>
    </Panel>
  )
}
