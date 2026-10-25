import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/table/DataTable'
import { Button } from '@/components/ui'
import { clockLabel, eventTitle, periodLabel } from '@/components/evidence/helpers'
import type { GameEvent, PageMeta } from '@/lib/types'

const numeric = { meta: { numeric: true } }

export function EventTable({ events, meta, selectedId, onSelect, onPage }: { events: GameEvent[]; meta: PageMeta | undefined; selectedId: number | null; onSelect: (e: GameEvent) => void; onPage: (offset: number) => void }) {
  const columns = useMemo<ColumnDef<GameEvent, unknown>[]>(() => [
    { id: 'n', header: '#', accessorKey: 'source_event_id', cell: (c) => <span className={c.row.original.duplicate_of !== null ? 'text-ink-3' : undefined}>{c.getValue<number>()}{c.row.original.duplicate_of !== null ? ' (dup)' : ''}</span>, ...numeric },
    { id: 'period', header: 'Period', accessorFn: (e) => e.period ?? 0, cell: (c) => periodLabel(c.row.original.period), ...numeric },
    { id: 'clock', header: 'Clock', accessorFn: (e) => -(e.clock_ms ?? 0), cell: (c) => clockLabel(c.row.original.clock_ms), ...numeric },
    { id: 'what', header: 'Event', accessorFn: (e) => eventTitle(e) },
    { id: 'type', header: 'Type', accessorFn: (e) => e.action_type ?? '' },
    { id: 'score', header: 'Score', accessorFn: (e) => (e.score_home !== null && e.score_away !== null ? `${e.score_away}–${e.score_home}` : ''), ...numeric },
    { id: 'video', header: 'Provider flag', accessorFn: (e) => (e.video_available ? 'video' : ''), cell: (c) => <span className="text-ink-3">{c.getValue<string>()}</span> },
  ], [])
  const offset = meta?.offset ?? 0
  const limit = meta?.limit ?? 100
  const total = meta?.total ?? events.length
  return (
    <DataTable
      data={events}
      columns={columns}
      rowKey={(e) => `${e.source_event_system}:${e.source_event_id}:${e.source_order}`}
      onRowClick={onSelect}
      isSelected={(e) => e.source_event_id === selectedId}
      dense
      maxHeight={520}
      pinFirstColumn
      initialSort={[]}
      toolbar={
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
          <span className="tnum">{total ? `${offset + 1}–${Math.min(offset + limit, total)} of ${total.toLocaleString()} events` : 'No events'}</span>
          <div className="flex gap-1">
            <Button size="sm" onClick={() => onPage(Math.max(0, offset - limit))} disabled={offset === 0}>Previous</Button>
            <Button size="sm" onClick={() => onPage(offset + limit)} disabled={offset + limit >= total}>Next</Button>
          </div>
        </div>
      }
      emptyMessage={meta?.coverage ?? 'No events match.'}
    />
  )
}
