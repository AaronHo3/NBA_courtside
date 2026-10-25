import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { clsx } from 'clsx'
import { DataTable, downloadCsv } from '@/components/table/DataTable'
import { Badge, Button } from '@/components/ui'
import { formatNumber, formatPct, wilsonText } from '@/lib/format'
import type { MatchupRow } from '@/lib/types'
import { formatPpp, isLowSample, isQualifying, opponentOf, type MatchupView } from './helpers'

type Props = {
  rows: MatchupRow[]
  view: MatchupView
  minPoss: number
  selectedOpponentId: number | null
  csvName: string
  onSelectRow: (row: MatchupRow) => void
}

const num = { meta: { numeric: true } } as const

function dim(row: MatchupRow, minPoss: number, children: React.ReactNode) {
  return <span className={clsx(!isQualifying(row, minPoss) && 'text-ink-3')}>{children}</span>
}

export function MatchupTable({ rows, view, minPoss, selectedOpponentId, csvName, onSelectRow }: Props) {
  const columns = useMemo<ColumnDef<MatchupRow, unknown>[]>(() => [
    {
      id: 'opponent', header: view === 'offense' ? 'Defender' : 'Scorer',
      accessorFn: (r) => opponentOf(r, view).name,
      cell: ({ row }) => {
        const o = opponentOf(row.original, view)
        return dim(row.original, minPoss, <span className="inline-flex items-center gap-1.5"><span className="font-medium">{o.name}</span>{o.position && <span className="text-xs text-ink-3">{o.position}</span>}</span>)
      },
    },
    {
      id: 'qualifies', header: 'Status',
      accessorFn: (r) => (isQualifying(r, minPoss) ? 1 : 0),
      cell: ({ row }) => (
        <span className="inline-flex gap-1">
          {isQualifying(row.original, minPoss) ? <Badge tone="good">qualifies</Badge> : <Badge>below {minPoss} poss</Badge>}
          {isLowSample(row.original) && <Badge tone="warning">low sample</Badge>}
        </span>
      ),
    },
    { id: 'gp', header: 'GP', accessorKey: 'gp', ...num, cell: ({ row }) => dim(row.original, minPoss, row.original.gp) },
    { id: 'poss', header: 'Poss', accessorKey: 'partial_poss', ...num, cell: ({ row }) => dim(row.original, minPoss, formatNumber(row.original.partial_poss, 0)) },
    { id: 'min', header: 'Min', accessorKey: 'matchup_min', ...num, cell: ({ row }) => dim(row.original, minPoss, formatNumber(row.original.matchup_min, 1)) },
    { id: 'pts', header: 'Pts', accessorKey: 'player_pts', ...num, cell: ({ row }) => dim(row.original, minPoss, formatNumber(row.original.player_pts, 0)) },
    { id: 'ppp', header: 'Pts/poss', accessorKey: 'pts_per_poss', ...num, cell: ({ row }) => dim(row.original, minPoss, <strong>{formatPpp(row.original.pts_per_poss)}</strong>) },
    { id: 'fga', header: 'FGA', accessorKey: 'matchup_fga', ...num, cell: ({ row }) => dim(row.original, minPoss, formatNumber(row.original.matchup_fga, 0)) },
    { id: 'fgm', header: 'FGM', accessorKey: 'matchup_fgm', ...num, cell: ({ row }) => dim(row.original, minPoss, formatNumber(row.original.matchup_fgm, 0)) },
    { id: 'fg', header: 'FG% raw', accessorKey: 'fg_pct', ...num, cell: ({ row }) => dim(row.original, minPoss, formatPct(row.original.fg_pct)) },
    { id: 'fgs', header: 'FG% shrunk', accessorKey: 'fg_pct_shrunk', ...num, cell: ({ row }) => dim(row.original, minPoss, formatPct(row.original.fg_pct_shrunk)) },
    { id: 'ci', header: 'Raw FG% 95% interval', accessorFn: (r) => r.ci_low ?? -1, ...num, cell: ({ row }) => dim(row.original, minPoss, wilsonText(row.original.ci_low, row.original.ci_high).replace(' (95% Wilson)', '') || '–') },
    { id: 'fg3a', header: '3PA', accessorKey: 'matchup_fg3a', ...num, cell: ({ row }) => dim(row.original, minPoss, formatNumber(row.original.matchup_fg3a, 0)) },
    { id: 'fg3', header: '3P%', accessorKey: 'fg3_pct', ...num, cell: ({ row }) => dim(row.original, minPoss, formatPct(row.original.fg3_pct)) },
    { id: 'fta', header: 'FTA', accessorKey: 'matchup_fta', ...num, cell: ({ row }) => dim(row.original, minPoss, formatNumber(row.original.matchup_fta, 0)) },
    { id: 'sfl', header: 'Shooting fouls', accessorKey: 'sfl', ...num, cell: ({ row }) => dim(row.original, minPoss, formatNumber(row.original.sfl, 0)) },
    { id: 'ast', header: 'Ast', accessorKey: 'matchup_ast', ...num, cell: ({ row }) => dim(row.original, minPoss, formatNumber(row.original.matchup_ast, 0)) },
    { id: 'tov', header: 'Tov', accessorKey: 'matchup_tov', ...num, cell: ({ row }) => dim(row.original, minPoss, formatNumber(row.original.matchup_tov, 0)) },
    { id: 'blk', header: 'Blk', accessorKey: 'matchup_blk', ...num, cell: ({ row }) => dim(row.original, minPoss, formatNumber(row.original.matchup_blk, 0)) },
  ], [view, minPoss])

  const exportCsv = () => {
    const out = rows.map((r) => ({
      opponent: opponentOf(r, view).name, position: opponentOf(r, view).position, qualifies: isQualifying(r, minPoss),
      gp: r.gp, partial_poss: r.partial_poss, matchup_min: r.matchup_min, player_pts: r.player_pts, pts_per_poss: r.pts_per_poss,
      matchup_fga: r.matchup_fga, matchup_fgm: r.matchup_fgm, fg_pct: r.fg_pct, fg_pct_shrunk: r.fg_pct_shrunk, ci_low: r.ci_low, ci_high: r.ci_high,
      matchup_fg3a: r.matchup_fg3a, matchup_fg3m: r.matchup_fg3m, fg3_pct: r.fg3_pct, matchup_fta: r.matchup_fta, matchup_ftm: r.matchup_ftm, sfl: r.sfl,
      matchup_ast: r.matchup_ast, matchup_tov: r.matchup_tov, matchup_blk: r.matchup_blk, team_pts: r.team_pts, team_pts_per_poss: r.team_pts_per_poss, season: r.season,
    }))
    downloadCsv(csvName, out)
  }

  return (
    <DataTable<MatchupRow>
      data={rows}
      columns={columns}
      rowKey={(r) => `${r.off_player_id}:${r.def_player_id}`}
      onRowClick={onSelectRow}
      isSelected={(r) => opponentOf(r, view).id === selectedOpponentId}
      initialSort={[{ id: 'poss', desc: true }]}
      height={440}
      dense
      emptyMessage="No matchups for this player in this season."
      toolbar={
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
          <span>{rows.length} matchups · rows below {minPoss} partial possessions are greyed and excluded from callouts · click a row for pair detail</span>
          <Button size="sm" onClick={exportCsv} disabled={!rows.length}>Download CSV</Button>
        </div>
      }
    />
  )
}
