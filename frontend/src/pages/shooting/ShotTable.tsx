import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { Shot } from '@/lib/types'
import { DataTable, downloadCsv } from '@/components/table/DataTable'
import { Button } from '@/components/ui'
import { zoneLabel } from '@/components/court/geometry'

const numeric = { meta: { numeric: true } }
const clock = (s: Shot) => `${s.minutes_remaining}:${String(s.seconds_remaining).padStart(2, '0')}`

export function ShotTable({ shots, teamName, filename, onSelect, selectedKey }: { shots: Shot[]; teamName: (id: number) => string; filename: string; onSelect?: (s: Shot) => void; selectedKey?: string | null }) {
  const columns = useMemo<ColumnDef<Shot, unknown>[]>(() => [
    { id: 'date', header: 'Date', accessorFn: (s) => s.game_date.slice(0, 10) },
    { id: 'opp', header: 'Opponent', accessorFn: (s) => `${s.home ? 'vs' : 'at'} ${teamName(s.opponent_team_id)}` },
    { id: 'period', header: 'Period', accessorKey: 'period', cell: (c) => { const p = c.getValue<number>(); return p > 4 ? `OT${p - 4}` : `Q${p}` }, ...numeric },
    { id: 'clock', header: 'Clock', accessorFn: (s) => s.minutes_remaining * 60 + s.seconds_remaining, cell: (c) => clock(c.row.original), ...numeric },
    { id: 'distance', header: 'Distance (ft)', accessorKey: 'shot_distance', ...numeric },
    { id: 'zone', header: 'Zone', accessorFn: (s) => zoneLabel(s.shot_zone_basic) },
    { id: 'action', header: 'Action', accessorKey: 'action_type' },
    { id: 'type', header: 'Type', accessorFn: (s) => s.shot_type.replace(' Field Goal', '') },
    { id: 'result', header: 'Result', accessorFn: (s) => (s.shot_made_flag ? 'Made' : 'Missed'), cell: (c) => <span className={c.getValue<string>() === 'Made' ? 'text-ink' : 'text-ink-3'}>{c.getValue<string>()}</span> },
  ], [teamName])
  const exportCsv = () => downloadCsv(filename, shots.map((s) => ({
    date: s.game_date.slice(0, 10), opponent: teamName(s.opponent_team_id), home: s.home, period: s.period, clock: clock(s), distance_ft: s.shot_distance,
    zone: s.shot_zone_basic, area: s.shot_zone_area, action: s.action_type, shot_type: s.shot_type, made: s.shot_made_flag, loc_x: s.loc_x, loc_y: s.loc_y, game_id: s.game_id,
  })))
  return (
    <DataTable
      data={shots}
      columns={columns}
      rowKey={(s) => `${s.game_id}-${s.game_event_id}`}
      onRowClick={onSelect}
      isSelected={selectedKey ? (s) => `${s.game_id}:${s.game_event_id}` === selectedKey : undefined}
      dense
      height={420}
      initialSort={[{ id: 'date', desc: true }]}
      toolbar={<div className="flex items-center justify-between gap-2 text-xs text-ink-3"><span className="tnum">{shots.length.toLocaleString()} shots</span><Button size="sm" onClick={exportCsv} disabled={!shots.length}>Export CSV</Button></div>}
      emptyMessage="No shots match the current filters and selection."
    />
  )
}
