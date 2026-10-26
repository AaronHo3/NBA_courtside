import { expect, test, type Page } from '@playwright/test'

/**
 * Redesign v2 layout checks against the running dev stack (`make dev`):
 *  - on an in-progress draft at 1280x800 the recommendation's draft action and the player's name are in
 *    the first screen (no scrolling to act on the pick);
 *  - the five main pages never scroll sideways at desktop or phone width.
 * The draft session is created through Setup (as the demo tour does) and deleted afterwards.
 */
const SEASON_SESSION = process.env.REDESIGN_SEASON_SESSION ?? 'demo9fc7b974'
let draftSession: string | null = null

async function createDraft(page: Page): Promise<string> {
  await page.goto('/fantasy#/setup')
  await page.getByTestId('setup-league-name').fill('Redesign check draft')
  await page.getByTestId('setup-confirm-format').check()
  await page.getByTestId('setup-create').click()
  await page.waitForURL(/\?session=[a-z0-9]+#\/draft/, { timeout: 30_000 })
  await page.getByTestId('rec-name').waitFor({ timeout: 30_000 })
  // Two picks so the board, undo and roster are in their in-progress shape.
  for (let i = 0; i < 2; i += 1) {
    await page.locator('[data-testid="picker-row"][data-drafted="false"]').first().waitFor()
    await page.locator('body').press('/')
    await page.getByTestId('picker-search').press('Enter')
    await page.getByTestId('confirm-pick-dialog').waitFor()
    await page.getByTestId('picker-search').press('Enter')
    await page.getByTestId('confirm-pick-dialog').waitFor({ state: 'hidden' })
    await page.getByTestId('top-save-status').filter({ hasText: 'saved' }).waitFor({ timeout: 20_000 })
  }
  const id = new URL(page.url()).searchParams.get('session')
  if (!id) throw new Error('setup did not open a session')
  return id
}

async function expectNoSideScroll(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  expect(scroll, `${path} scrollWidth ${scroll} > innerWidth ${inner}`).toBeLessThanOrEqual(inner)
}

test.describe('redesign v2 layout', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ viewport: { width: 1280, height: 800 } })

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    page.on('dialog', (d) => void d.accept())
    draftSession = await createDraft(page)
    await page.close()
  })

  test.afterAll(async ({ request }) => {
    if (draftSession) await request.delete(`/api/fantasy/sessions/${draftSession}`)
  })

  test('the recommendation and its draft action are in the first screen at 1280x800', async ({ page }) => {
    await page.goto(`/fantasy?session=${draftSession}#/draft`, { waitUntil: 'networkidle' })
    const draft = page.getByTestId('rec-draft')
    await expect(draft).toBeVisible()
    await expect(page.getByTestId('rec-name')).toBeInViewport()
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    const box = await draft.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y + box!.height).toBeLessThanOrEqual(720)
  })

  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    test(`the five main pages do not scroll sideways at ${viewport.width}px`, async ({ page, request }) => {
      await page.setViewportSize(viewport)
      const search = await (await request.get('/api/analytics/players/search?q=a')).json()
      const playerId = search.data?.[0]?.player_id
      const season = await request.get(`/api/fantasy/sessions/${SEASON_SESSION}`)
      const paths = [
        '/',
        '/explorer',
        playerId ? `/players/${playerId}` : null,
        `/fantasy?session=${draftSession}#/draft`,
        season.ok() ? `/fantasy?session=${SEASON_SESSION}#/season?tab=free-agents` : `/fantasy?session=${draftSession}#/season`,
      ].filter((p): p is string => p !== null)
      expect(paths).toHaveLength(5)
      for (const path of paths) await expectNoSideScroll(page, path)
    })
  }
})
