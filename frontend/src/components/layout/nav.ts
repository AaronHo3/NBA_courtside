import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BarChart3,
  BookOpen,
  ClipboardList,
  Crosshair,
  Database,
  Film,
  GitCompare,
  Home,
  ListOrdered,
  Search,
  Settings,
  Shield,
  Swords,
  Trophy,
  Users,
} from 'lucide-react'

/** Where a sidebar item points. Fantasy items keep the copilot's hash-router URL format. */
export type NavItem = {
  id: string
  label: string
  hint: string
  icon: LucideIcon
  /** Pathname for NBA pages; for fantasy pages the hash route, e.g. `#/season?tab=matchups`. */
  to: string
  fantasy?: boolean
  /** Fantasy items that only make sense once a draft is complete. */
  afterDraft?: boolean
}

export type NavGroup = { id: string; label: string | null; items: NavItem[] }

export const NAV_GROUPS: NavGroup[] = [
  { id: 'overview', label: null, items: [{ id: 'overview', label: 'Overview', hint: 'Your league this week', icon: Home, to: '/' }] },
  {
    id: 'research',
    label: 'NBA research',
    items: [
      { id: 'explorer', label: 'Explorer', hint: 'Every player on one plot', icon: Crosshair, to: '/explorer' },
      { id: 'compare', label: 'Compare', hint: 'Up to six side by side', icon: GitCompare, to: '/compare' },
      { id: 'shooting', label: 'Shooting', hint: 'Shot charts and zones', icon: Activity, to: '/shooting' },
      { id: 'teams', label: 'Teams', hint: 'Rosters, lineups, on/off', icon: Shield, to: '/teams' },
      { id: 'matchups', label: 'Matchups', hint: 'Offender vs defender', icon: Swords, to: '/matchups' },
      { id: 'rankings', label: 'Rankings', hint: 'Transparent lenses', icon: ListOrdered, to: '/rankings' },
    ],
  },
  {
    id: 'scouting',
    label: 'Scouting & film',
    items: [
      { id: 'scouting', label: 'Scouting', hint: 'Roles, shortlists, reports', icon: Search, to: '/scouting' },
      { id: 'games', label: 'Games', hint: 'Play-by-play and clips', icon: BookOpen, to: '/games' },
      { id: 'evidence', label: 'Evidence', hint: 'Footage and annotations', icon: Film, to: '/evidence' },
    ],
  },
  {
    id: 'fantasy',
    label: 'Fantasy',
    items: [
      { id: 'draft', label: 'Draft', hint: 'Recommendations and board', icon: ClipboardList, to: '#/draft', fantasy: true },
      { id: 'recap', label: 'Recap', hint: 'Final rosters and profile', icon: Trophy, to: '#/recap', fantasy: true },
      { id: 'season', label: 'My league', hint: 'Power, free agents, results', icon: Users, to: '#/season', fantasy: true, afterDraft: true },
      { id: 'league-matchups', label: 'League matchups', hint: 'This week, by category', icon: Swords, to: '#/season?tab=matchups', fantasy: true, afterDraft: true },
      { id: 'performers', label: 'Performers', hint: 'Who carried your team', icon: BarChart3, to: '#/performers', fantasy: true, afterDraft: true },
      { id: 'setup', label: 'Setup', hint: 'Sessions, league, imports', icon: Settings, to: '#/setup', fantasy: true },
    ],
  },
  {
    id: 'data',
    label: 'Data & methods',
    items: [
      { id: 'methodology', label: 'Data & methods', hint: 'Sources, coverage, formulas', icon: Database, to: '/methodology' },
      { id: 'health', label: 'Fantasy data health', hint: 'Snapshots and provenance', icon: Database, to: '#/health', fantasy: true },
    ],
  },
]

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)

/** Full href for an item; fantasy items carry the active session id in the query string. */
export function navHref(item: NavItem, sessionId: string | null): string {
  if (!item.fantasy) return item.to
  const q = sessionId ? `?session=${encodeURIComponent(sessionId)}` : ''
  return `/fantasy${q}${item.to}`
}

/** Which item is active for a location. Fantasy routes compare the hash route (and `tab` for league matchups). */
export function activeNavId(pathname: string, hash: string): string | null {
  if (pathname.startsWith('/fantasy')) {
    const route = hash.replace(/^#\/?/, '').split('?')[0] || 'draft'
    const query = new URLSearchParams(hash.split('?')[1] ?? '')
    if (route === 'season' && query.get('tab') === 'matchups') return 'league-matchups'
    const hit = ALL_NAV_ITEMS.find((i) => i.fantasy && i.to.replace(/^#\//, '').split('?')[0] === route && !i.to.includes('?'))
    return hit?.id ?? null
  }
  if (pathname === '/') return 'overview'
  const first = '/' + pathname.split('/')[1]
  const hit = ALL_NAV_ITEMS.find((i) => !i.fantasy && i.to !== '/' && first === i.to)
  if (hit) return hit.id
  if (pathname.startsWith('/players')) return 'explorer'
  return null
}

export function navItemById(id: string | null): NavItem | undefined {
  return id ? ALL_NAV_ITEMS.find((i) => i.id === id) : undefined
}

export function navGroupOf(id: string | null): NavGroup | undefined {
  return id ? NAV_GROUPS.find((g) => g.items.some((i) => i.id === id)) : undefined
}
