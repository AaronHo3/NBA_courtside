import { activeNavId, buildBreadcrumb, fantasyCrumbs, navHref, navItemById, NAV_GROUPS, SEASON_TABS } from './nav'

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
    expect(activeNavId('/fantasy', '#/season?tab=matchups')).toBe('season')
    expect(activeNavId('/fantasy', '')).toBe('draft')
    expect(activeNavId('/fantasy', '#/health')).toBe('health')
    expect(activeNavId('/nowhere', '')).toBeNull()
  })
  it('has one fantasy league item; the season tabs are its sub-items', () => {
    const fantasy = NAV_GROUPS.find((g) => g.id === 'fantasy')!
    expect(fantasy.items.map((i) => i.id)).toEqual(['draft', 'recap', 'season', 'performers', 'setup'])
    expect(navItemById('season')).toMatchObject({ label: 'My league', to: '#/season' })
    expect(navItemById('league-matchups')).toBeUndefined()
    expect(SEASON_TABS.map((t) => t.id)).toEqual(['matchups', 'power', 'free-agents', 'results', 'predictions'])
  })
  it('names fantasy crumbs from the hash', () => {
    expect(fantasyCrumbs('#/season?tab=free-agents')).toEqual(['My league', 'Free agents'])
    expect(fantasyCrumbs('#/season?tab=matchups')).toEqual(['My league', 'Matchups'])
    expect(fantasyCrumbs('#/season')).toEqual(['My league', 'Matchups'])
    expect(fantasyCrumbs('#/season?tab=bogus')).toEqual(['My league', 'Matchups'])
    expect(fantasyCrumbs('#/performers?team=m05')).toEqual(['Performers'])
    expect(fantasyCrumbs('#/draft')).toEqual(['Draft'])
    expect(fantasyCrumbs('')).toEqual(['Draft'])
  })
  it('builds the shell breadcrumb and title from the location and page parts', () => {
    expect(buildBreadcrumb('/fantasy', '#/season?tab=power', [], 's1')).toEqual({
      crumbs: [{ label: 'Fantasy' }, { label: 'My league', href: '/fantasy?session=s1#/season', fantasy: true }, { label: 'Power rankings' }],
      title: 'Power rankings',
    })
    expect(buildBreadcrumb('/fantasy', '#/performers', [{ label: 'ignored' }], 's1').title).toBe('Performers')
    expect(buildBreadcrumb('/players/2544', '', [{ label: 'Players', to: '/explorer' }, { label: 'LeBron James' }], null)).toEqual({
      crumbs: [{ label: 'NBA research' }, { label: 'Players', href: '/explorer' }, { label: 'LeBron James' }],
      title: 'LeBron James',
    })
    expect(buildBreadcrumb('/explorer', '', [], null)).toEqual({ crumbs: [{ label: 'NBA research' }, { label: 'Explorer' }], title: 'Explorer' })
    expect(buildBreadcrumb('/', '', [], null)).toEqual({ crumbs: [{ label: 'Overview' }], title: 'Overview' })
    expect(buildBreadcrumb('/nowhere', '', [], null)).toEqual({ crumbs: [{ label: 'Courtside' }], title: null })
  })
})
