import { Link } from 'react-router-dom'
import { PlayerSearch } from '@/components/PlayerSearch'
import { Button, PlayerIdentity } from '@/components/ui'
import type { PlayerSearchHit } from '@/lib/types'
import { MAX_COMPARE } from '@/store/compare'
import type { ComparedPlayer } from './model'

type Props = {
  players: ComparedPlayer[]
  colors: string[]
  onAdd: (p: PlayerSearchHit) => void
  onRemove: (id: number) => void
  onClear: () => void
  overflow: number
}

export function RosterStrip({ players, colors, onAdd, onRemove, onClear, overflow }: Props) {
  const full = players.length >= MAX_COMPARE
  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2" aria-label="Players in this comparison">
        {players.map((p, i) => (
          <span key={p.id} className="pop-in inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface py-1 pl-1 pr-1.5 text-sm" style={{ boxShadow: `inset 0 0 0 1px ${colors[i]}33` }}>
            <PlayerIdentity playerId={p.id} name={p.name} team={p.team} position={p.position} size="sm" link={false} />
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colors[i] }} title="Colour on every chart" />
            <Link to={`/players/${p.id}`} className="sr-only">Open {p.name}</Link>
            <button type="button" aria-label={`Remove ${p.name} from comparison`} onClick={() => onRemove(p.id)} className="t-fast inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-3 hover:bg-accent-soft hover:text-critical">×</button>
          </span>
        ))}
        <div className="w-full max-w-xs sm:w-56">
          <PlayerSearch placeholder={full ? 'Comparison is full' : 'Add a player'} onSelect={onAdd} inputId="compare-add-player" />
        </div>
        {players.length > 0 && <Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>}
      </div>
      {full && <p role="status" className="text-xs text-warning">Comparison is full ({MAX_COMPARE} players). Remove one to add another.</p>}
      {overflow > 0 && <p role="status" className="text-xs text-warning">The link carried more than {MAX_COMPARE} players; the first {MAX_COMPARE} are shown and {overflow} dropped.</p>}
    </div>
  )
}
