import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { ZoneSummary } from '@/lib/types'
import { formatPct } from '@/lib/format'
import { DataTable } from '@/components/table/DataTable'
import { Badge } from '@/components/ui'
import { formatMetricValue } from '@/components/court/colour'
import { zoneLabel } from '@/components/court/geometry'
import type { CourtSelection } from '@/components/court/types'

export type ZoneRow = ZoneSummary & { subject: string; side?: 'A' | 'B' }
const numeric = { meta: { numeric: true } }

type Props = {
  rows: ZoneRow[]
  showSubject: boolean
  threshold: number
  selected: CourtSelection | null
  onSelect: (s: CourtSelection | null) => void
  /** Hover linkage to the court: the zone under the pointer, null on leave. */
  onHoverZone?: (zone: string | null) => void
  /** Zone containing the selected hex, shown as a highlighted row. */
  highlightZone?: string | null
  /** Five columns sized for a 360px side column: zone, FGA, FG%, 95% interval, relative FG%. */
  compact?: boolean
}

const interval = (r: ZoneSummary) => (r.ci_low === null || r.ci_high === null ? '–' : `${formatPct(r.ci_low, 0)}–${formatPct(r.ci_high, 0)}`)

function fullColumns(showSubject: boolean, threshold: number): ColumnDef<ZoneRow, unknown>[] {
  return [
    ...(showSubject ? [{ id: 'subject', header: 'Subject', accessorKey: 'subject' } as ColumnDef<ZoneRow, unknown>] : []),
    { id: 'zone', header: 'Zone', accessorFn: (r) => zoneLabel(r.zone) },
    { id: 'fga', header: 'FGA', accessorKey: 'fga', ...numeric },
    { id: 'frequency', header: 'Share', accessorKey: 'frequency', cell: (c) => formatPct(c.getValue<number>()), ...numeric },
    { id: 'fgm', header: 'FGM', accessorKey: 'fgm', ...numeric },
    { id: 'fg_pct', header: 'FG%', accessorKey: 'fg_pct', cell: (c) => formatPct(c.getValue<number | null>()), ...numeric },
    { id: 'league_fg_pct', header: 'League FG%', accessorKey: 'league_fg_pct', cell: (c) => formatPct(c.getValue<number | null>()), ...numeric },
    { id: 'rel_fg_pct', header: 'Rel FG%', accessorKey: 'rel_fg_pct', cell: (c) => formatMetricValue('rel_fg_pct', c.getValue<number | null>()), ...numeric },
    { id: 'pts_per_fga', header: 'Pts per FGA', accessorKey: 'pts_per_fga', cell: (c) => formatMetricValue('pts_per_fga', c.getValue<number | null>()), ...numeric },
    { id: 'ci', header: '95% interval', accessorFn: (r) => r.ci_low, cell: (c) => interval(c.row.original), ...numeric },
    { id: 'low', header: 'Sample', accessorFn: (r) => r.fga < threshold, cell: (c) => (c.getValue<boolean>() ? <Badge tone="warning">Low</Badge> : <span className="text-ink-3">OK</span>) },
  ]
}

function compactColumns(showSubject: boolean, threshold: number): ColumnDef<ZoneRow, unknown>[] {
  return [
    {
      id: 'zone', header: 'Zone', accessorFn: (r) => zoneLabel(r.zone),
      cell: (c) => {
        const r = c.row.original
        return (
          <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            {showSubject && r.side && <span className="text-ink-3">{r.side}</span>}
            <span>{zoneLabel(r.zone)}</span>
            {r.fga < threshold && <span className="text-meta text-warning" title={`Fewer than ${threshold} attempts`}>low</span>}
          </span>
        )
      },
    },
    { id: 'fga', header: 'FGA', accessorKey: 'fga', cell: (c) => <span className="tnum">{c.getValue<number>().toLocaleString()}</span>, ...numeric },
    { id: 'fg_pct', header: 'FG%', accessorKey: 'fg_pct', cell: (c) => <span className="tnum">{formatPct(c.getValue<number | null>())}</span>, ...numeric },
    { id: 'ci', header: '95% CI', accessorFn: (r) => r.ci_low, cell: (c) => <span className="tnum text-ink-2">{interval(c.row.original).replace(/%/g, '')}</span>, ...numeric },
    { id: 'rel_fg_pct', header: 'vs lg', accessorKey: 'rel_fg_pct', cell: (c) => <span className="tnum">{formatMetricValue('rel_fg_pct', c.getValue<number | null>()).replace(' pts', '')}</span>, ...numeric },
  ]
}

export function ZoneTable({ rows, showSubject, threshold, selected, onSelect, onHoverZone, highlightZone, compact = false }: Props) {
  const columns = useMemo(() => (compact ? compactColumns(showSubject, threshold) : fullColumns(showSubject, threshold)), [compact, showSubject, threshold])
  return (
    <DataTable
      data={rows}
      columns={columns}
      rowKey={(r) => `${r.subject}:${r.zone}`}
      dense
      maxHeight={compact ? 300 : 360}
      initialSort={[{ id: 'fga', desc: true }]}
      onRowClick={(r) => onSelect(selected?.kind === 'zone' && selected.zone === r.zone ? null : { kind: 'zone', zone: r.zone })}
      onRowHover={onHoverZone ? (r) => onHoverZone(r ? r.zone : null) : undefined}
      isSelected={(r) => selected?.kind === 'zone' && selected.zone === r.zone}
      isHighlighted={highlightZone ? (r) => r.zone === highlightZone : undefined}
      emptyMessage="No zone summaries for these filters."
    />
  )
}
