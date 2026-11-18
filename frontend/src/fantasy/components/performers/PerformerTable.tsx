import { type CSSProperties, useState } from 'react'
import type { CategoryDef, PerformerRow } from '../../api/types'
import { fmtNum, fmtSigned, positionsText } from '../../lib/format'
import { Badge } from '../common/Badge'
import { Icon } from '../ui/Icon'
import { TeamMark } from '../ui/PlayerIdentity'
import { type BackLink, SampleTag } from './FeatureCards'
import { PerformerDrawer } from './PerformerDrawer'
import { Portrait } from './Portrait'

export type Metric = 'contribution' | 'over_expected'

export interface MoveTag {
  kind: 'add' | 'drop'
  period: number
}
/** Player id -> that team's adds/drops of him, for the shown scope. */
export type MoveTags = Record<string, MoveTag[]>
/** The fantasy team a row's games counted for; `color` tints the row (null = plain). */
export interface RowTeam {
  id: string | null
  name: string
  color: string | null
  /** Small line under the name, e.g. who else held the player this season. */
  detail?: string
  /** Tooltip for the whole cell. */
  title?: string
}
type SortKey = 'rank' | 'player' | 'team' | 'games' | 'minutes' | 'contribution' | 'contribution_alt' | 'over_expected' | 'PTS' | 'REB' | 'AST' | 'STL' | 'BLK' | 'FG3M' | 'FG_PCT' | 'FT_PCT'

const STAT_COLS: { key: 'PTS' | 'REB' | 'AST' | 'STL' | 'BLK' | 'FG3M' | 'FG_PCT' | 'FT_PCT'; label: string }[] = [
  { key: 'PTS', label: 'PTS' },
  { key: 'REB', label: 'REB' },
  { key: 'AST', label: 'AST' },
  { key: 'STL', label: 'STL' },
  { key: 'BLK', label: 'BLK' },
  { key: 'FG3M', label: '3PM' },
  { key: 'FG_PCT', label: 'FG%' },
  { key: 'FT_PCT', label: 'FT%' },
]

const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`

function cell(v: number | null | undefined, key: string): string {
  if (v === null || v === undefined) return '—'
  return key.endsWith('PCT') ? pct1(v) : fmtNum(v, Number.isInteger(v) ? 0 : 1)
}

/** The row's numbers in the active unit mode: cumulative, or per ESPN-counted game. */
function contributionOf(r: PerformerRow, perGame: boolean): number | null {
  return perGame ? r.contribution_per_game : r.contribution
}
function overOf(r: PerformerRow, perGame: boolean): number | null {
  return perGame ? r.over_expected_per_game : r.over_expected
}
function statOf(r: PerformerRow, key: string, perGame: boolean): number | null | undefined {
  return perGame ? r.actual_per_game[key] : r.actual[key]
}

function sortValue<R extends PerformerRow>(r: R, key: SortKey, perGame: boolean, team?: (r: R) => RowTeam | null): number | string {
  switch (key) {
    case 'player':
      return r.player.name
    case 'team':
      return team?.(r)?.name ?? ''
    case 'rank':
    case 'games':
    case 'minutes':
      return r[key]
    case 'contribution':
      return contributionOf(r, perGame) ?? Number.NEGATIVE_INFINITY
    case 'contribution_alt':
      return contributionOf(r, !perGame) ?? Number.NEGATIVE_INFINITY
    case 'over_expected':
      return overOf(r, perGame) ?? Number.NEGATIVE_INFINITY
    default:
      return statOf(r, key, perGame) ?? Number.NEGATIVE_INFINITY
  }
}

interface PerformerTableProps<R extends PerformerRow> {
  rows: R[]
  metric: Metric
  /** Row highlighted in sync with the charts. */
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** Controlled drawer: which row's details are open. Uncontrolled when omitted. */
  openId?: string | null
  onOpenChange?: (id: string | null) => void
  /** League's scored categories, forwarded to the drawer. */
  categories?: CategoryDef[]
  /** Roster moves to badge next to the player (added wk N / dropped wk N). */
  moves?: MoveTags
  /** Per-game units and stats instead of cumulative ones. */
  perGame?: boolean
  /** Back-link for the drawer's NBA profile link. */
  back?: BackLink
  /** Adds a "Fantasy team" column; a row whose team has a colour is tinted with it. */
  team?: (r: R) => RowTeam | null
  /** Also show contribution in the other unit (per game beside totals, or totals beside per game). */
  bothUnits?: boolean
}

/** Sortable table of every rostered player; the name opens a detail drawer with actual vs expected. */
export function PerformerTable<R extends PerformerRow>({ rows, metric, selectedId = null, onSelect, openId, onOpenChange, categories, moves, perGame = false, back, team, bothUnits = false }: PerformerTableProps<R>) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'rank', desc: false })
  const [localOpen, setLocalOpen] = useState<string | null>(null)
  const open = openId === undefined ? localOpen : openId
  const setOpen = (id: string | null) => {
    if (onOpenChange) onOpenChange(id)
    else setLocalOpen(id)
  }
  const sorted = [...rows].sort((a, b) => {
    // players without a baseline always sort last on "vs expected", whichever direction
    if (sort.key === 'over_expected' && (a.over_expected === null) !== (b.over_expected === null)) return a.over_expected === null ? 1 : -1
    const va = sortValue(a, sort.key, perGame, team)
    const vb = sortValue(b, sort.key, perGame, team)
    const cmp = typeof va === 'string' && typeof vb === 'string' ? va.localeCompare(vb) : Number(va) - Number(vb)
    return sort.desc ? -cmp : cmp
  })
  const toggleSort = (key: SortKey, defaultDesc: boolean) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: defaultDesc }))
  const head = (key: SortKey, label: string, title: string, defaultDesc = true, numeric = true) => (
    <th key={key} scope="col" className={numeric ? 'num' : undefined} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="sort" onClick={() => toggleSort(key, defaultDesc)} aria-label={`Sort by ${title}`} title={title}>
        {label}
        {sort.key === key ? <Icon name={sort.desc ? 'chevron-down' : 'chevron-up'} size={11} /> : null}
      </button>
    </th>
  )
  const openRow = open ? rows.find((r) => r.player.player_id === open) ?? null : null
  return (
    <>
      <div className="table-wrap">
        <table className="grid performers" aria-label="Team performers">
          <thead>
            <tr>
              {head('rank', '#', 'rank', false)}
              {head('player', 'Player', 'player name', false, false)}
              {team && head('team', 'Fantasy team', 'fantasy team', false, false)}
              <th scope="col">Team · pos</th>
              {head('games', 'GP', 'games played')}
              {head('minutes', 'MIN', 'minutes')}
              {head('contribution', perGame ? 'Contribution / g' : 'Contribution', `contribution: category value produced, ${perGame ? 'per game played' : 'cumulative'}`)}
              {bothUnits && head('contribution_alt', perGame ? 'Contribution' : 'Contribution / g', `contribution, ${perGame ? 'cumulative' : 'per game played'}`)}
              {head('over_expected', perGame ? 'vs expected / g' : 'vs expected', `vs expected: contribution minus projection x games played${perGame ? ', per game' : ''}`)}
              {STAT_COLS.map((c) => head(c.key, c.label, c.label))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const lead = (metric === 'contribution' ? r.rank === 1 : r.over_expected !== null && r.rank === 1) && rows[0]?.player.player_id === r.player.player_id
              const over = overOf(r, perGame)
              const rowTeam = team?.(r) ?? null
              const tint = rowTeam?.color ?? null
              const cls = [lead ? 'leader' : '', selectedId === r.player.player_id ? 'selected' : '', tint ? 'tinted' : ''].filter(Boolean).join(' ')
              const style: CSSProperties & Record<string, string> = {}
              if (onSelect) style.cursor = 'pointer'
              if (tint) style['--row-tint'] = tint
              return (
                <tr key={r.player.player_id} className={cls || undefined} data-testid="performer-row" onClick={onSelect ? () => onSelect(r.player.player_id) : undefined} style={Object.keys(style).length ? style : undefined}>
                  <td className="num">{r.rank}</td>
                  <th scope="row">
                    <span className="row-player">
                      <Portrait name={r.player.name} espnId={r.player.espn_id} team={r.player.team} size={30} />
                      <button
                        type="button"
                        className="player-link"
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpen(open === r.player.player_id ? null : r.player.player_id)
                        }}
                        aria-expanded={open === r.player.player_id}
                        aria-label={`Details for ${r.player.name}`}
                      >
                        {r.player.name}
                      </button>
                      {(moves?.[r.player.player_id] ?? []).map((t) => (
                        <Badge key={`${t.kind}-${t.period}`} tone={t.kind === 'add' ? 'ok' : 'error'} title={t.kind === 'add' ? `picked up in week ${t.period}; only games while rostered count` : `dropped in week ${t.period}; games before the drop still count for this team`}>
                          {t.kind === 'add' ? 'added' : 'dropped'} wk {t.period}
                        </Badge>
                      ))}
                      {r.flags.filter((f) => f !== 'small sample').map((f) => (
                        <Badge key={f} tone={f === 'no games' ? 'neutral' : 'warn'}>
                          {f}
                        </Badge>
                      ))}
                    </span>
                  </th>
                  {team && (
                    <td className="fantasy-team" title={rowTeam?.title}>
                      {rowTeam && (
                        <span className="team-cell">
                          <span className="team-chip" style={rowTeam.color ? ({ '--row-tint': rowTeam.color } as CSSProperties) : undefined}>
                            <span className="team-dot" aria-hidden="true" />
                            {rowTeam.name}
                          </span>
                          {rowTeam.detail && <span className="team-detail muted">{rowTeam.detail}</span>}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="muted">
                    <TeamMark team={r.player.team} /> · {positionsText(r.player.eligible_positions)}
                  </td>
                  <td className="num">{r.games}</td>
                  <td className="num">{fmtNum(r.minutes, 0)}</td>
                  <td className="num">
                    <span className="num-with-tag">
                      <SampleTag row={r} />
                      <b>{fmtNum(contributionOf(r, perGame), perGame ? 2 : 1)}</b>
                    </span>
                  </td>
                  {bothUnits && <td className="num">{fmtNum(contributionOf(r, !perGame), perGame ? 1 : 2)}</td>}
                  <td className={`num ${over === null ? 'muted' : over > 0 ? 'pos' : over < 0 ? 'neg' : ''}`} data-testid="over-expected">
                    {over === null ? '—' : fmtSigned(over, perGame ? 2 : 1)}
                  </td>
                  {STAT_COLS.map((c) => (
                    <td key={c.key} className="num">
                      {cell(statOf(r, c.key, perGame), c.key)}
                    </td>
                  ))}
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7 + STAT_COLS.length + (team ? 1 : 0) + (bothUnits ? 1 : 0)} className="muted">
                  Nothing to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {openRow && <PerformerDrawer row={openRow} onClose={() => setOpen(null)} categories={categories} back={back} />}
    </>
  )
}
