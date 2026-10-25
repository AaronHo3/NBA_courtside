import { initials } from './math'
import type { ComparedPlayer } from './model'

/** Colour key shared by every chart on the page: slot i is always player i in comparison order. */
export function PlayerLegend({ players, colors, showInitials }: { players: ComparedPlayer[]; colors: string[]; showInitials?: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2" aria-label="Players and colours">
      {players.map((p, i) => (
        <li key={p.id} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colors[i] }} />
          <span className="text-ink">{p.name}</span>
          {showInitials && <span className="text-ink-3">({initials(p.name)})</span>}
          {!p.hasSeason && <span className="text-warning">no data this season</span>}
        </li>
      ))}
    </ul>
  )
}
