import { expect, test } from '@playwright/test'

/** Event-linked evidence (scouting A-07). Skips the real-data parts when the pilot games are not ingested. */
test.describe('event-linked evidence', () => {
  test('games list opens a game page with its play-by-play', async ({ page }) => {
    const status = await (await page.request.get('/api/analytics/meta/status')).json()
    const season = status.data.default_season as string
    await page.goto(`/games?season=${encodeURIComponent(season)}`)
    await expect(page.getByRole('heading', { name: 'Games', exact: true })).toBeVisible()
    const rows = page.locator('tbody tr[data-index]')
    await expect(rows.first()).toBeVisible()
    await rows.first().click()
    await expect(page).toHaveURL(/\/games\/[0-9A-Z]\d{9}/)
    await expect(page.getByText('Play-by-play events')).toBeVisible()
  })

  test('shot detail shows the mapped event and an external clip reference for an ingested game', async ({ page }) => {
    const probe = await page.request.get('/api/analytics/games/0022400001')
    test.skip(probe.status() !== 200, 'pilot game 0022400001 is not ingested in this namespace')
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/games/0022400001?season=2024-25&fg=1')
    await expect(page.getByText('Play-by-play events')).toBeVisible()
    const rows = page.locator('tbody tr[data-index]')
    await expect(rows.first()).toBeVisible()
    await rows.first().click()
    await expect(page).toHaveURL(/ev=pbp_v3(:|%3A)\d+/)
    const detail = page.getByTestId('event-detail')
    await expect(detail).toBeVisible()
    const link = detail.getByRole('link', { name: /open on nba\.com/i })
    await expect(link).toHaveAttribute('href', /GameID=0022400001&GameEventID=\d+/)
    await expect(link).toHaveAttribute('target', '_blank')
    expect(errors).toEqual([])
  })

  test('shooting lab shot rows open the evidence panel', async ({ page }) => {
    const probe = await page.request.get('/api/analytics/games/0022400001')
    test.skip(probe.status() !== 200, 'pilot game 0022400001 is not ingested in this namespace')
    const events = await (await page.request.get('/api/analytics/games/0022400001/events?is_field_goal=true&limit=1')).json()
    const player = events.data[0].person_id as number
    await page.goto(`/shooting?season=2024-25&player=${player}&layer=markers`)
    // the shot table is the last table on the page (zones come first)
    const rows = page.locator('tbody tr[data-index]')
    await expect(rows.last()).toBeVisible()
    await rows.last().click()
    await expect(page).toHaveURL(/shot=\d{10}(:|%3A)\d+/)
    await expect(page.getByTestId('shot-evidence')).toBeVisible()
  })

  test('data & methods has a video coverage section', async ({ page }) => {
    await page.goto('/methodology#video-coverage')
    await expect(page.getByText('Which video evidence exists, and in what form?')).toBeVisible()
    await expect(page.getByText('Reference states:')).toBeVisible()
  })
})
