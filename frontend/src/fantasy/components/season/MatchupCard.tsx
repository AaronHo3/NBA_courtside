import { useId } from 'react'
import type { CategoryDef, MatchupOddsView, MatchupPairView, WeekResultView, WeekSideView } from '../../api/types'
import { categoryLabel, fmtNum, fmtPct } from '../../lib/format'
import { ProbabilityPair, type PairRow } from '../charts/ProbabilityPair'
import { Disclosure } from '../ui/Disclosure'
import { Tooltip } from '../ui/Tooltip'
import { MatchupActuals } from './MatchupActuals'

interface MatchupCardProps {
  pair: MatchupPairView
  names: Record<string, string>
  categories: CategoryDef[]
  userId: string
  compact?: boolean
  /** ESPN's running totals for this pairing, when the results endpoint has them. */
  actual?: WeekResultView | null
}

/** A category is a toss-up when the favourite's chance prints between 40% and 60%. */
const CLOSE_BAND = [0.4, 0.6] as const
const OUT_NOTE = /: 0 games this week$/
const WINNER_HINT = 'The side that takes more than half the categories in most simulated weeks'

/** Orient the simulated odds so the projected winner is always the left/first side. */
function orient(pair: MatchupPairView, o: MatchupOddsView, names: Record<string, string>) {
  const homeWins = o.p_win_a > o.p_win_b || (o.p_win_a === o.p_win_b && o.expected_a >= o.expected_b)
  const awayId = pair.away_manager_id!
  const name = (id: string) => names[id] ?? id
  return {
    homeWins,
    winnerId: homeWins ? pair.home_manager_id : awayId,
    loserId: homeWins ? awayId : pair.home_manager_id,
    winner: name(homeWins ? pair.home_manager_id : awayId),
    loser: name(homeWins ? awayId : pair.home_manager_id),
    pWin: homeWins ? o.p_win_a : o.p_win_b,
    pLose: homeWins ? o.p_win_b : o.p_win_a,
    expWinner: homeWins ? o.expected_a : o.expected_b,
    expLoser: homeWins ? o.expected_b : o.expected_a,
    modal: homeWins ? [o.modal_score[0], o.modal_score[1]] : [o.modal_score[1], o.modal_score[0]],
    games: homeWins ? [o.games_a, o.games_b] : [o.games_b, o.games_a],
  }
}

function contextLine(games: number[], notes: string[]): string {
  const parts: string[] = []
  if (games[0] || games[1]) parts.push(`Games ${games[0]} · ${games[1]}`)
  const out = notes.filter((n) => OUT_NOTE.test(n)).length
  if (out > 0) parts.push(`${out} player${out === 1 ? '' : 's'} out`)
  return parts.join(' · ')
}

function Title({ pair, names, userId }: { pair: MatchupPairView; names: Record<string, string>; userId: string }) {
  const home = names[pair.home_manager_id] ?? pair.home_manager_id
  const away = pair.away_manager_id ? names[pair.away_manager_id] ?? pair.away_manager_id : null
  return (
    <h3 className="mc-title">
      {home}
      {pair.home_manager_id === userId ? ' (you)' : ''}
      {away && (
        <>
          {' '}
          <span className="muted">vs</span> {away}
          {pair.away_manager_id === userId ? ' (you)' : ''}
        </>
      )}
    </h3>
  )
}

/** One pairing for the week. Compact: a single row for the list. Full: projected outcome, then ESPN actuals. */
export function MatchupCard({ pair, names, categories, userId, compact = false, actual = null }: MatchupCardProps) {
  const projectedId = useId()
  const home = names[pair.home_manager_id] ?? pair.home_manager_id
  const away = pair.away_manager_id ? names[pair.away_manager_id] ?? pair.away_manager_id : null
  const isUser = pair.home_manager_id === userId || pair.away_manager_id === userId
  const cls = `matchup-card${isUser ? ' mine' : ''}${compact ? ' compact' : ''}`
  const testId = isUser ? 'user-matchup' : undefined

  if (!away || !pair.odds) {
    return (
      <article className={cls} data-testid={testId} aria-label={`${home} bye`}>
        <Title pair={pair} names={names} userId={userId} />
        <p className="muted mc-bye">Bye week: no matchup in period {pair.period}.</p>
      </article>
    )
  }

  const o = pair.odds
  const side = orient(pair, o, names)

  if (compact) {
    return (
      <article className={cls} data-testid={testId} aria-label={`${home} vs ${away}`}>
        <Title pair={pair} names={names} userId={userId} />
        <span className="mc-fav" data-testid="projected-winner" title={WINNER_HINT}>
          <span className="mc-k">favourite</span> <b className="mc-name">{side.winner}</b> <b className="mc-p">{fmtPct(side.pWin)}</b>
        </span>
      </article>
    )
  }

  const pickSide = (id: string): WeekSideView | null => (actual ? (actual.home.manager_id === id ? actual.home : actual.away?.manager_id === id ? actual.away : null) : null)
  const rows: PairRow[] = categories.map((c) => {
    const pHome = o.cat_p_a[c.key]
    const known = typeof pHome === 'number' && Number.isFinite(pHome)
    return {
      key: c.key,
      label: categoryLabel(c.key, categories),
      title: c.higher_is_better ? undefined : 'lower is better',
      pLeft: known ? (side.homeWins ? pHome : 1 - pHome) : null,
    }
  })
  const context = contextLine(side.games, o.notes)

  return (
    <article className={cls} data-testid={testId} aria-label={`${home} vs ${away}`}>
      <div className="mc-head">
        <Title pair={pair} names={names} userId={userId} />
      </div>

      <section className="mc-section" aria-labelledby={projectedId}>
        <h4 className="mc-section-title" id={projectedId}>
          Projected outcome <span className="mc-section-note">(simulated)</span>
        </h4>
        <div className="mc-summary">
          <Tooltip content={WINNER_HINT}>
            <span className="mc-winner" data-testid="projected-winner" tabIndex={0}>
              <span className="mc-k">Projected winner</span>
              <b className="mc-name">{side.winner}</b>
              <span className="mc-headline" data-testid="mc-headline">
                <b className="mc-p">Win {fmtPct(side.pWin)}</b>
                <span className="mc-rest">
                  {' · '}Tie {fmtPct(o.p_tie)}
                  {' · '}Lose {fmtPct(side.pLose)}
                </span>
              </span>
            </span>
          </Tooltip>
          <dl className="mc-facts">
            <div title="mean categories won over all simulated weeks, not the score of any one week">
              <dt>Expected categories</dt>
              <dd data-testid="mc-expected">
                {fmtNum(side.expWinner, 1)} – {fmtNum(side.expLoser, 1)}
              </dd>
            </div>
            <div title="the single most frequent category score across the simulated weeks">
              <dt>Most common score</dt>
              <dd>
                {fmtNum(side.modal[0], 0)}–{fmtNum(side.modal[1], 0)}
              </dd>
            </div>
          </dl>
        </div>
        {(context || o.notes.length > 0) && (
          <div className="mc-context">
            {context && (
              <span className="mc-context-line" data-testid="mc-context" title={`games counted this week: ${side.winner} · ${side.loser}; players out are OUT, on IR or without an NBA team`}>
                {context}
              </span>
            )}
            {o.notes.length > 0 && (
              <Disclosure summary="Assumptions and notes" testId="mc-notes-toggle">
                <ul className="mc-notes muted">
                  {o.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </Disclosure>
            )}
          </div>
        )}
        <ProbabilityPair
          leftName={side.winner}
          rightName={side.loser}
          rows={rows}
          rowTestId={(k) => `cat-${k}`}
          rowClass={(k) => ((o.cat_p_a[k] ?? 0.5) >= 0.5 ? 'fav-a' : 'fav-b')}
          closeBand={CLOSE_BAND}
        />
        <p className="mc-note muted">Each end is that side's chance to take the category in the simulated weeks; a tied category counts half for each side, so the two ends add to 100%.</p>
      </section>

      {actual && <MatchupActuals categories={categories} left={{ name: side.winner, side: pickSide(side.winnerId) }} right={{ name: side.loser, side: pickSide(side.loserId) }} />}
    </article>
  )
}
