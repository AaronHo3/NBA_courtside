import { Link } from 'react-router-dom'
import type { PerformerRow } from '@/fantasy/api/types'
import { Delta, PlayerIdentity, StatTile } from '@/components/ui'
import { nbaIdOf } from '@/lib/fantasyBridge'

const espnHeadshot = (id?: number | null) => (id ? `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png` : null)

/** One performer, featured. Contribution is in copilot units (category standard deviations × games), from ESPN-counted box scores. */
export function FeatureCard({ title, row, metric, href, perGame = false }: { title: string; row: PerformerRow | undefined; metric: 'contribution' | 'over_expected'; href: string; perGame?: boolean }) {
  return (
    <section className="rise-in flex flex-col gap-3 rounded-[var(--radius-panel)] border border-line bg-surface p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{title}</h2>
        <Link to={href} className="text-xs text-accent hover:underline">All performers →</Link>
      </header>
      {!row ? (
        <p className="text-sm text-ink-3">Nothing counted yet this week.</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <PlayerIdentity playerId={nbaIdOf(row.player)} name={row.player.name} team={row.player.team} position={row.player.primary_position} src={espnHeadshot(row.player.espn_id) ?? undefined} size="lg" meta={<span className="tnum">{row.games} GP{row.flags.includes('small_sample') ? ' · small sample' : ''}</span>} />
          {metric === 'contribution' ? (
            <StatTile label={perGame ? 'Contribution / game' : 'Contribution'} value={(perGame ? row.contribution_per_game : row.contribution)?.toFixed(1) ?? '—'} sub={row.expected_contribution != null ? <>expected {row.expected_contribution.toFixed(1)} · <Delta value={row.over_expected} /></> : 'no projection baseline'} tone="accent" />
          ) : (
            <StatTile label="Over expectation" value={<Delta value={row.over_expected} />} sub={row.expected_contribution != null ? `${row.contribution.toFixed(1)} actual vs ${row.expected_contribution.toFixed(1)} expected` : 'no projection baseline'} />
          )}
        </div>
      )}
    </section>
  )
}
