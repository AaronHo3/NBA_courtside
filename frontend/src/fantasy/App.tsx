import { useEffect, type ReactNode } from 'react'
import { Notices } from './components/common/Notices'
import { navigate, useLocation } from './lib/router'
import { browserStorage, SESSION_KEY } from './lib/storage'
import { DraftScreen } from './screens/DraftScreen'
import { HealthScreen } from './screens/HealthScreen'
import { PerformersScreen } from './screens/PerformersScreen'
import { RecapScreen } from './screens/RecapScreen'
import { SeasonScreen } from './screens/SeasonScreen'
import { SetupScreen } from './screens/SetupScreen'
import { useDraftStore } from './store/draftStore'

/**
 * The copilot's screens. Navigation and session context live in the Courtside shell
 * (frontend/src/components/layout/AppShell.tsx); this component only restores the session and
 * picks the screen from the hash route.
 */
export default function App() {
  const loc = useLocation()
  const sessionId = useDraftStore((s) => s.sessionId)
  const loadSession = useDraftStore((s) => s.loadSession)
  const isComplete = useDraftStore((s) => s.state?.is_complete ?? false)

  // Restore the session from ?session= or, failing that, from localStorage.
  useEffect(() => {
    const fromUrl = loc.sessionId
    const stored = browserStorage.get(SESSION_KEY)
    const id = fromUrl ?? stored
    if (id && id !== sessionId) void loadSession(id)
    if (!fromUrl && stored && loc.route !== 'setup') navigate(loc.route, stored, true)
  }, [loc.sessionId, loc.route, sessionId, loadSession])

  let screen: ReactNode
  switch (loc.route) {
    case 'setup':
      screen = <SetupScreen />
      break
    case 'health':
      screen = <HealthScreen />
      break
    case 'recap':
      screen = <RecapScreen />
      break
    case 'season':
      screen = <SeasonScreen />
      break
    case 'performers':
      screen = <PerformersScreen />
      break
    default:
      screen = isComplete ? <RecapScreen /> : <DraftScreen />
  }

  return (
    <div className="app-main embedded" id="main">
      {screen}
      <Notices />
    </div>
  )
}
