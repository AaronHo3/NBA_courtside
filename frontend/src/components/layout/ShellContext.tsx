import { useNavigate } from 'react-router-dom'
import { useFantasyContext, useFantasySessions } from '@/lib/fantasyBridge'
import { PlayerSearch } from '../PlayerSearch'
import { SeasonPicker } from '../SeasonPicker'
import { CompareTray } from '../CompareTray'

const Dot = () => <span aria-hidden="true" className="text-ink-3">·</span>

function fmtSynced(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** Fantasy routes: which session and league the page is about, in one 34px row. */
export function FantasyContextBar() {
  const ctx = useFantasyContext()
  const sessions = useFantasySessions()
  const navigate = useNavigate()
  const list = sessions.data ?? []
  const onPick = (id: string) => {
    const hash = window.location.hash || '#/draft'
    navigate(`/fantasy?session=${encodeURIComponent(id)}${hash}`)
    window.dispatchEvent(new Event('locationchange'))
  }
  const leagueLabel = ctx.linked ? (ctx.leagueName ?? 'Linked to ESPN') : ctx.isComplete ? 'Not linked' : 'Draft in progress'
  return (
    <div className="flex min-w-0 flex-nowrap items-center gap-2 text-xs text-ink-2" aria-label="Fantasy context" role="group">
      <select aria-label="Session" className="control max-w-[200px] truncate text-xs text-ink" value={ctx.sessionId ?? ''} onChange={(e) => e.target.value && onPick(e.target.value)}>
        {!ctx.sessionId && <option value="">No session</option>}
        {ctx.sessionId && !list.some((s) => s.id === ctx.sessionId) && <option value={ctx.sessionId}>{ctx.sessionName ?? ctx.sessionId}</option>}
        {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      {ctx.sessionId && !ctx.isLoading && (
        <span className="hidden min-w-0 flex-nowrap items-center gap-2 whitespace-nowrap sm:inline-flex">
          <Dot />
          <span className="max-w-[180px] truncate font-medium text-ink" title={leagueLabel}>{leagueLabel}</span>
          {ctx.linked && ctx.period != null && <><Dot /><span className="tnum">Week {ctx.period}</span></>}
          {ctx.syncedAt && <><Dot /><span className="hidden tnum md:inline" title={ctx.syncedAt}>synced {fmtSynced(ctx.syncedAt)}</span></>}
        </span>
      )}
      {ctx.isDemo && <span className="whitespace-nowrap rounded-sm bg-amber-fill px-1.5 py-0.5 text-meta font-semibold text-on-fill">Demo data</span>}
    </div>
  )
}

/** Research routes: the NBA season the pages read, player search and the comparison group. */
export function ResearchContextBar() {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2" aria-label="Research context" role="group">
      <div className="hidden w-56 md:block"><PlayerSearch inputId="global-player-search" placeholder="Search players" /></div>
      <div className="flex items-center gap-1.5" role="group" aria-label="NBA season">
        <span className="hidden text-meta font-medium text-ink-3 sm:inline" aria-hidden="true">NBA season</span>
        <SeasonPicker compact />
      </div>
      <CompareTray />
    </div>
  )
}
