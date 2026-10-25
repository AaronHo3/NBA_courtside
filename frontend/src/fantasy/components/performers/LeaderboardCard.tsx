import type { PerformerRow } from '../../api/types'
import { fmtNum, fmtSigned, positionsText } from '../../lib/format'
import { teamColor } from '../../lib/teamColors'
import { Icon } from '../ui/Icon'
import { Tooltip } from '../ui/Tooltip'
import { Portrait } from './Portrait'

interface LeaderboardCardProps {
  title: string
  tooltip: string
  rows: PerformerRow[]
  metric: 'contribution' | 'over_expected'
  /** Show per-game units instead of cumulative units. */
  perGame?: boolean
  limit?: number
  testId?: string
  selectedId?: string | null
  onSelect?: (id: string) => void
}

/** Top-N card: leader highlighted, actual vs expected bars, team-coloured accents; click selects the player. */
export function LeaderboardCard({ title, tooltip, rows, metric, perGame = false, limit = 5, testId, selectedId = null, onSelect }: LeaderboardCardProps) {
  const top = rows.slice(0, limit)
  const contribOf = (r: PerformerRow) => (perGame ? (r.contribution_per_game ?? 0) : r.contribution)
  const overOf = (r: PerformerRow) => (perGame ? r.over_expected_per_game : r.over_expected)
  const expectedOf = (r: PerformerRow) => (r.expected_contribution === null ? null : perGame ? (r.games ? r.expected_contribution / r.games : null) : r.expected_contribution)
  const max = Math.max(1e-9, ...top.map((r) => Math.abs(metric === 'contribution' ? contribOf(r) : (overOf(r) ?? 0))), ...top.map((r) => Math.abs(expectedOf(r) ?? 0)))
  return (
    <section className="leaderboard" aria-label={title} data-testid={testId}>
      <div className="chart-head">
        <div className="chart-title">
          <h3>{title}</h3>
          <Tooltip content={tooltip}>
            <button type="button" className="icon-btn help" aria-label={`About ${title}`}>
              <Icon name="help" size={14} />
            </button>
          </Tooltip>
        </div>
        {metric === 'contribution' && (
          <ul className="legend" aria-label="Legend">
            <li>
              <span className="swatch team" aria-hidden="true" /> actual
            </li>
            <li>
              <span className="swatch projected" aria-hidden="true" /> expected
            </li>
          </ul>
        )}
      </div>
      {top.length === 0 ? (
        <p className="muted">No qualifying players.</p>
      ) : (
        <ol className="leaders">
          {top.map((r, i) => {
            const color = teamColor(r.player.team)
            const value = metric === 'contribution' ? contribOf(r) : (overOf(r) ?? 0)
            const expected = expectedOf(r) ?? 0
            const text = metric === 'contribution' ? fmtNum(contribOf(r), 1) : fmtSigned(overOf(r), 1)
            const cls = [i === 0 ? 'lead' : '', selectedId === r.player.player_id ? 'selected' : ''].filter(Boolean).join(' ')
            const inner = (
              <>
                <span className="rank">{i + 1}</span>
                <Portrait name={r.player.name} espnId={r.player.espn_id} team={r.player.team} size={i === 0 ? 52 : 38} />
                <span className="who">
                  <b>{r.player.name}</b>
                  <span className="muted">
                    {r.player.team ?? 'FA'} · {positionsText(r.player.eligible_positions)} · {r.games} GP
                    {r.flags.length ? ` · ${r.flags.join(', ')}` : ''}
                  </span>
                  {metric === 'contribution' ? (
                    <span className="bars" aria-hidden="true">
                      <span className="bar actual" style={{ width: `${Math.min(100, (Math.abs(contribOf(r)) / max) * 100)}%`, background: color.primary }} />
                      {r.expected_contribution !== null && <span className="bar expected" style={{ width: `${Math.min(100, (Math.abs(expected) / max) * 100)}%` }} />}
                    </span>
                  ) : (
                    <span className="bars" aria-hidden="true">
                      <span className={`bar ${value >= 0 ? 'actual' : 'under'}`} style={{ width: `${Math.min(100, (Math.abs(value) / max) * 100)}%`, background: value >= 0 ? color.primary : undefined }} />
                    </span>
                  )}
                </span>
                <span className="value">
                  <b>{text}</b>
                  <span className="muted">{metric === 'contribution' ? `exp ${expectedOf(r) === null ? '—' : fmtNum(expectedOf(r), 1)}${perGame ? ' /g' : ''}` : `of ${fmtNum(contribOf(r), 1)}${perGame ? ' /g' : ''}`}</span>
                </span>
              </>
            )
            return (
              <li key={r.player.player_id} className={cls || undefined} style={{ borderLeftColor: color.primary }}>
                {onSelect ? (
                  <button type="button" className="leader-btn" onClick={() => onSelect(r.player.player_id)} aria-pressed={selectedId === r.player.player_id} aria-label={`${r.player.name}: ${text}`}>
                    {inner}
                  </button>
                ) : (
                  <span className="leader-btn">{inner}</span>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
