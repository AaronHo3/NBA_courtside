import { PlayerSearch } from '@/components/PlayerSearch'
import { Badge, Button, Input, Segmented } from '@/components/ui'
import type { PlayerSearchHit } from '@/lib/types'
import type { MatchupView } from './helpers'

export type SubjectBarProps = {
  playerName: string | null
  playerPosition: string | null
  view: MatchupView
  minPoss: number
  priorStrength: number
  onSelectPlayer: (hit: PlayerSearchHit) => void
  onClearPlayer: () => void
  onViewChange: (v: MatchupView) => void
  onMinPossChange: (n: number) => void
  onPriorStrengthChange: (n: number) => void
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** One row of filters: who, which side of the ball, qualification threshold and shrinkage strength. */
export function SubjectBar(p: SubjectBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-panel)] border border-line bg-surface px-4 py-3">
      <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs text-ink-3 sm:max-w-xs">
        <span>Player</span>
        <PlayerSearch inputId="matchup-player-search" placeholder={p.playerName ?? 'Search a player'} onSelect={p.onSelectPlayer} />
      </label>
      {p.playerName && (
        <div className="flex items-center gap-2 pb-1.5">
          <span className="text-sm font-medium text-ink">{p.playerName}</span>
          {p.playerPosition && <Badge>{p.playerPosition}</Badge>}
          <Button size="sm" variant="ghost" onClick={p.onClearPlayer} aria-label="Clear player">Clear</Button>
        </div>
      )}
      <div className="flex flex-col gap-1 text-xs text-ink-3">
        <span>View</span>
        <Segmented<MatchupView>
          ariaLabel="View"
          value={p.view}
          onChange={p.onViewChange}
          options={[
            { value: 'offense', label: 'As scorer', title: 'Defenders he faced: who limited him, against whom he scored freely' },
            { value: 'defense', label: 'As defender', title: 'Scorers he guarded: whom he limited, who scored on him' },
          ]}
        />
      </div>
      <Input
        label="Min partial poss"
        type="number"
        inputMode="numeric"
        min={1}
        max={500}
        step={1}
        value={p.minPoss}
        onChange={(e) => p.onMinPossChange(clampInt(e.target.value, 1, 500, p.minPoss))}
        className="w-32"
        title="A matchup qualifies when its partial possessions reach this threshold"
      />
      <Input
        label="Prior strength (attempts)"
        type="number"
        inputMode="numeric"
        min={0}
        max={500}
        step={5}
        value={p.priorStrength}
        onChange={(e) => p.onPriorStrengthChange(clampInt(e.target.value, 0, 500, p.priorStrength))}
        className="w-40"
        title="How many league-average attempts the shrunk FG% leans on"
      />
    </div>
  )
}
