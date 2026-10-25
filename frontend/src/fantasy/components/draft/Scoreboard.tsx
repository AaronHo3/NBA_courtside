import { lastCommittedPick, managerName } from '../../lib/draftState'
import { useDraftStore } from '../../store/draftStore'
import { Icon } from '../ui/Icon'

/** Status strip for time pressure: who is on the clock, round · pick, my next pick, undo. Technical state lives in TechStatus. */
export function Scoreboard() {
  const state = useDraftStore((s) => s.state)
  const pending = useDraftStore((s) => s.pendingCommit)
  const players = useDraftStore((s) => s.players)
  const updateLeague = useDraftStore((s) => s.updateLeague)
  const undoLastPick = useDraftStore((s) => s.undoLastPick)
  if (!state) return null
  const cp = state.current_pick
  const total = state.schedule.length
  const uid = state.league.user_manager_id
  const onClockIsMe = state.on_clock_manager_id === uid
  const last = lastCommittedPick(state)

  const chooseTeam = (id: string) => {
    if (id === uid) return
    const name = managerName(state, id)
    if (!window.confirm(`Set "${name}" as your team? The pick schedule and every recommendation will recompute for that slot.`)) return
    void updateLeague({ ...state.league, user_manager_id: id, managers: state.league.managers.map((m) => ({ ...m, is_user: m.id === id })) })
  }
  const undo = async () => {
    if (!last) return
    const pname = players[last.player_id]?.name ?? last.player_id
    if (!window.confirm(`Undo pick #${last.overall}: ${pname} → ${managerName(state, last.manager_id)}?`)) return
    await undoLastPick()
  }
  const picksAway = state.picks_until_user_turn

  return (
    <div className="status-strip" role="region" aria-label="Draft status">
      <div className={onClockIsMe ? 'cell clock me' : 'cell clock'}>
        <span className="k">
          <span className={state.is_complete ? 'live done' : 'live'} data-testid="top-mode">
            {state.is_complete ? 'Draft complete' : 'Live'}
          </span>
          {!state.is_complete && ' · On the clock'}
        </span>
        <span className="v" data-testid="top-on-clock">
          {managerName(state, state.on_clock_manager_id)}
          {onClockIsMe ? ' (you)' : ''}
        </span>
      </div>
      <div className="cell">
        <span className="k">Round · pick</span>
        <span className="v tabular">
          <span data-testid="top-round">{cp ? cp.round : '—'}</span>
          <span className="dim"> · </span>
          <span data-testid="top-overall">{cp ? `${cp.overall} / ${total}` : `complete (${total})`}</span>
        </span>
      </div>
      <div className="cell">
        <span className="k">My next pick</span>
        <span className="v tabular">
          <span data-testid="top-my-next">{state.user_next_pick ? `#${state.user_next_pick.overall} (R${state.user_next_pick.round})` : '—'}</span>
          <span className="away">
            <span data-testid="top-picks-until">{picksAway ?? '—'}</span> {picksAway === 1 ? 'pick away' : 'picks away'}
          </span>
        </span>
      </div>
      <div className="cell grow">
        {last && (
          <button type="button" className="small" data-testid="board-undo" disabled={pending !== null} onClick={() => void undo()} title="Undo the most recent pick">
            <Icon name="undo" size={13} /> Undo #{last.overall} {players[last.player_id]?.name ?? ''}
          </button>
        )}
        <label className="me-pick">
          <span className="k">I am</span>
          <select data-testid="top-my-team" aria-label="Which team is mine" value={uid} onChange={(e) => chooseTeam(e.target.value)}>
            {state.league.managers.map((m, i) => (
              <option key={m.id} value={m.id}>
                #{i + 1} {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}
