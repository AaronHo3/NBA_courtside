import { Badge, Button } from '@/components/ui'
import { formatPct, wilsonText } from '@/lib/format'
import type { MatchupRow } from '@/lib/types'
import { formatPpp, isLowSample, opponentOf, shrinkageText, type MatchupView } from './helpers'

type Props = {
  lowest: MatchupRow | null
  highest: MatchupRow | null
  view: MatchupView
  minPoss: number
  qualifyingCount: number
  totalCount: number
  onOpenPair: (row: MatchupRow) => void
}

function Callout({ kind, row, view, minPoss, onOpenPair }: { kind: 'lowest' | 'highest'; row: MatchupRow | null; view: MatchupView; minPoss: number; onOpenPair: (r: MatchupRow) => void }) {
  const heading = kind === 'lowest' ? 'Lowest observed efficiency' : 'Highest observed efficiency'
  const sub = `among qualifying matchups (≥ ${minPoss} poss)`
  if (!row) {
    return (
      <div className="flex flex-col gap-1 rounded-[var(--radius-control)] border border-line p-3">
        <p className="text-xs text-ink-3">{heading} <span className="text-ink-3">{sub}</span></p>
        <p className="text-sm text-ink-2">No matchup reaches the threshold.</p>
      </div>
    )
  }
  const opp = opponentOf(row, view)
  const interval = wilsonText(row.ci_low, row.ci_high)
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[var(--radius-control)] border border-line p-3">
      <p className="text-xs text-ink-3">{heading} <span>{sub}</span></p>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Button variant="ghost" size="sm" className="-ml-2 text-sm font-semibold text-ink" onClick={() => onOpenPair(row)} title="Open pair detail">
          {opp.name}
        </Button>
        {opp.position && <Badge>{opp.position}</Badge>}
        {isLowSample(row) && <Badge tone="warning">low sample</Badge>}
      </div>
      <p className="text-sm text-ink tnum">
        <span className="font-semibold">{formatPpp(row.pts_per_poss)}</span> pts/poss · {formatPpp(row.partial_poss)} poss · {row.player_pts ?? '–'} pts on {row.matchup_fga ?? '–'} FGA
      </p>
      <p className="text-xs text-ink-2 tnum">FG% {shrinkageText(row.fg_pct, row.fg_pct_shrunk)}{row.matchup_fg3a ? ` · 3P% ${formatPct(row.fg3_pct)}` : ''}</p>
      {interval && <p className="text-xs text-ink-3 tnum">Raw FG% interval {interval}</p>}
    </div>
  )
}

/** Two callouts, phrased as observations about qualifying rows, never as a verdict about a player. */
export function CalloutStrip({ lowest, highest, view, minPoss, qualifyingCount, totalCount, onOpenPair }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <Callout kind="lowest" row={lowest} view={view} minPoss={minPoss} onOpenPair={onOpenPair} />
        <Callout kind="highest" row={highest} view={view} minPoss={minPoss} onOpenPair={onOpenPair} />
      </div>
      <p className="text-xs text-ink-3">
        {qualifyingCount} of {totalCount} matchups qualify at ≥ {minPoss} partial possessions. Efficiency is {view === 'offense' ? 'his' : 'the scorer’s'} points per partial possession in the matchup.
      </p>
    </div>
  )
}
