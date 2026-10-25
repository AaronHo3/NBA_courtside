import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/table/DataTable'
import { Badge, Button, Info, Input, PlayerIdentity } from '@/components/ui'
import { MetricLabel } from '@/components/ui/MetricLabel'
import { formatMetric } from '@/lib/format'
import type { Metric, Normalization, PlayerRow } from '@/lib/types'
import { formatWithUnit, isLowSample, tableMetricKeys } from './helpers'

export interface ExplorerTableProps {
  rows: PlayerRow[]
  getMetric: (key: string) => Metric | undefined
  normalization: Normalization
  activeMetrics: string[]
  selectedId: number | null
  hoveredId?: number | null
  onRowHover?: (id: number | null) => void
  compareIds: number[]
  compareFull: boolean
  minGp: number
  minMinutes: number
  textFilter: string
  onTextFilter: (v: string) => void
  onRowClick: (row: PlayerRow) => void
  onToggleCompare: (row: PlayerRow) => void
}

const TOT_NOTE = 'TOT pools every stint of a player traded during the season into one row; team-dependent figures (ratings, on/off) are minute-weighted or unavailable.'

/** The linked table under the chart. Selection and the comparison group are shared with the chart. */
export function ExplorerTable(props: ExplorerTableProps) {
  const { rows, getMetric, normalization, activeMetrics, selectedId, hoveredId = null, onRowHover, compareIds, compareFull, minGp, minMinutes, textFilter, onTextFilter, onRowClick, onToggleCompare } = props
  const metricKeys = useMemo(() => tableMetricKeys(activeMetrics), [activeMetrics])

  const columns = useMemo<ColumnDef<PlayerRow, unknown>[]>(() => {
    const num = (key: string, header?: React.ReactNode): ColumnDef<PlayerRow, unknown> => ({
      id: key,
      accessorFn: (r) => (typeof r[key] === 'number' ? (r[key] as number) : null),
      header: () => header ?? <MetricLabel metric={key} normalization={normalization} />,
      cell: (c) => formatWithUnit(c.getValue(), getMetric(key)),
      meta: { numeric: true },
      sortUndefined: 'last',
      sortingFn: 'basic',
    })
    return [
      {
        id: 'compare',
        header: () => <span className="sr-only">Compare</span>,
        enableSorting: false,
        cell: (c) => {
          const r = c.row.original
          const inGroup = compareIds.includes(r.player_id)
          return (
            <Button
              size="sm"
              variant={inGroup ? 'primary' : 'ghost'}
              aria-pressed={inGroup}
              aria-label={inGroup ? `Remove ${r.full_name} from comparison` : `Add ${r.full_name} to comparison`}
              disabled={!inGroup && compareFull}
              title={!inGroup && compareFull ? 'Comparison group is full (6)' : undefined}
              onClick={(e) => { e.stopPropagation(); onToggleCompare(r) }}
            >
              {inGroup ? '✓' : '+'}
            </Button>
          )
        },
      },
      {
        id: 'full_name',
        accessorKey: 'full_name',
        header: 'Player',
        cell: (c) => {
          const r = c.row.original
          const low = isLowSample(r, minGp, minMinutes)
          return (
            <span className="inline-flex items-center gap-1.5">
              <PlayerIdentity playerId={r.player_id} name={r.full_name} team={r.team_abbreviation} teamId={r.team_id} size="xs" link={false} />
              {low && <Badge tone="warning">low sample</Badge>}
            </span>
          )
        },
      },
      {
        id: 'team',
        accessorFn: (r) => r.team_abbreviation ?? '',
        header: 'Team',
        cell: (c) => {
          const r = c.row.original
          if (!r.is_aggregate) return r.team_abbreviation ?? '–'
          return (
            <span className="inline-flex items-center gap-1">
              <Badge tone="neutral">TOT</Badge>
              <Info text={TOT_NOTE} />
            </span>
          )
        },
      },
      { id: 'position', accessorFn: (r) => r.position ?? '', header: 'Pos', cell: (c) => (c.getValue() as string) || '–' },
      num('age'),
      num('gp'),
      num('min'),
      ...metricKeys.map((k) => num(k)),
    ]
  }, [metricKeys, normalization, getMetric, compareIds, compareFull, minGp, minMinutes, onToggleCompare])

  return (
    <DataTable<PlayerRow>
      data={rows}
      columns={columns}
      rowKey={(r) => r.player_id}
      onRowClick={onRowClick}
      isSelected={(r) => r.player_id === selectedId}
      isHighlighted={(r) => r.player_id === hoveredId || compareIds.includes(r.player_id)}
      onRowHover={onRowHover ? (r) => onRowHover(r ? r.player_id : null) : undefined}
      globalFilter={textFilter}
      height={520}
      initialSort={[{ id: activeMetrics[1] && activeMetrics[1] !== 'none' ? activeMetrics[1] : 'pts', desc: true }]}
      dense
      emptyMessage="No rows match the table filter."
      toolbar={
        <div className="flex flex-wrap items-end justify-between gap-2">
          <Input label="Filter table" type="search" placeholder="Name, team or position" value={textFilter} onChange={(e) => onTextFilter(e.target.value)} className="w-56" />
          <p className="text-xs text-ink-3">
            Click a row to highlight it on the chart; click it again to open the profile. {formatMetric(rows.length)} rows.
          </p>
        </div>
      }
    />
  )
}
