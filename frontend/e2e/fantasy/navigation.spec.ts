import { expect, test, type Page } from '@playwright/test'

// Shell navigation on a drafted, linked demo session: the season tab lives in the URL, and the
// breadcrumb, document title and sidebar follow it (including back/forward and reload). Session
// setup mirrors season.spec.ts: demo league via the setup screen, draft completed via the event
// batch API, linked through the real link/apply endpoint, with the ESPN-backed reads mocked.

const LEAGUE_ID = 2075231076

type Manager = { id: string; name: string }

async function completeDraft(page: Page, sessionId: string) {
  const health = await (await page.request.get('/api/fantasy/health')).json()
  const players = await (await page.request.get(`/api/fantasy/snapshots/${health.default_snapshot_id}/players?limit=200`)).json()
  const state = await (await page.request.get(`/api/fantasy/sessions/${sessionId}/state`)).json()
  const items = state.schedule.map((p: { overall: number; manager_id: string }, i: number) => ({
    type: 'pick_committed',
    payload: { overall: p.overall, manager_id: p.manager_id, player_id: players[i].player_id },
    idempotency_key: `e2e-nav-pick-${p.overall}`,
  }))
  const res = await page.request.post(`/api/fantasy/sessions/${sessionId}/events/batch`, { data: { items, source: 'import' } })
  expect(res.ok()).toBeTruthy()
  const done = await res.json()
  expect(done.is_complete).toBe(true)
  return done
}

async function linkSession(page: Page, sessionId: string, managers: Manager[]) {
  const mapping = Object.fromEntries(managers.map((m, i) => [m.id, i + 1]))
  const res = await page.request.post(`/api/fantasy/sessions/${sessionId}/espn/link/apply`, { data: { league_id: LEAGUE_ID, mapping } })
  expect(res.ok()).toBeTruthy()
}

/** The ESPN-backed calls the season screen makes, answered locally (same shapes as season.spec.ts). */
async function mockEspn(page: Page, sessionId: string, managers: Manager[], userId: string) {
  await page.route('**/api/fantasy/sessions/*/espn/sync', async (route) => {
    const current = await (await page.request.get(`/api/fantasy/sessions/${sessionId}/state`)).json()
    await route.fulfill({
      json: {
        ids: { draft_revision: current.draft_revision, strategy_revision: 0, league_revision: current.league_revision, last_seq: current.last_seq, snapshot_id: 'x', projection_version: 'v', seed: 1 },
        fetched_at: '2026-10-19T04:00:00+00:00',
        summary: 'ESPN sync: 0 adds, 0 drops across 0 teams; 0 unknown players',
        changes: [],
        warnings: [],
        unknown_players: [],
        state: current,
      },
    })
  })
  await page.route('**/api/fantasy/sessions/*/season/overview*', async (route) => {
    const real = await route.fetch()
    const body = await real.json()
    if (!real.ok() || !body.league_categories) {
      await route.fulfill({ response: real })
      return
    }
    const opponent = managers.find((m) => m.id !== userId)!
    const odds = {
      period: 1, manager_a: userId, manager_b: opponent.id, expected_a: 5.1, expected_b: 2.9, p_win_a: 0.7, p_tie: 0.1, p_win_b: 0.2,
      cat_p_a: Object.fromEntries(body.league_categories.map((c: { key: string }) => [c.key, 0.66])), modal_score: [5, 3], games_a: 30, games_b: 28, notes: [],
    }
    const userPair = { period: 1, home_manager_id: userId, away_manager_id: opponent.id, odds }
    await route.fulfill({ json: { ...body, linked: true, league_name: 'Mock Thieves', synced_at: '2026-10-19T04:00:00+00:00', matchups: [userPair], user_matchup: userPair } })
  })
  await page.route('**/api/fantasy/sessions/*/season/results*', (route) =>
    route.fulfill({
      json: {
        ids: { draft_revision: 1, strategy_revision: 0, league_revision: 1, last_seq: 1, snapshot_id: 'x', projection_version: 'v', seed: 1 },
        period: 1,
        results: [],
        projected: [],
      },
    }),
  )
}

/** A fresh demo session, drafted and linked, with ESPN mocked on `page`. */
async function linkedSession(page: Page): Promise<string> {
  page.on('dialog', (d) => void d.accept())
  await page.goto('/fantasy')
  await page.getByTestId('setup-confirm-format').check()
  await page.getByTestId('setup-create').click()
  await expect(page).toHaveURL(/\?session=[a-z0-9]+#\/draft/)
  const sessionId = new URL(page.url()).searchParams.get('session') ?? ''
  const state = await completeDraft(page, sessionId)
  const managers: Manager[] = state.league.managers
  await linkSession(page, sessionId, managers)
  await mockEspn(page, sessionId, managers, state.league.user_manager_id)
  return sessionId
}

async function pickInPalette(page: Page, query: string, option: RegExp) {
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: 'Search players and pages' })
  await expect(palette).toBeVisible()
  await palette.getByRole('combobox', { name: 'Search players and pages' }).fill(query)
  await palette.getByRole('option', { name: option }).first().click()
  await expect(palette).toHaveCount(0)
}

const breadcrumb = (page: Page) => page.getByRole('navigation', { name: 'Breadcrumb' })
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Primary' })
const leagueViews = (page: Page) => sidebar(page).getByRole('list', { name: 'My league views' })

test('tab changes keep URL, breadcrumb, title and sidebar in step; back restores the previous tab everywhere', async ({ page }) => {
  const sid = await linkedSession(page)
  await page.goto(`/fantasy?session=${sid}#/season?tab=matchups`)
  await page.reload() // the batch and link happened outside the page; load them fresh
  await expect(page.getByTestId('season-tab-matchups')).toHaveAttribute('aria-selected', 'true')
  await expect(breadcrumb(page)).toContainText('My league')
  await expect(breadcrumb(page)).toContainText('Matchups')
  await expect(page).toHaveTitle('Matchups · Courtside')
  await expect(leagueViews(page).getByRole('link', { name: 'Matchups', exact: true })).toHaveAttribute('aria-current', 'page')

  await page.getByTestId('season-tab-power').click()
  await expect(page).toHaveURL(/#\/season\?tab=power/)
  await expect(breadcrumb(page)).toContainText('Power rankings')
  await expect(page).toHaveTitle(/Power rankings/)
  await expect(page.getByRole('link', { name: 'Power rankings' })).toHaveAttribute('aria-current', 'page')
  await expect(leagueViews(page).getByRole('link', { name: 'Matchups', exact: true })).not.toHaveAttribute('aria-current', 'page')

  await page.goBack()
  await expect(page).toHaveURL(/tab=matchups/)
  await expect(page.getByTestId('season-tab-matchups')).toHaveAttribute('aria-selected', 'true')
  await expect(breadcrumb(page)).toContainText('Matchups')
  await expect(page).toHaveTitle('Matchups · Courtside')
  await expect(leagueViews(page).getByRole('link', { name: 'Matchups', exact: true })).toHaveAttribute('aria-current', 'page')

  await page.goForward()
  await expect(page.getByTestId('season-tab-power')).toHaveAttribute('aria-selected', 'true')
  await expect(breadcrumb(page)).toContainText('Power rankings')

  // the sidebar sub-item drives the screen the same way
  await leagueViews(page).getByRole('link', { name: 'Free agents' }).click()
  await expect(page).toHaveURL(/#\/season\?tab=free-agents/)
  await expect(page.getByTestId('season-tab-free-agents')).toHaveAttribute('aria-selected', 'true')
  await expect(breadcrumb(page)).toContainText('Free agents')

  await page.goBack()
  await page.goBack()
  await page.reload()
  await expect(page.getByTestId('season-tab-matchups')).toHaveAttribute('aria-selected', 'true')
  await expect(breadcrumb(page)).toContainText('Matchups')
  // the old "League matchups" sidebar entry is folded into My league
  await expect(sidebar(page).getByRole('link', { name: 'League matchups' })).toHaveCount(0)
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

test('sidebar keeps the session when moving between fantasy screens and research pages', async ({ page }) => {
  const sid = await linkedSession(page)
  await page.goto(`/fantasy?session=${sid}#/season`)
  await page.reload()
  await expect(page.getByTestId('season')).toBeVisible()

  await sidebar(page).getByRole('link', { name: 'Performers' }).click()
  await expect(page).toHaveURL(new RegExp(`\\?session=${sid}#/performers`))
  await expect(page.getByTestId('performers')).toBeVisible()
  await expect(breadcrumb(page)).toContainText('Performers')
  await expect(page).toHaveTitle('Performers · Courtside')
  // My league is not active here, so its season sub-items are hidden
  await expect(sidebar(page).getByRole('link', { name: 'Power rankings' })).toHaveCount(0)

  await page.goto('/explorer')
  await expect(sidebar(page).getByRole('link', { name: 'Explorer' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('group', { name: 'NBA season' })).toBeVisible()
  await sidebar(page).getByRole('link', { name: 'My league' }).click()
  await expect(page).toHaveURL(new RegExp(`/fantasy\\?session=${sid}#/season`))
  await expect(page.getByTestId('season-tab-matchups')).toHaveAttribute('aria-selected', 'true')
  await expect(breadcrumb(page)).toContainText('Matchups')
  await expect(page.getByRole('group', { name: 'Fantasy context' })).toContainText('Mock Thieves')
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

test('player profile breadcrumb names the player', async ({ page }) => {
  const search = await (await page.request.get('/api/analytics/players/search?q=a&limit=5')).json()
  const hit: { player_id: number; full_name: string } = search.data[0]
  await page.goto(`/players/${hit.player_id}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(breadcrumb(page)).toContainText('NBA research')
  await expect(breadcrumb(page)).toContainText('Players')
  await expect(breadcrumb(page)).toContainText(hit.full_name)
  await expect(breadcrumb(page)).not.toContainText('Explorer')
  await expect(page).toHaveTitle(`${hit.full_name} · Courtside`)
  await expect(sidebar(page).getByRole('link', { name: 'Explorer' })).toHaveAttribute('aria-current', 'page')
})

test('command palette navigation from a research page into fantasy keeps breadcrumb, sidebar and title in step', async ({ page }) => {
  const sid = await linkedSession(page)
  await page.goto(`/fantasy?session=${sid}#/season`) // remembers the session for the shell
  await page.reload()
  await expect(page.getByTestId('season')).toBeVisible()

  const viaPalette = (query: string, option: RegExp) => pickInPalette(page, query, option)

  // React Router pushState: no hashchange/popstate fires, the shell must still follow the new hash
  await page.goto('/explorer')
  await expect(sidebar(page).getByRole('link', { name: 'Explorer' })).toHaveAttribute('aria-current', 'page')
  await viaPalette('My league', /^↗?\s*My league/)
  await expect(page).toHaveURL(new RegExp(`/fantasy\\?session=${sid}#/season`))
  await expect(page.getByTestId('season-tab-matchups')).toHaveAttribute('aria-selected', 'true')
  await expect(breadcrumb(page)).toContainText('My league')
  await expect(breadcrumb(page)).toContainText('Matchups')
  await expect(breadcrumb(page)).not.toContainText('Draft')
  await expect(page).toHaveTitle('Matchups · Courtside')
  await expect(leagueViews(page).getByRole('link', { name: 'Matchups', exact: true })).toHaveAttribute('aria-current', 'page')

  await page.goto('/explorer')
  await viaPalette('Performers', /^↗?\s*Performers/)
  await expect(page).toHaveURL(new RegExp(`/fantasy\\?session=${sid}#/performers`))
  await expect(page.getByTestId('performers')).toBeVisible()
  await expect(breadcrumb(page)).toContainText('Performers')
  await expect(page).toHaveTitle('Performers · Courtside')
  await expect(sidebar(page).getByRole('link', { name: 'Performers' })).toHaveAttribute('aria-current', 'page')
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

test('command palette jumps between fantasy screens switch the screen, URL, breadcrumb and sidebar together', async ({ page }) => {
  const sid = await linkedSession(page)
  await page.goto(`/fantasy?session=${sid}#/season?tab=power`)
  await page.reload()
  await expect(page.getByTestId('season-tab-power')).toHaveAttribute('aria-selected', 'true')

  // same pathname and search, only the hash changes: a React Router pushState with no hashchange
  await pickInPalette(page, 'Performers', /^↗?\s*Performers/)
  await expect(page.getByTestId('performers')).toBeVisible()
  await expect(page.getByTestId('season')).toHaveCount(0)
  expect(new URL(page.url()).hash).toBe('#/performers')
  await expect(breadcrumb(page)).toContainText('Performers')
  await expect(page).toHaveTitle('Performers · Courtside')
  await expect(sidebar(page).getByRole('link', { name: 'Performers' })).toHaveAttribute('aria-current', 'page')

  await pickInPalette(page, 'My league', /^↗?\s*My league/)
  await expect(page.getByTestId('season')).toBeVisible()
  await expect(page.getByTestId('performers')).toHaveCount(0)
  await expect(page.getByTestId('season-tab-matchups')).toHaveAttribute('aria-selected', 'true')
  expect(new URL(page.url()).hash).toBe('#/season')
  await expect(breadcrumb(page)).toContainText('Matchups')
  await expect(leagueViews(page).getByRole('link', { name: 'Matchups', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})
