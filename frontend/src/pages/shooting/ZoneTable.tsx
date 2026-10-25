import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { ZoneSummary } from '@/lib/types'
import { formatPct } from '@/lib/format'
import { DataTable } from '@/components/table/DataTable'
import { Badge } from '@/components/ui'
import { formatMetricValue } from '@/components/court/colour'
import { zoneLabel } from '@/components/court/geometry'
import type { CourtSelection } from '@/components/court/types'

export type ZoneRow = ZoneSummary & { subject: string }
const numeric = { meta: { numeric: true } }

export function ZoneTable({ rows, showSubject, threshold, selected, onSelect }: { rows: ZoneRow[]; showSubject: boolean; threshold: number; selected: CourtSelection | null; onSelect: (s: CourtSelection | null) => void }) {
  const columns = useMemo<ColumnDef<ZoneRow, unknown>[]>(() => [
    ...(showSubject ? [{ id: 'subject', header: 'Subject', accessorKey: 'subject' } as ColumnDef<ZoneRow, unknown>] : []),
    { id: 'zone', header: 'Zone', accessorFn: (r) => zoneLabel(r.zone) },
    { id: 'fga', header: 'FGA', accessorKey: 'fga', ...numeric },
    { id: 'frequency', header: 'Share', accessorKey: 'frequency', cell: (c) => formatPct(c.getValue<number>()), ...numeric },
    { id: 'fgm', header: 'FGM', accessorKey: 'fgm', ...numeric },
    { id: 'fg_pct', header: 'FG%', accessorKey: 'fg_pct', cell: (c) => formatPct(c.getValue<number | null>()), ...numeric },
    { id: 'league_fg_pct', header: 'League FG%', accessorKey: 'league_fg_pct', cell: (c) => formatPct(c.getValue<number | null>()), ...numeric },
    { id: 'rel_fg_pct', header: 'Rel FG%', accessorKey: 'rel_fg_pct', cell: (c) => formatMetricValue('rel_fg_pct', c.getValue<number | null>()), ...numeric },
    { id: 'pts_per_fga', header: 'Pts per FGA', accessorKey: 'pts_per_fga', cell: (c) => formatMetricValue('pts_per_fga', c.getValue<number | null>()), ...numeric },
    { id: 'ci', header: '95% interval', accessorFn: (r) => r.ci_low, cell: (c) => { const r = c.row.original; return r.ci_low === null || r.ci_high === null ? '–' : `${formatPct(r.ci_low, 0)}–${formatPct(r.ci_high, 0)}` }, ...numeric },
    { id: 'low', header: 'Sample', accessorFn: (r) => r.fga < threshold, cell: (c) => (c.getValue<boolean>() ? <Badge tone="warning">Low</Badge> : <span className="text-ink-3">OK</span>) },
  ], [showSubject, threshold])
  return (
    <DataTable
      data={rows}
      columns={columns}
      rowKey={(r) => `${r.subject}:${r.zone}`}
      dense
      height={360}
      initialSort={[{ id: 'fga', desc: true }]}
      onRowClick={(r) => onSelect(selected?.kind === 'zone' && selected.zone === r.zone ? null : { kind: 'zone', zone: r.zone })}
      isSelected={(r) => selected?.kind === 'zone' && selected.zone === r.zone}
      emptyMessage="No zone summaries for these filters."
    />
  )
}
