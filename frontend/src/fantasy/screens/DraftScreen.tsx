import { useEffect, useState, type ReactNode } from 'react'
import { AllPlayersTable } from '../components/draft/AllPlayersTable'
import { CategoryProfileTable } from '../components/draft/CategoryProfileTable'
import { CompareView } from '../components/draft/CompareView'
import { HistoryDrawer } from '../components/draft/HistoryDrawer'
import { PlayerDrawer } from '../components/draft/PlayerDrawer'
import { PlayerPicker } from '../components/draft/PlayerPicker'
import { RecommendationCard } from '../components/draft/RecommendationCard'
import { RosterPanel } from '../components/draft/RosterPanel'
import { Scoreboard } from '../components/draft/Scoreboard'
import { ShortlistTable } from '../components/draft/ShortlistTable'
import { StrategyPanel } from '../components/draft/StrategyPanel'
import { TeamsPanel } from '../components/draft/TeamsPanel'
import { TechStatus } from '../components/draft/TechStatus'
import { Drawer } from '../components/ui/Drawer'
import { HowItWorks } from '../components/ui/HowItWorks'
import { Segmented } from '../components/ui/Segmented'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { buildUrl } from '../lib/router'
import { selectRecCurrent, useDraftStore } from '../store/draftStore'

const NO_WARNINGS: string[] = []
type WorkTab = 'recommendations' | 'players'
type SideTab = 'roster' | 'categories' | 'strategy' | 'teams'
type MobilePane = 'find' | 'picks' | 'mine'
/** column: My team is a third column (>= 1480px) or a mobile pane (< 760px); drawer: opened from the recommendation header. */
type TeamMode = 'column' | 'drawer'

const WIDE_QUERY = '(min-width: 1480px)'
const MOBILE_QUERY = '(max-width: 760px)'

function readTeamMode(): TeamMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'column'
  return window.matchMedia(WIDE_QUERY).matches || window.matchMedia(MOBILE_QUERY).matches ? 'column' : 'drawer'
}

function useTeamMode(): TeamMode {
  const [mode, setMode] = useState<TeamMode>(readTeamMode)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const queries = [window.matchMedia(WIDE_QUERY), window.matchMedia(MOBILE_QUERY)]
    const update = () => setMode(readTeamMode())
    queries.forEach((q) => q.addEventListener('change', update))
    return () => queries.forEach((q) => q.removeEventListener('change', update))
  }, [])
  return mode
}

const SIDE_LABELS: Record<SideTab, string> = { roster: 'Roster', categories: 'Categories', strategy: 'Strategy', teams: 'Teams' }
const SIDE_TABS: SideTab[] = ['roster', 'categories', 'strategy', 'teams']

/** Draft night control room: status strip, picker, recommendation hero and shortlist, my team. */
export function DraftScreen() {
  const sessionId = useDraftStore((s) => s.sessionId)
  const stateStatus = useDraftStore((s) => s.stateStatus)
  const stateError = useDraftStore((s) => s.stateError)
  const formatConfirmed = useDraftStore((s) => s.state?.format_confirmed ?? true)
  const scoringFormat = useDraftStore((s) => s.state?.league.scoring_format ?? '')
  const warnings = useDraftStore((s) => s.state?.warnings ?? NO_WARNINGS)
  const hasState = useDraftStore((s) => s.state !== null)
  const isComplete = useDraftStore((s) => s.state?.is_complete ?? false)
  const shortlistCount = useDraftStore((s) => (selectRecCurrent(s) && s.rec ? s.rec.shortlist.length : null))
  const playersStatus = useDraftStore((s) => s.playersStatus)
  const confirmFormat = useDraftStore((s) => s.confirmFormat)
  const refreshState = useDraftStore((s) => s.refreshState)
  const activePunts = useDraftStore((s) => Object.keys(s.state?.strategy.punts ?? {}).length)
  const [workTab, setWorkTab] = useState<WorkTab>('recommendations')
  const [sideTab, setSideTab] = useState<SideTab>('roster')
  const [pane, setPane] = useState<MobilePane>('picks')
  const [teamOpen, setTeamOpen] = useState(false)
  const teamMode = useTeamMode()
  const myCount = useDraftStore((s) => (s.state ? (s.state.rosters[s.state.league.user_manager_id] ?? []).length : 0))
  const remainingMine = useDraftStore((s) => s.state?.remaining_user_picks ?? 0)

  if (!sessionId) {
    return (
      <EmptyState title="No draft open" action={<a href={buildUrl('setup', null)}>Create a league or resume a saved draft</a>}>
        Picks are recorded against a session; start one in Setup.
      </EmptyState>
    )
  }
  if (stateStatus === 'error') {
    return (
      <ErrorState
        title={`Could not load draft ${sessionId}`}
        action={
          <>
            <button type="button" onClick={() => void refreshState()}>
              Try again
            </button>
            <a href={buildUrl('setup', null)}>Back to setup</a>
          </>
        }
      >
        {stateError}
      </ErrorState>
    )
  }
  if (!hasState) return <LoadingState title="Loading draft" />

  const strategyCount = activePunts > 0 ? `${activePunts} punt${activePunts > 1 ? 's' : ''}` : undefined
  const drawerMode = teamMode === 'drawer'
  const drawerOpen = drawerMode && teamOpen
  const openTeam = (tab: SideTab) => {
    setSideTab(tab)
    setTeamOpen(true)
  }
  const teamPanel: ReactNode = (
    <>
      <Segmented<SideTab>
        label="My team"
        value={sideTab}
        onChange={setSideTab}
        options={SIDE_TABS.map((id) => ({ id, label: SIDE_LABELS[id], testId: `tab-${id}`, count: id === 'strategy' ? strategyCount : undefined }))}
      />
      {sideTab === 'roster' && <RosterPanel />}
      {sideTab === 'categories' && <CategoryProfileTable />}
      {sideTab === 'strategy' && <StrategyPanel />}
      {sideTab === 'teams' && <TeamsPanel />}
    </>
  )
  // While the drawer is closed its tabs are not in the DOM, so the launcher carries their test ids (and shortcuts).
  const launcher = drawerMode ? (
    <div className="team-launch" role="group" aria-label="My team">
      <button type="button" className="small" aria-expanded={drawerOpen} aria-controls="team-drawer" data-testid={drawerOpen ? 'team-toggle' : 'tab-roster'} onClick={() => (drawerOpen ? setTeamOpen(false) : openTeam('roster'))}>
        My team · {myCount}/{myCount + remainingMine}
      </button>
      {!drawerOpen &&
        SIDE_TABS.slice(1).map((id) => (
          <button key={id} type="button" className="small ghost" data-testid={`tab-${id}`} onClick={() => openTeam(id)}>
            {SIDE_LABELS[id]}
            {id === 'strategy' && strategyCount ? <span className="count">{strategyCount}</span> : null}
          </button>
        ))}
    </div>
  ) : null

  return (
    <>
      <Scoreboard />
      <TechStatus />
      {(!formatConfirmed || warnings.length > 0 || isComplete) && (
        <div className="draft-notices">
          {!formatConfirmed && (
            <div className="callout warn" role="alert" data-testid="format-warning">
              Scoring format not confirmed: rankings assume <b>{scoringFormat}</b>.{' '}
              <button type="button" className="small" onClick={() => void confirmFormat()}>
                Confirm format
              </button>{' '}
              or change it in <a href={buildUrl('setup', sessionId)}>Setup</a>.
            </div>
          )}
          {warnings.length > 0 && (
            <div className="callout warn" role="status">
              {warnings.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
          )}
          {isComplete && (
            <div className="callout ok" role="status">
              Every pick is recorded. <a href={buildUrl('recap', sessionId)}>Open the recap</a> for final rosters and your category profile.
            </div>
          )}
        </div>
      )}
      <div className="mobile-tabs" role="tablist" aria-label="Sections">
        <button type="button" role="tab" aria-selected={pane === 'find'} onClick={() => setPane('find')}>
          Find player
        </button>
        <button type="button" role="tab" aria-selected={pane === 'picks'} onClick={() => setPane('picks')}>
          Best picks
        </button>
        <button type="button" role="tab" aria-selected={pane === 'mine'} onClick={() => setPane('mine')}>
          My team
        </button>
      </div>
      <div className="draft-grid" data-team={drawerMode ? (drawerOpen ? 'drawer-open' : 'drawer') : 'column'}>
        <aside className="col-picker" data-mobile-hidden={pane !== 'find'}>
          <PlayerPicker />
        </aside>
        <div className="col-work" data-mobile-hidden={pane !== 'picks'}>
          <RecommendationCard headerAside={launcher} />
          <section className="panel" aria-label="Player workspace">
            <Segmented<WorkTab>
              label="Workspace"
              value={workTab}
              onChange={setWorkTab}
              options={[
                { id: 'recommendations', label: 'Recommendations', count: shortlistCount ?? undefined, testId: 'tab-recommendations' },
                { id: 'players', label: 'All players', count: playersStatus === 'loading' ? 'loading…' : undefined, testId: 'tab-players' },
              ]}
            />
            {workTab === 'recommendations' ? <ShortlistTable /> : <AllPlayersTable />}
          </section>
        </div>
        {drawerMode ? (
          <Drawer open={drawerOpen} onClose={() => setTeamOpen(false)} title="My team" modal={false} className="team-drawer" testId="team-drawer">
            <div id="team-drawer">{teamPanel}</div>
          </Drawer>
        ) : (
          <aside className="col-side" data-mobile-hidden={pane !== 'mine'}>
            <section className="panel" aria-label="My team and strategy">
              {teamPanel}
            </section>
          </aside>
        )}
      </div>
      <HistoryDrawer />
      <div style={{ marginTop: 16 }}>
        <HowItWorks />
      </div>
      <PlayerDrawer />
      <CompareView />
    </>
  )
}
