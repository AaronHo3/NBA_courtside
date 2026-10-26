import type { ReactNode } from 'react'
import { Link, useInRouterContext } from 'react-router-dom'
import type { CategoryDef, PerformerRow } from '../../api/types'
import { categoryLabel, fmtNum, fmtSigned, positionsText } from '../../lib/format'
import { teamColor } from '../../lib/teamColors'
import { Portrait } from './Portrait'

/** Where the research profile's "Back to …" link returns: this screen with its team and week. */
export interface BackLink {
  href: string
  label: string
}

interface NbaProfileLinkProps {
  nbaId: number | null | undefined
  className?: string
  /** Router state the profile reads for its back link; browser Back also returns here (the hash keeps team/week). */
  back?: BackLink
}

/** Link to the NBA research profile when the copilot knows the NBA id (demo players have none). */
export function NbaProfileLink({ nbaId, className, back }: NbaProfileLinkProps) {
  const inRouter = useInRouterContext()
  if (nbaId == null) return null
  const cls = className ?? 'nba-link'
  const title = 'Open the NBA research profile (Back returns here)'
  if (!inRouter) {
    return (
      <a href={`/players/${nbaId}`} className={cls} title={title}>
        NBA profile →
      </a>
    )
  }
  return (
    <Link to={`/players/${nbaId}`} state={back ? { from: back } : undefined} className={cls} title={title}>
      NBA profile →
    </Link>
  )
}

/** "n GP · small sample", kept next to the number it qualifies. */
export function SampleTag({ row }: { row: PerformerRow }) {
  if (!row.flags.includes('small sample')) return null
  return (
    <span className="sample-tag" data-testid="sample-tag" title="Few games counted: treat this number as noisy">
      {row.games} GP · small sample
    </span>
  )
}

interface FeatureCardProps {
  title: string
  row: PerformerRow | undefined
  metric: 'contribution' | 'over_expected'
  perGame: boolean
  categories: CategoryDef[]
  selected: boolean
  onSelect: (id: string) => void
  testId?: string
  /** Back-link for the NBA profile. */
  back?: BackLink
  /** One line under the headline, e.g. why a different player is featured. */
  note?: ReactNode
}

/** The #1 row of a leaderboard, featured: portrait, headline numeral, expected vs actual, category mini bars. */
export function FeatureCard({ title, row, metric, perGame, categories, selected, onSelect, testId, back, note }: FeatureCardProps) {
  if (!row) {
    return (
      <section className="feature-card empty" aria-label={title} data-testid={testId}>
        <h3>{title}</h3>
        <p className="muted">No qualifying player.</p>
      </section>
    )
  }
  const color = teamColor(row.player.team)
  const unit = perGame ? 'units / game' : 'units'
  const contribution = perGame ? row.contribution_per_game : row.contribution
  const over = perGame ? row.over_expected_per_game : row.over_expected
  const expected = row.expected_contribution === null ? null : perGame && row.games ? row.expected_contribution / row.games : row.expected_contribution
  const headline = metric === 'contribution' ? fmtNum(contribution, 1) : fmtSigned(over, 1)
  const otherFlags = row.flags.filter((f) => f !== 'small sample')
  const maxCat = Math.max(1e-9, ...categories.map((c) => Math.abs(row.contribution_by_category[c.key] ?? 0)))
  return (
    <section className={`feature-card${selected ? ' selected' : ''}`} aria-label={title} data-testid={testId} style={{ borderLeftColor: color.primary }}>
      <div className="feature-head">
        <h3>{title}</h3>
        <NbaProfileLink nbaId={row.player.nba_id} back={back} />
      </div>
      <button type="button" className="feature-body" onClick={() => onSelect(row.player.player_id)} aria-pressed={selected} aria-label={`${row.player.name}: ${headline} ${unit}`}>
        <Portrait name={row.player.name} espnId={row.player.espn_id} team={row.player.team} size={64} />
        <span className="feature-who">
          <b>{row.player.name}</b>
          <span className="muted">
            {row.player.team ?? 'FA'} · {positionsText(row.player.eligible_positions)} · {row.games} GP
            {otherFlags.length ? ` · ${otherFlags.join(', ')}` : ''}
          </span>
          <span className="feature-sub muted">
            {metric === 'contribution'
              ? expected === null ? 'no projection baseline' : <>expected {fmtNum(expected, 1)} · <span className={(over ?? 0) >= 0 ? 'pos' : 'neg'}>{fmtSigned(over, 1)}</span> vs expected</>
              : expected === null ? 'no projection baseline' : <>{fmtNum(contribution, 1)} actual vs {fmtNum(expected, 1)} expected</>}
          </span>
        </span>
        <span className={`feature-value${metric === 'over_expected' ? ((over ?? 0) >= 0 ? ' pos' : ' neg') : ''}`}>
          <b>{headline}</b>
          <span className="muted">{unit}</span>
          <SampleTag row={row} />
        </span>
      </button>
      {note && <p className="feature-note muted">{note}</p>}
      <ul className="feature-cats" aria-label="Contribution by category">
        {categories.map((c) => {
          const v = row.contribution_by_category[c.key] ?? 0
          return (
            <li key={c.key} title={`${categoryLabel(c.key, categories)}: ${fmtSigned(v, 1)} units${c.higher_is_better ? '' : ' (lower is better)'}`}>
              <span className="cat-key">{categoryLabel(c.key, categories)}</span>
              <span className="cat-bar" aria-hidden="true">
                <span className={`cat-fill ${v >= 0 ? 'pos' : 'neg'}`} style={{ width: `${(Math.abs(v) / maxCat) * 100}%` }} />
              </span>
              <span className="cat-val">{fmtSigned(v, 1)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
