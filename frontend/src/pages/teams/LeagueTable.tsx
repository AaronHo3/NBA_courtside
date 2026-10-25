import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable, downloadCsv } from '@/components/table/DataTable'
import { Button, Input, Panel, TeamMark } from '@/components/ui'
import type { TeamSeason } from '@/lib/types'
import { formatTeamMetric, numberAt, wl } from './teamMetrics'
import { MetricHeader, Note } from './shared'

const COLS = ['net_rating', 'off_rating', 'def_rating', 'pace', 'efg_pct', 'tm_tov_pct', 'oreb_pct', 'fta_rate', 'opp_efg_pct', 'opp_tov_pct', 'opp_oreb_pct', 'opp_fta_rate', 'fg3a_rate'] as const
const CSV_COLS = ['abbreviation', 'full_name', 'conference', 'division', 'season', 'gp', 'w', 'l', ...COLS]

export function LeagueTable({ rows, season, caveat }: { rows: TeamSeason[]; season: string; caveat?: string }) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('')
  const columns = useMemo<ColumnDef<TeamSeason, unknown>[]>(
    () => [
      {
        id: 'team', header: 'Team', accessorFn: (r) => `${r.abbreviation} ${r.full_name}`,
        cell: ({ row }) => (
          <span className="inline-flex items-baseline gap-1.5">
            <TeamMark abbreviation={row.original.abbreviation} teamId={row.original.team_id} size={18} />
            <span className="font-medium text-ink">{row.original.abbreviation}</span>
            <span className="hidden text-xs text-ink-3 md:inline">{row.original.full_name}</span>
          </span>
        ),
      },
      { id: 'wl', header: 'W–L', accessorFn: (r) => r.w, cell: ({ row }) => wl(row.original), meta: { numeric: true } },
      ...COLS.map((k): ColumnDef<TeamSeason, unknown> => ({
        id: k,
        header: () => <MetricHeader metric={k} short />,
        accessorFn: (r) => numberAt(r, k),
        cell: ({ getValue }) => formatTeamMetric(k, getValue() as number | null),
        meta: { numeric: true },
        sortUndefined: 'last',
      })),
    ],
    [],
  )
  const exportCsv = () => downloadCsv(`teams-${season}.csv`, rows as unknown as Record<string, unknown>[], CSV_COLS)
  return (
    <Panel
      question="League table"
      method={`Every team season for ${season}: record, ratings, pace and four factors (own and opponent). Click a row for the team page.`}
      actions={
        <>
          <Input aria-label="Filter teams" placeholder="Filter teams" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-40" />
          <Button size="sm" onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>
        </>
      }
    >
      <DataTable
        data={rows}
        columns={columns}
        rowKey={(r) => r.team_id}
        onRowClick={(r) => navigate(`/teams/${r.team_id}?season=${encodeURIComponent(season)}`)}
        initialSort={[{ id: 'net_rating', desc: true }]}
        globalFilter={filter}
        height={560}
        dense
        emptyMessage="No team seasons for this season."
      />
      <Note>n = {rows.length} teams. {caveat ?? 'Team ratings are provider/derived estimates; player ratings do not add up to them.'}</Note>
    </Panel>
  )
}
