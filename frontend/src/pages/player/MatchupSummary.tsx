import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/table/DataTable'
import { Badge, EmptyState, Panel, Refetching } from '@/components/ui'
import { useDefenseDash, useMatchupDefense, useMatchupOffense } from '@/hooks/useApi'
import { formatNumber, formatPct, isNil } from '@/lib/format'
import type { DefenseDashRow, MatchupRow, SeasonType } from '@/lib/types'

type Props = { playerId: number; season: string; seasonType: SeasonType }
const TOP_N = 8

function ciText(low: number | null, high: number | null): string {
  return isNil(low) || isNil(high) ? '–' : `${(low * 100).toFixed(0)}–${(high * 100).toFixed(0)}%`
}

function matchupColumns(side: 'offense' | 'defense'): ColumnDef<MatchupRow, unknown>[] {
  const nameKey = side === 'offense' ? 'def_player_name' : 'off_player_name'
  const idKey = side === 'offense' ? 'def_player_id' : 'off_player_id'
  const posKey = side === 'offense' ? 'def_position' : 'off_position'
  return [
    {
      id: 'player',
      accessorFn: (r) => r[nameKey],
      header: side === 'offense' ? 'Defender' : 'Offensive player',
      cell: (c) => (
        <span className="inline-flex items-center gap-1.5">
          <Link to={`/players/${c.row.original[idKey]}`} className="text-accent hover:underline">{c.row.original[nameKey]}</Link>
          {c.row.original[posKey] && <span className="text-xs text-ink-3">{c.row.original[posKey]}</span>}
          {!c.row.original.qualifies && <Badge tone="warning">Low sample</Badge>}
        </span>
      ),
    },
    { id: 'partial_poss', accessorKey: 'partial_poss', header: 'Poss', meta: { numeric: true }, sortUndefined: 'last', cell: (c) => formatNumber(c.getValue<number | null>(), 0) },
    { id: 'pts_per_poss', accessorKey: 'pts_per_poss', header: 'Pts / poss', meta: { numeric: true }, sortUndefined: 'last', cell: (c) => formatNumber(c.getValue<number | null>(), 2) },
    { id: 'fg', accessorKey: 'fg_pct', header: 'FG% raw', meta: { numeric: true }, sortUndefined: 'last', cell: (c) => `${formatPct(c.getValue<number | null>())} (${formatNumber(c.row.original.matchup_fgm, 0)}/${formatNumber(c.row.original.matchup_fga, 0)})` },
    { id: 'fg_pct_shrunk', accessorKey: 'fg_pct_shrunk', header: 'FG% shrunk', meta: { numeric: true }, sortUndefined: 'last', cell: (c) => formatPct(c.getValue<number | null>()) },
    { id: 'ci', accessorFn: (r) => r.ci_low, header: '95% Wilson CI', meta: { numeric: true }, enableSorting: false, cell: (c) => ciText(c.row.original.ci_low, c.row.original.ci_high) },
  ]
}

function topByPoss(rows: MatchupRow[] | undefined): MatchupRow[] {
  return [...(rows ?? [])].sort((a, b) => (b.partial_poss ?? 0) - (a.partial_poss ?? 0)).slice(0, TOP_N)
}

const DEFENSE_COLUMNS: ColumnDef<DefenseDashRow, unknown>[] = [
  { id: 'defense_category', accessorKey: 'defense_category', header: 'Shot category' },
  { id: 'd_fga', accessorKey: 'd_fga', header: 'Defended FGA', meta: { numeric: true }, sortUndefined: 'last', cell: (c) => formatNumber(c.getValue<number | null>(), 0) },
  { id: 'd_fg_pct', accessorKey: 'd_fg_pct', header: 'D-FG%', meta: { numeric: true }, sortUndefined: 'last', cell: (c) => formatPct(c.getValue<number | null>()) },
  { id: 'normal_fg_pct', accessorKey: 'normal_fg_pct', header: "Shooters' normal FG%", meta: { numeric: true }, sortUndefined: 'last', cell: (c) => formatPct(c.getValue<number | null>()) },
  {
    id: 'pct_plusminus', accessorKey: 'pct_plusminus', header: 'Difference', meta: { numeric: true }, sortUndefined: 'last',
    cell: (c) => { const v = c.getValue<number | null>(); return <span className={isNil(v) ? '' : v < 0 ? 'text-good' : v > 0 ? 'text-critical' : ''}>{isNil(v) ? '–' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)} pts`}</span> },
  },
]

export function MatchupSummary({ playerId, season, seasonType }: Props) {
  const params = { season, season_type: seasonType }
  const off = useMatchupOffense(playerId, params)
  const def = useMatchupDefense(playerId, params)
  const dash = useDefenseDash(playerId, params)
  const offRows = useMemo(() => topByPoss(off.data?.data), [off.data])
  const defRows = useMemo(() => topByPoss(def.data?.data), [def.data])
  const offCols = useMemo(() => matchupColumns('offense'), [])
  const defCols = useMemo(() => matchupColumns('defense'), [])
  const meta = off.data?.meta ?? def.data?.meta
  const unavailable = meta ? meta.available === false : false
  const explorerLink = <Link to={`/matchups?player=${playerId}&season=${season}`} className="text-sm font-medium text-accent hover:underline">Open the matchup explorer</Link>
  const tableHeight = TOP_N * 30 + 40

  return (
    <Panel
      question="Who has he seen most, and how did it go?"
      method={`The ${TOP_N} most frequent matchups in ${season} by partial possessions, with FG% shrunk toward the league matchup average; plus opponents' FG% with him as the closest defender.`}
      info={meta?.shrinkage}
      actions={explorerLink}
    >
      {meta && !unavailable && <p className="mb-3 max-w-prose text-xs text-ink-2">{meta.wording}</p>}
      {unavailable ? (
        <EmptyState title={`No matchup detail for ${season}`} body={meta?.reason ?? 'Matchup data is not available for this season.'} action={explorerLink} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          <section aria-labelledby="mu-off" className="min-w-0">
            <h3 id="mu-off" className="mb-2 text-xs font-medium text-ink-2">On offense: defenders who guarded him most</h3>
            <Refetching loading={off.isFetching} error={off.error} retry={() => off.refetch()}>
              <DataTable data={offRows} columns={offCols} rowKey={(r) => r.def_player_id} dense height={tableHeight} initialSort={[{ id: 'partial_poss', desc: true }]} emptyMessage={off.isLoading ? 'Loading…' : 'No matchups on record.'} />
            </Refetching>
          </section>
          <section aria-labelledby="mu-def" className="min-w-0">
            <h3 id="mu-def" className="mb-2 text-xs font-medium text-ink-2">On defense: offensive players he guarded most</h3>
            <Refetching loading={def.isFetching} error={def.error} retry={() => def.refetch()}>
              <DataTable data={defRows} columns={defCols} rowKey={(r) => r.off_player_id} dense height={tableHeight} initialSort={[{ id: 'partial_poss', desc: true }]} emptyMessage={def.isLoading ? 'Loading…' : 'No matchups on record.'} />
            </Refetching>
          </section>
        </div>
      )}
      <section aria-labelledby="mu-dash" className="mt-5 border-t border-line pt-4">
        <h3 id="mu-dash" className="mb-1 text-xs font-medium text-ink-2">Defensive dashboard: shots with him as closest defender</h3>
        {dash.data?.meta.definition && <p className="mb-2 max-w-prose text-xs text-ink-3">{dash.data.meta.definition}</p>}
        <Refetching loading={dash.isFetching} error={dash.error} retry={() => dash.refetch()}>
          <DataTable data={dash.data?.data ?? []} columns={DEFENSE_COLUMNS} rowKey={(r) => r.defense_category} dense height={320} emptyMessage={dash.isLoading ? 'Loading…' : `No defensive tracking for ${season}.`} />
        </Refetching>
      </section>
    </Panel>
  )
}
