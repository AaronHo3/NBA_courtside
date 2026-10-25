import type { LucideIcon } from 'lucide-react'
import type { Crumb } from '@/store/crumb'
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
      { id: 'season', label: 'My league', hint: 'Matchups, power, free agents, results', icon: Users, to: '#/season', fantasy: true, afterDraft: true },
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

export type SeasonTabId = 'matchups' | 'power' | 'free-agents' | 'results' | 'predictions'

/** The "My league" views: sidebar sub-items, the SeasonScreen tabs and the breadcrumb all read this. */
export const SEASON_TABS: Array<{ id: SeasonTabId; label: string }> = [
  { id: 'matchups', label: 'Matchups' },
  { id: 'power', label: 'Power rankings' },
  { id: 'free-agents', label: 'Free agents' },
  { id: 'results', label: 'Results' },
  { id: 'predictions', label: 'Track record' },
]

/** A `tab` query value as a season tab, falling back to the first (matchups). */
export function seasonTabFrom(raw: string | null | undefined): SeasonTabId {
  return SEASON_TABS.find((t) => t.id === raw)?.id ?? SEASON_TABS[0].id
}

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)

/** Full href for an item; fantasy items carry the active session id in the query string. */
export function navHref(item: NavItem, sessionId: string | null): string {
  if (!item.fantasy) return item.to
  const q = sessionId ? `?session=${encodeURIComponent(sessionId)}` : ''
  return `/fantasy${q}${item.to}`
}

const fantasyRoute = (hash: string) => hash.replace(/^#\/?/, '').split('?')[0] || 'draft'

/** Which item is active for a location. Fantasy routes compare the hash route; season tabs all belong to "My league". */
export function activeNavId(pathname: string, hash: string): string | null {
  if (pathname.startsWith('/fantasy')) {
    const route = fantasyRoute(hash)
    const hit = ALL_NAV_ITEMS.find((i) => i.fantasy && i.to.replace(/^#\//, '').split('?')[0] === route)
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

/** Breadcrumb labels below the group for a fantasy hash: `['My league', 'Matchups']`, `['Performers']`. */
export function fantasyCrumbs(hash: string): string[] {
  const item = navItemById(activeNavId('/fantasy', hash))
  if (!item) return []
  if (item.id !== 'season') return [item.label]
  const tab = seasonTabFrom(new URLSearchParams(hash.split('?')[1] ?? '').get('tab'))
  return [item.label, SEASON_TABS.find((t) => t.id === tab)!.label]
}

/** Breadcrumb segment as the shell renders it; `href` only on segments that lead somewhere else. */
export type ShellCrumb = { label: string; href?: string; fantasy?: boolean }

/**
 * The shell's breadcrumb: group label › item label › page parts. Fantasy routes take their tail from
 * the hash (the season tab); research detail pages supply theirs (`Players › LeBron James`), which
 * then stands in for the item label. `title` is the last segment, or null when nothing matched.
 */
export function buildBreadcrumb(pathname: string, hash: string, parts: Crumb[], sessionId: string | null): { crumbs: ShellCrumb[]; title: string | null } {
  const activeId = activeNavId(pathname, hash)
  const item = navItemById(activeId)
  const group = navGroupOf(activeId)
  const head: ShellCrumb[] = group?.label ? [{ label: group.label }] : []
  let tail: ShellCrumb[]
  if (pathname.startsWith('/fantasy')) {
    const labels = fantasyCrumbs(hash)
    tail = labels.map((label, i) => (i === 0 && labels.length > 1 && item ? { label, href: navHref(item, sessionId), fantasy: true } : { label }))
  } else if (parts.length) {
    tail = parts.map((p) => ({ label: p.label, href: p.to }))
  } else {
    tail = item ? [{ label: item.label }] : []
  }
  if (!tail.length) return { crumbs: [...head, { label: 'Courtside' }], title: null }
  return { crumbs: [...head, ...tail], title: tail[tail.length - 1].label }
}
