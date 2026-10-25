import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/table/DataTable'
import { Badge, Panel } from '@/components/ui'
import { useMetricIndex } from '@/hooks/useApi'
import { formatNumber } from '@/lib/format'
import type { RankingMeta, RankingRow } from '@/lib/types'

/** Players who met the thresholds but lack a component. They are never silently re-weighted. */
export function IneligiblePanel({ rows, meta }: { rows: RankingRow[]; meta: RankingMeta }) {
  const { get } = useMetricIndex()
  const counting = meta.normalization_of_counting_stats
  const columns = useMemo<ColumnDef<RankingRow, unknown>[]>(() => [
    { id: 'player', header: 'Player', accessorKey: 'full_name' },
    { id: 'team', header: 'Team', accessorFn: (r) => r.team_abbreviation ?? '', cell: (c) => c.getValue<string>() || '–' },
    { id: 'pos', header: 'Pos', accessorFn: (r) => r.position ?? '', cell: (c) => c.getValue<string>() || '–' },
    { id: 'gp', header: 'GP', accessorFn: (r) => r.gp ?? 0, cell: (c) => formatNumber(c.row.original.gp, 0), meta: { numeric: true } },
    { id: 'min', header: counting === 'totals' ? 'MIN' : 'MIN / game', accessorFn: (r) => r.min ?? 0, cell: (c) => formatNumber(c.row.original.min, counting === 'totals' ? 0 : 1), meta: { numeric: true } },
    {
      id: 'missing',
      header: 'Missing components',
      accessorFn: (r) => r.missing.join(', '),
      cell: (c) => (
        <span className="inline-flex flex-wrap gap-1">
          {c.row.original.missing.map((m) => <Badge key={m} tone="warning">{get(m)?.label ?? m}</Badge>)}
        </span>
      ),
    },
  ], [counting, get])

  return (
    <Panel
      question={`Who met the thresholds but cannot be scored? (${rows.length})`}
      method="Players missing any component are excluded rather than scored on the components they have. Lowering the thresholds does not help here; the gap is in the data."
    >
      {rows.length === 0 ? (
        <p className="text-sm text-ink-2">Every player who met the thresholds has all components, so nobody was excluded.</p>
      ) : (
        <DataTable data={rows} columns={columns} rowKey={(r) => r.player_id} height={320} dense initialSort={[{ id: 'min', desc: true }]} />
      )}
    </Panel>
  )
}
