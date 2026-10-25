import { clsx } from 'clsx'
import type { HexBin, ZoneSummary } from '@/lib/types'
import { formatPct, wilsonText } from '@/lib/format'
import { Badge, Button, Stat } from '@/components/ui'
import { formatMetricValue } from '@/components/court/colour'
import { zoneLabel } from '@/components/court/geometry'
import type { CourtSelection } from '@/components/court/types'

type Cell = HexBin | ZoneSummary

/** Stat row for the selected hex or zone. */
type Props = {
  selection: CourtSelection
  cells: Array<{ label: string; cell: Cell | null }>
  threshold: number
  onClear: () => void
  /** Two-column stat grid for a narrow side column. */
  compact?: boolean
}

export function BinDetail({ selection, cells, threshold, onClear, compact = false }: Props) {
  const where = selection.kind === 'hex' ? `Hex (q ${selection.q}, r ${selection.r})` : zoneLabel(selection.zone)
  return (
    <div className="flex flex-col gap-3" data-testid="bin-detail">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">Selected: {where}</span>
        {selection.kind === 'hex' && cells[0]?.cell && 'zone' in cells[0].cell && <span className="text-xs text-ink-3">in {zoneLabel(cells[0].cell.zone)}</span>}
        <Button size="sm" variant="ghost" onClick={onClear}>Clear selection</Button>
      </div>
      {cells.map(({ label, cell }) => (
        <div key={label} className="flex flex-col gap-1">
          {cells.length > 1 && <span className="text-xs text-ink-3">{label}</span>}
          {!cell ? (
            <p className="text-sm text-ink-2">No attempts here.</p>
          ) : (
            <div className={clsx('grid grid-cols-2 gap-x-6 gap-y-3', !compact && 'sm:grid-cols-4 lg:grid-cols-8')}>
              <Stat label="Attempts" value={cell.fga} />
              <Stat label="Makes" value={cell.fgm} />
              <Stat label="FG%" value={formatPct(cell.fg_pct)} />
              <Stat label="Wilson 95% interval" value={<span className="text-base">{cell.ci_low !== null && cell.ci_high !== null ? `${formatPct(cell.ci_low, 0)}–${formatPct(cell.ci_high, 0)}` : '–'}</span>} sub={wilsonText(cell.ci_low, cell.ci_high) ? 'score interval' : undefined} />
              <Stat label="League FG% (zone)" value={formatPct(cell.league_fg_pct)} sub={zoneLabel(cell.zone)} />
              <Stat label="Relative FG%" value={formatMetricValue('rel_fg_pct', cell.rel_fg_pct)} />
              <Stat label="Points per FGA" value={formatMetricValue('pts_per_fga', cell.pts_per_fga)} sub="field goals only" />
              <Stat label="Sample" value={cell.fga < threshold ? <Badge tone="warning">Low sample</Badge> : <Badge tone="good">OK</Badge>} sub={`threshold ${threshold} FGA`} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
