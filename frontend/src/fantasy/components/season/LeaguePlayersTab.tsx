import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import type { LeaguePerformerRow } from '../../api/types'
import { managerColors } from '../../lib/managerColors'
import { useSeasonStore } from '../../store/seasonStore'
import { PerformerTable, type RowTeam } from '../performers/PerformerTable'
import { Icon } from '../ui/Icon'
import { Segmented } from '../ui/Segmented'
import { EmptyState, ErrorState, LoadingState } from '../ui/States'

type Scope = 'week' | 'season'
type Unit = 'total' | 'per_game'

const weeksText = (periods: number[]) => (periods.length <= 1 ? `wk ${periods[0] ?? '?'}` : `wk ${periods[0]}–${periods[periods.length - 1]}`)

/** Detail and tooltip for a player whose games counted for more than one team, or for a team other than his current one. */
function ownerHistory(r: LeaguePerformerRow, nameOf: (id: string) => string): Pick<RowTeam, 'detail' | 'title'> {
  const moved = r.owners.length > 1 || (r.owners.length === 1 && r.owners[0].manager_id !== r.owner_id)
  if (!moved) return {}
  const stints = r.owners.map((o) => `${nameOf(o.manager_id)} ${weeksText(o.periods)}`)
  const games = r.owners.map((o) => `${o.games} for ${nameOf(o.manager_id)}`).join(', ')
  return { detail: stints.join(' · '), title: `${r.games} games counted: ${games}` }
}

const UNIT_CAPTION = 'Units: category standard deviations × games (one unit ≈ one average starter-game in one category). Same numbers as the Performers page.'

/** Every rostered player in the league on one contribution ranking, with each row's fantasy team; pick teams to colour their rows. */
export function LeaguePlayersTab({ sessionId }: { sessionId: string }) {
  const data = useSeasonStore((s) => s.leaguePerformers)
  const status = useSeasonStore((s) => s.leaguePerformersStatus)
  const error = useSeasonStore((s) => s.leaguePerformersError)
  const load = useSeasonStore((s) => s.loadLeaguePerformers)
  const [scope, setScope] = useState<Scope>('week')
  const [period, setPeriod] = useState<number | null>(null)
  const [unit, setUnit] = useState<Unit>('total')
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(new Set())
  const perGame = unit === 'per_game'

  const periods = useMemo(() => data?.periods_available ?? [], [data?.periods_available])
  const latest = periods.length ? periods[periods.length - 1] : null
  // Weekly with no week chosen yet: the latest synced week once we know it (the first load has to ask for the
  // season to learn which weeks exist, and that response is never shown under a week label).
  const wantPeriod = scope === 'week' ? period ?? latest : null
  useEffect(() => {
    void load(sessionId, wantPeriod)
  }, [sessionId, wantPeriod, load])
  const inSync = data !== null && (scope === 'season' ? data.scope === 'season' : data.scope === 'week' && data.period === wantPeriod)

  const managerIds = useMemo(() => Object.keys(data?.managers ?? {}), [data?.managers])
  const colors = useMemo(() => managerColors(managerIds), [managerIds])
  const managers = data?.managers ?? {}
  const rows: LeaguePerformerRow[] = inSync ? data.rows : []

  const toggle = (id: string) =>
    setHighlighted((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const nameOf = (id: string) => (id === data?.user_manager_id ? 'you' : managers[id] ?? id)
  const team = (r: LeaguePerformerRow): RowTeam => ({
    id: r.owner_id,
    name: r.owner_id ? managers[r.owner_id] ?? r.owner_id : 'Free agent',
    color: r.owner_id && highlighted.has(r.owner_id) ? colors.get(r.owner_id) ?? null : null,
    ...ownerHistory(r, nameOf),
  })

  return (
    <div className="stack league-players">
      <div className="filter-bar">
        <Segmented<Scope>
          variant="pill"
          label="Scope"
          value={scope}
          onChange={(s) => {
            setScope(s)
            setPeriod(null)
          }}
          options={[
            { id: 'week', label: 'Weekly', testId: 'lp-scope-week' },
            { id: 'season', label: 'Season to date', testId: 'lp-scope-season' },
          ]}
        />
        {scope === 'week' && (
          <span className="field">
            <label htmlFor="lp-week">Week</label>
            <select id="lp-week" value={wantPeriod ?? ''} onChange={(e) => setPeriod(Number(e.target.value))} disabled={periods.length === 0} data-testid="lp-week">
              {periods.length === 0 && <option value="">No weeks synced yet</option>}
              {periods.map((p) => (
                <option key={p} value={p}>
                  Week {p}
                </option>
              ))}
            </select>
          </span>
        )}
        <Segmented<Unit>
          variant="pill"
          label="Units"
          value={unit}
          onChange={setUnit}
          options={[
            { id: 'total', label: 'Totals', testId: 'lp-unit-total' },
            { id: 'per_game', label: 'Per game', testId: 'lp-unit-per-game' },
          ]}
        />
        <span className="status">{status === 'loading' ? 'Loading…' : data ? `Source: ${data.source}` : ''}</span>
      </div>
      {managerIds.length > 0 && (
        <div className="team-legend-bar">
          <div className="team-legend" role="group" aria-label="Highlight teams">
            {managerIds.map((id) => {
              const on = highlighted.has(id)
              return (
                <button key={id} type="button" className="team-toggle" aria-pressed={on} onClick={() => toggle(id)} style={{ '--row-tint': colors.get(id) } as CSSProperties} title={on ? 'Click to stop highlighting this team' : "Click to colour this team's rows"}>
                  <span className="team-dot" aria-hidden="true" />
                  {managers[id]}
                  {id === data?.user_manager_id ? ' (you)' : ''}
                </button>
              )
            })}
          </div>
          <span className="team-legend-actions">
            <button type="button" className="small ghost" onClick={() => setHighlighted(new Set(managerIds))}>
              Highlight all
            </button>
            <button type="button" className="small ghost" onClick={() => setHighlighted(new Set())} disabled={highlighted.size === 0}>
              <Icon name="close" size={12} /> Clear highlights
            </button>
          </span>
        </div>
      )}
      {status === 'error' && <ErrorState title="Could not load the league's players">{error}</ErrorState>}
      {(status === 'loading' || !inSync) && status !== 'error' && rows.length === 0 && <LoadingState title="Loading box scores" />}
      {data && inSync && rows.length === 0 && <EmptyState title="No box scores for this selection yet">{data.notes.join(' ') || 'Sync the league after games have been played; weekly stats fill in as ESPN applies them.'}</EmptyState>}
      {data && rows.length > 0 && (
        <>
          <PerformerTable rows={rows} metric="contribution" categories={data.categories} perGame={perGame} team={team} bothUnits />
          <p className="table-note">
            Rank is by contribution across the whole league{perGame ? ', shown per game played' : ''}. {UNIT_CAPTION} Every game that counted for any team is included; a player who changed hands shows his current team with the earlier stints underneath. Games played while on waivers are not in ESPN's box scores.
          </p>
          {data.notes.length > 0 && (
            <ul className="table-note" style={{ paddingLeft: 18 }}>
              {data.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
