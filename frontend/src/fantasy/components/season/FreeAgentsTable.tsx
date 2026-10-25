import type { ActualsMetaView, CategoryDef, FreeAgentView } from '../../api/types'
import { categoryLabel, fmtNum, fmtPct, fmtSigned, positionsText } from '../../lib/format'
import { minutesTitle } from '../../lib/minutes'
import { Badge } from '../common/Badge'
import { Icon } from '../ui/Icon'
import { TeamMark } from '../ui/PlayerIdentity'

export type FreeAgentRankMode = 'projection' | 'actual'

interface FreeAgentsTableProps {
  items: FreeAgentView[]
  categories: CategoryDef[]
  selectedId?: string | null
  /** Row click: select for the swap panel. */
  onSelect: (playerId: string) => void
  /** Name click: open the player drawer. Defaults to onSelect. */
  onOpen?: (playerId: string) => void
  /** `actual` swaps the projection z columns for the player's real per-game line in the actuals window. */
  mode?: FreeAgentRankMode
  actuals?: ActualsMetaView | null
}

const ACTUAL_COLS: Array<{ key: string; label: string; digits?: number }> = [
  { key: 'MIN', label: 'MIN', digits: 1 },
  { key: 'PTS', label: 'PTS' },
  { key: 'REB', label: 'REB' },
  { key: 'AST', label: 'AST' },
  { key: 'STL', label: 'STL' },
  { key: 'BLK', label: 'BLK' },
  { key: 'FG3M', label: '3PM' },
]

/** Unowned players ranked by what they add to the user's roster, each with the cheapest drop to make room. */
export function FreeAgentsTable({ items, categories, selectedId = null, onSelect, onOpen, mode = 'projection', actuals = null }: FreeAgentsTableProps) {
  const open = onOpen ?? onSelect
  const windowLabel = actuals ? (actuals.scope === 'week' ? `week ${actuals.period}` : 'season to date') : 'actuals'
  const colCount = mode === 'actual' ? 9 + ACTUAL_COLS.length + 2 : 8 + categories.length
  return (
    <div className="table-wrap tall">
      <table className="grid" aria-label="Free agents" data-mode={mode}>
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col">Team · pos</th>
            <th scope="col">Status</th>
            <th scope="col" className="num">% owned</th>
            {mode === 'projection' && (
              <th scope="col" className="num" title="Minutes per game the ranking used: projected minutes blended with this season's stored game logs, or your override">
                MIN
              </th>
            )}
            <th scope="col" className="num" title="Fast-ranking value against your roster (projection, weighted z)">Value</th>
            {mode === 'projection' && <th scope="col">Best drop</th>}
            {mode === 'projection' && <th scope="col" className="num">Net Δ</th>}
            {mode === 'projection' &&
              categories.map((c) => (
                <th key={c.key} scope="col" className="num" title={c.kind === 'ratio' ? `${c.numerator} ÷ ${c.denominator}` : c.higher_is_better ? undefined : 'lower is better'}>
                  {categoryLabel(c.key, categories)}
                </th>
              ))}
            {mode === 'actual' && (
              <>
                <th scope="col" className="num" title={`Actual production in ${windowLabel}, scored on the projection's per-game scale`}>
                  Actual value
                </th>
                <th scope="col" className="num" title="Actual value minus the projection scored the same way">
                  Δ vs proj
                </th>
                <th scope="col" className="num">GP</th>
                {ACTUAL_COLS.map((c) => (
                  <th key={c.key} scope="col" className="num">
                    {c.label}
                  </th>
                ))}
                <th scope="col" className="num" title="makes ÷ attempts over the window">FG%</th>
                <th scope="col" className="num" title="makes ÷ attempts over the window">FT%</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((f) => (
            <tr
              key={f.player.player_id}
              className={[f.flags.includes('out') ? 'drafted' : '', selectedId === f.player.player_id ? 'selected' : ''].filter(Boolean).join(' ') || undefined}
              onClick={() => onSelect(f.player.player_id)}
              style={{ cursor: 'pointer' }}
              aria-selected={selectedId === f.player.player_id}
            >
              <th scope="row">
                <button
                  type="button"
                  className="player-link"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect(f.player.player_id)
                  }}
                >
                  {f.player.name}
                </button>{' '}
                <button
                  type="button"
                  className="small ghost icon-btn"
                  aria-label={`Details for ${f.player.name}`}
                  title="Player details"
                  onClick={(e) => {
                    e.stopPropagation()
                    open(f.player.player_id)
                  }}
                >
                  <Icon name="eye" size={13} />
                </button>
              </th>
              <td className="muted">
                <TeamMark team={f.player.team} /> · {positionsText(f.player.eligible_positions)}
              </td>
              <td>
                {f.flags.includes('out') ? <Badge tone="error">OUT</Badge> : f.flags.includes('day-to-day') ? <Badge tone="warn">DTD</Badge> : <span className="muted">{f.injury_status ?? '—'}</span>}
              </td>
              <td className="num muted">{f.percent_owned === null || f.percent_owned === undefined ? '—' : fmtPct(f.percent_owned / 100)}</td>
              {mode === 'projection' && (
                <td className={`num ${f.minutes ? '' : 'muted'}`} data-testid="minutes-cell" title={minutesTitle(f.minutes, f.player.per_game.MIN)}>
                  {fmtNum(f.minutes ? f.minutes.used : (f.player.per_game.MIN ?? null), 1)}
                  {f.minutes?.source === 'override' && (
                    <>
                      {' '}
                      <Badge tone="accent">override</Badge>
                    </>
                  )}
                </td>
              )}
              <td className="num">
                <b>{fmtNum(f.score, 2)}</b>
              </td>
              {mode === 'projection' && <td>{f.best_drop ? f.best_drop.name : <span className="muted">—</span>}</td>}
              {mode === 'projection' && <td className={`num ${f.swap_delta > 0 ? 'pos' : f.swap_delta < 0 ? 'neg' : ''}`}>{fmtSigned(f.swap_delta, 2)}</td>}
              {mode === 'projection' &&
                categories.map((c) => (
                  <td key={c.key} className={`num ${(f.z[c.key] ?? 0) > 0.5 ? 'pos' : (f.z[c.key] ?? 0) < -0.5 ? 'neg' : ''}`}>
                    {fmtSigned(f.z[c.key] ?? null, 1)}
                  </td>
                ))}
              {mode === 'actual' &&
                (f.actual ? (
                  <>
                    <td className="num">
                      <b>{fmtNum(f.actual.value_actual, 1)}</b>
                    </td>
                    <td className={`num ${f.actual.value_delta > 0.5 ? 'pos' : f.actual.value_delta < -0.5 ? 'neg' : ''}`}>{fmtSigned(f.actual.value_delta, 1)}</td>
                    <td className="num">{f.actual.games}</td>
                    {ACTUAL_COLS.map((c) => (
                      <td key={c.key} className="num">
                        {fmtNum(f.actual!.per_game[c.key], c.digits ?? 1)}
                      </td>
                    ))}
                    <td className="num">{f.actual.fg_pct === null ? '—' : fmtPct(f.actual.fg_pct)}</td>
                    <td className="num">{f.actual.ft_pct === null ? '—' : fmtPct(f.actual.ft_pct)}</td>
                  </>
                ) : (
                  <td className="muted" colSpan={5 + ACTUAL_COLS.length}>
                    no games in {windowLabel}
                  </td>
                ))}
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={colCount} className="muted">
                No free agents match.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
