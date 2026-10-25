import { Button, LinkButton, PlayerIdentity } from '@/components/ui'
import { metricLabelWithNorm } from '@/lib/format'
import type { Metric, Normalization, PlayerRow } from '@/lib/types'
import { formatWithUnit } from './helpers'

export interface SelectionStripProps {
  row: PlayerRow | null
  season: string
  getMetric: (key: string) => Metric | undefined
  normalization: Normalization
  x: string
  y: string
  inCompare: boolean
  compareFull: boolean
  onToggleCompare: (row: PlayerRow) => void
  onClear: () => void
}

/** The act half of select-then-act: who is selected, its plotted values, and the two things you can do with it. */
export function SelectionStrip({ row, season, getMetric, normalization, x, y, inCompare, compareFull, onToggleCompare, onClear }: SelectionStripProps) {
  if (!row) {
    return <p className="text-xs text-ink-3">Click a marker or a table row to select a player.</p>
  }
  const value = (key: string) => `${formatWithUnit(row[key], getMetric(key))} ${metricLabelWithNorm(getMetric(key), key, normalization)}`
  const blocked = !inCompare && compareFull
  return (
    <div data-testid="explorer-selection" role="region" aria-label="Selected player" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-control)] border border-line bg-raised px-3 py-2">
      <PlayerIdentity playerId={row.player_id} name={row.full_name} team={row.team_abbreviation} teamId={row.team_id} position={row.position ?? undefined} size="sm" link={false} />
      <p className="min-w-0 flex-1 text-xs text-ink-2 tnum">
        {value(x)} · {value(y)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={inCompare ? 'default' : 'primary'}
          disabled={blocked}
          title={blocked ? 'Comparison group is full (6)' : undefined}
          onClick={() => onToggleCompare(row)}
        >
          {inCompare ? 'Remove from compare' : 'Add to compare'}
        </Button>
        <LinkButton size="sm" to={`/players/${row.player_id}?season=${encodeURIComponent(season)}`}>Open profile →</LinkButton>
        <Button size="sm" variant="ghost" onClick={onClear} aria-label="Clear selection">×</Button>
      </div>
    </div>
  )
}
