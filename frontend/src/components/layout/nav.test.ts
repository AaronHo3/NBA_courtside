import { activeNavId, navHref, navItemById, NAV_GROUPS } from './nav'

describe('nav', () => {
  it('builds fantasy hrefs with the session in the query and the route in the hash', () => {
    const draft = navItemById('draft')!
    expect(navHref(draft, 'abc')).toBe('/fantasy?session=abc#/draft')
    expect(navHref(draft, null)).toBe('/fantasy#/draft')
    expect(navHref(navItemById('explorer')!, 'abc')).toBe('/explorer')
  })
  it('resolves the active item from pathname and hash', () => {
    expect(activeNavId('/', '')).toBe('overview')
    expect(activeNavId('/explorer', '')).toBe('explorer')
    expect(activeNavId('/players/2544', '')).toBe('explorer')
    expect(activeNavId('/teams/1610612747', '')).toBe('teams')
    expect(activeNavId('/fantasy', '#/season?tab=power&week=3')).toBe('season')
    expect(activeNavId('/fantasy', '#/season?tab=matchups')).toBe('league-matchups')
    expect(activeNavId('/fantasy', '')).toBe('draft')
    expect(activeNavId('/fantasy', '#/health')).toBe('health')
    expect(activeNavId('/nowhere', '')).toBeNull()
  })
  it('keeps the two matchup pages distinguishable', () => {
    const labels = NAV_GROUPS.flatMap((g) => g.items.map((i) => `${g.label ?? ''}:${i.label}`))
    expect(labels).toContain('NBA research:Matchups')
    expect(labels).toContain('Fantasy:League matchups')
  })
})
