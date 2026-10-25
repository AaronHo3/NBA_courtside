import { Badge, Button, Info } from '@/components/ui'
import { formatPct, wilsonText } from '@/lib/format'
import type { MatchupRow } from '@/lib/types'
import { LOW_SAMPLE_FGA, formatPoss, formatPpp, isLowSample, opponentOf, shrinkageText, type MatchupView } from './helpers'

type Props = {
  lowest: MatchupRow | null
  highest: MatchupRow | null
  view: MatchupView
  minPoss: number
  qualifyingCount: number
  totalCount: number
  onOpenPair: (row: MatchupRow) => void
}

type Kind = 'lowest' | 'highest'
const HEADING: Record<Kind, string> = { lowest: 'Lowest observed efficiency', highest: 'Highest observed efficiency' }

function ResultCard({ kind, row, view, minPoss, onOpenPair }: { kind: Kind; row: MatchupRow | null; view: MatchupView; minPoss: number; onOpenPair: (r: MatchupRow) => void }) {
  const info = `points per partial possession among matchups with ≥ ${minPoss} possessions; observations, not verdicts`
  const header = (
    <p className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
      <span>{HEADING[kind]}</span>
      <Info text={info} />
    </p>
  )
  if (!row) {
    return (
      <div className="flex flex-col gap-1 rounded-[var(--radius-control)] border border-line bg-surface p-4" data-testid={`matchup-result-${kind}`}>
        {header}
        <p className="text-sm text-ink-2">No matchup reaches {minPoss} partial possessions.</p>
      </div>
    )
  }
  const opp = opponentOf(row, view)
  const interval = wilsonText(row.ci_low, row.ci_high)
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[var(--radius-control)] border border-line bg-surface p-4" data-testid={`matchup-result-${kind}`}>
      {header}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Button variant="ghost" size="sm" className="-ml-2 text-sm font-semibold text-ink" onClick={() => onOpenPair(row)} title="Open pair detail">
          {opp.name}
        </Button>
        {opp.position && <Badge>{opp.position}</Badge>}
        {isLowSample(row) && <Badge tone="warning">low sample</Badge>}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="flex items-baseline gap-1">
          <span className="display tnum text-[28px] leading-none font-semibold text-ink" data-testid="result-value">{formatPpp(row.pts_per_poss)}</span>
          <span className="text-xs text-ink-2">pts / poss</span>
        </span>
        <span className="tnum text-sm font-medium text-ink" data-testid="result-sample">{formatPoss(row.partial_poss)} poss</span>
        <span className="tnum text-xs text-ink-2">{row.player_pts ?? '–'} pts on {row.matchup_fga ?? '–'} FGA · {row.gp} gp</span>
      </div>
      <p className="tnum text-xs text-ink-2">
        FG% {shrinkageText(row.fg_pct, row.fg_pct_shrunk)}{row.matchup_fg3a ? ` · 3P% ${formatPct(row.fg3_pct)}` : ''}{interval ? ` · raw interval ${interval}` : ''}
      </p>
    </div>
  )
}

/** Result strip: the lowest and highest observed efficiency among qualifying rows, each with its sample beside the value. Never a verdict about a player. */
export function CalloutStrip({ lowest, highest, view, minPoss, qualifyingCount, totalCount, onOpenPair }: Props) {
  return (
    <div className="flex flex-col gap-2" data-testid="matchup-result-strip">
      <div className="grid gap-3 sm:grid-cols-2">
        <ResultCard kind="lowest" row={lowest} view={view} minPoss={minPoss} onOpenPair={onOpenPair} />
        <ResultCard kind="highest" row={highest} view={view} minPoss={minPoss} onOpenPair={onOpenPair} />
      </div>
      <p className="text-xs text-ink-3">
        {qualifyingCount} of {totalCount} matchups qualify at ≥ {minPoss} partial possessions. Efficiency is {view === 'offense' ? 'his' : 'the scorer’s'} points per partial possession in the matchup; “low sample” marks fewer than {LOW_SAMPLE_FGA} FGA.
      </p>
    </div>
  )
}
