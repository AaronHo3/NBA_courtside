import { Fragment, useState, type ReactNode } from 'react'
import type { ActualsMetaView, CategoryDef, FreeAgentView } from '../../api/types'
import { categoryLabel, fmtNum, fmtPct, fmtSigned } from '../../lib/format'
import { minutesTitle } from '../../lib/minutes'
import { Badge } from '../common/Badge'
import { Icon } from '../ui/Icon'
import { PlayerIdentity } from '../ui/PlayerIdentity'
import { Tooltip } from '../ui/Tooltip'

export type FreeAgentRankMode = 'projection' | 'actual'

interface FreeAgentsTableProps {
  items: FreeAgentView[]
  categories: CategoryDef[]
  selectedId?: string | null
  /** Row click: select for the swap panel. */
  onSelect: (playerId: string) => void
  /** Details button: open the player drawer. Defaults to onSelect. */
  onOpen?: (playerId: string) => void
  /** `actual` swaps the projection columns for the player's real per-game line in the actuals window. */
  mode?: FreeAgentRankMode
  actuals?: ActualsMetaView | null
  /** Projection mode only: show every category z as its own column instead of the expandable detail row. */
  advanced?: boolean
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

export const VALUE_HELP = "weighted z: season-total z-scores summed over your league's categories, vs the ~200-player pool"
export const NET_HELP = 'add minus drop, same units'

/** Signed z cell tone: only clear strengths and weaknesses are coloured. */
const zTone = (z: number | null | undefined) => ((z ?? 0) > 0.5 ? 'pos' : (z ?? 0) < -0.5 ? 'neg' : '')

/** Column header with a unit explanation behind an info button. */
function InfoHeader({ label, help }: { label: string; help: string }) {
  return (
    <span className="fa-th-info">
      {label}
      <Tooltip content={help} side="bottom">
        <button type="button" className="icon-btn help" aria-label={`About ${label}: ${help}`}>
          <Icon name="info" size={12} />
        </button>
      </Tooltip>
    </span>
  )
}

function StatusCell({ f }: { f: FreeAgentView }) {
  if (f.flags.includes('out')) return <Badge tone="error">OUT</Badge>
  if (f.flags.includes('day-to-day')) return <Badge tone="warn">DTD</Badge>
  return <span className="muted">{f.injury_status ?? '—'}</span>
}

/** Category z for one player, laid out inline under the row. */
function CategoryDetail({ f, categories }: { f: FreeAgentView; categories: CategoryDef[] }) {
  return (
    <ul className="fa-cats" aria-label={`Category z for ${f.player.name}`}>
      {categories.map((c) => (
        <li key={c.key}>
          <span className="fa-cat-name">{categoryLabel(c.key, categories)}</span>
          <b className={`fa-cat-z ${zTone(f.z[c.key])}`}>{fmtSigned(f.z[c.key] ?? null, 1)}</b>
          {!c.higher_is_better && <span className="fa-cat-note">lower is better</span>}
        </li>
      ))}
    </ul>
  )
}

function ActualCells({ f, windowLabel }: { f: FreeAgentView; windowLabel: string }) {
  if (!f.actual) {
    return (
      <td className="muted" colSpan={5 + ACTUAL_COLS.length}>
        no games in {windowLabel}
      </td>
    )
  }
  const a = f.actual
  return (
    <>
      <td className="num">
        <b>{fmtNum(a.value_actual, 1)}</b>
      </td>
      <td className={`num ${a.value_delta > 0.5 ? 'pos' : a.value_delta < -0.5 ? 'neg' : ''}`}>{fmtSigned(a.value_delta, 1)}</td>
      <td className="num">{a.games}</td>
      {ACTUAL_COLS.map((c) => (
        <td key={c.key} className="num">
          {fmtNum(a.per_game[c.key], c.digits ?? 1)}
        </td>
      ))}
      <td className="num">{a.fg_pct === null ? '—' : fmtPct(a.fg_pct)}</td>
      <td className="num">{a.ft_pct === null ? '—' : fmtPct(a.ft_pct)}</td>
    </>
  )
}

function ActualHeaders({ windowLabel }: { windowLabel: string }) {
  return (
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
  )
}

/** Unowned players ranked by what they add to the user's roster, each with the cheapest drop to make room.
 *  Compact by default (one 36px row per player, category z behind an expand control); `advanced` shows every category column. */
export function FreeAgentsTable({ items, categories, selectedId = null, onSelect, onOpen, mode = 'projection', actuals = null, advanced = false }: FreeAgentsTableProps) {
  const open = onOpen ?? onSelect
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const windowLabel = actuals ? (actuals.scope === 'week' ? `week ${actuals.period}` : 'season to date') : 'actuals'
  const projection = mode === 'projection'
  const showCats = projection && advanced
  const expandable = !showCats
  const colCount = 3 + (projection ? 4 + (showCats ? categories.length : 0) : 5 + ACTUAL_COLS.length) + (expandable ? 1 : 0)
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const header: ReactNode = (
    <tr>
      <th scope="col" className="sticky-col">Player</th>
      <th scope="col">Status</th>
      <th scope="col" className="num" title="Share of ESPN leagues rostering the player">Own%</th>
      {projection && (
        <th scope="col" className="num" title="Minutes per game the ranking used: projected minutes blended with this season's stored game logs, or your override">
          MIN
        </th>
      )}
      {projection && (
        <th scope="col" className="num">
          <InfoHeader label="Value" help={VALUE_HELP} />
        </th>
      )}
      {projection && <th scope="col">Best drop</th>}
      {projection && (
        <th scope="col" className="num">
          <InfoHeader label="Net Δ" help={NET_HELP} />
        </th>
      )}
      {showCats &&
        categories.map((c) => (
          <th key={c.key} scope="col" className="num" title={c.kind === 'ratio' ? `${c.numerator} ÷ ${c.denominator}` : c.higher_is_better ? undefined : 'lower is better'}>
            {categoryLabel(c.key, categories)}
          </th>
        ))}
      {!projection && <ActualHeaders windowLabel={windowLabel} />}
      {expandable && (
        <th scope="col" className="fa-expand-col">
          <span className="visually-hidden">Category detail</span>
        </th>
      )}
    </tr>
  )
  return (
    <div className="table-wrap tall">
      <table className={`grid fa-table${advanced ? ' advanced' : ''}`} aria-label="Free agents" data-mode={mode}>
        <thead>{header}</thead>
        <tbody>
          {items.map((f) => {
            const id = f.player.player_id
            const isOpen = expandable && expanded.has(id)
            const selected = selectedId === id
            return (
              <Fragment key={id}>
                <tr
                  className={[f.flags.includes('out') ? 'drafted' : '', selected ? 'selected' : '', isOpen ? 'expanded' : ''].filter(Boolean).join(' ') || undefined}
                  onClick={() => onSelect(id)}
                  aria-selected={selected}
                >
                  <th scope="row" className="sticky-col">
                    <span className="fa-player">
                      <PlayerIdentity
                        name={
                          <button
                            type="button"
                            className="player-link"
                            onClick={(e) => {
                              e.stopPropagation()
                              onSelect(id)
                            }}
                          >
                            {f.player.name}
                          </button>
                        }
                        team={f.player.team}
                        positions={f.player.eligible_positions}
                        espnId={f.player.espn_id}
                        size={24}
                      />
                      <button
                        type="button"
                        className="small ghost icon-btn"
                        aria-label={`Details for ${f.player.name}`}
                        title="Player details"
                        onClick={(e) => {
                          e.stopPropagation()
                          open(id)
                        }}
                      >
                        <Icon name="eye" size={13} />
                      </button>
                    </span>
                  </th>
                  <td>
                    <StatusCell f={f} />
                  </td>
                  <td className="num muted">{f.percent_owned === null || f.percent_owned === undefined ? '—' : fmtPct(f.percent_owned / 100)}</td>
                  {projection && (
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
                  {projection && (
                    <td className="num">
                      <b>{fmtNum(f.score, 2)}</b>
                    </td>
                  )}
                  {projection && <td className="fa-drop">{f.best_drop ? f.best_drop.name : <span className="muted">—</span>}</td>}
                  {projection && <td className={`num ${f.swap_delta > 0 ? 'pos' : f.swap_delta < 0 ? 'neg' : ''}`}>{fmtSigned(f.swap_delta, 2)}</td>}
                  {showCats &&
                    categories.map((c) => (
                      <td key={c.key} className={`num ${zTone(f.z[c.key])}`}>
                        {fmtSigned(f.z[c.key] ?? null, 1)}
                      </td>
                    ))}
                  {!projection && <ActualCells f={f} windowLabel={windowLabel} />}
                  {expandable && (
                    <td className="fa-expand-col">
                      <button
                        type="button"
                        className="small ghost icon-btn"
                        aria-expanded={isOpen}
                        aria-label={`Category detail for ${f.player.name}`}
                        title="Category z"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggle(id)
                        }}
                      >
                        <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} />
                      </button>
                    </td>
                  )}
                </tr>
                {isOpen && (
                  <tr className="fa-detail-row breakdown" data-testid="fa-detail-row">
                    <td colSpan={colCount}>
                      <span className="fa-detail-k">{projection ? 'Category z' : 'Projected category z'} · season total vs the pool</span>
                      <CategoryDetail f={f} categories={categories} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
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

/** Placeholder rows for the first load, sized like the compact table. */
export function FreeAgentsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="table-wrap" aria-busy="true" aria-label="Loading free agents">
      <table className="grid fa-table">
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i} data-testid="fa-skeleton-row">
              <td>
                <span className="fa-skel wide" />
              </td>
              <td>
                <span className="fa-skel" />
              </td>
              <td>
                <span className="fa-skel" />
              </td>
              <td>
                <span className="fa-skel" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
