import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { Loading } from './components/ui'

const page = (loader: () => Promise<{ default: React.ComponentType }>) => {
  const C = lazy(loader)
  return (
    <Suspense fallback={<Loading />}>
      <C />
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: page(() => import('./pages/Overview')) },
      { path: 'explorer', element: page(() => import('./pages/LeagueExplorer')) },
      // The fantasy copilot keeps its hash routes (`/fantasy?session=<id>#/draft`) inside the shared shell.
      { path: 'fantasy', element: page(() => import('./fantasy/FantasyApp')) },
      { path: 'players/:playerId', element: page(() => import('./pages/PlayerProfile')) },
      { path: 'shooting', element: page(() => import('./pages/ShootingLab')) },
      { path: 'matchups', element: page(() => import('./pages/MatchupExplorer')) },
      { path: 'compare', element: page(() => import('./pages/Compare')) },
      { path: 'teams', element: page(() => import('./pages/Teams')) },
      { path: 'teams/:teamId', element: page(() => import('./pages/TeamDetail')) },
      { path: 'rankings', element: page(() => import('./pages/Rankings')) },
      { path: 'scouting', element: page(() => import('./pages/Scouting')) },
      { path: 'scouting/shortlists/:shortlistId', element: page(() => import('./pages/ShortlistDetail')) },
      { path: 'scouting/reports/:reportId', element: page(() => import('./pages/ReportView')) },
      { path: 'games', element: page(() => import('./pages/Games')) },
      { path: 'evidence', element: page(() => import('./pages/EvidenceLibrary')) },
      { path: 'evidence/:assetId', element: page(() => import('./pages/EvidenceAsset')) },
      { path: 'games/:gameId', element: page(() => import('./pages/GameDetail')) },
      { path: 'methodology', element: page(() => import('./pages/Methodology')) },
      { path: '*', element: page(() => import('./pages/NotFound')) },
    ],
  },
])
