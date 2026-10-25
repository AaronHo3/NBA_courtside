import { expect, test } from '@playwright/test'

/** Statistics -> shortlist -> draft report (scouting C-06). Works on demo and real data. */
test.describe('scouting workspace', () => {
  test('rank candidates for a role, save a shortlist, draft a report', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const status = await (await page.request.get('/api/analytics/meta/status')).json()
    const season = status.data.default_season as string
    await page.goto(`/scouting?season=${encodeURIComponent(season)}&role=rebounding_interior_player&min_gp=5&min_min=100`)
    await expect(page.getByRole('heading', { name: 'Scouting workspace' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Role template' })).toHaveValue('rebounding_interior_player')
    const rows = page.locator('tbody tr[data-index]')
    await expect(rows.first()).toBeVisible()
    await expect(page.getByText(/Eligible/).first()).toBeVisible()

    const name = `e2e ${Date.now()}`
    await page.getByLabel('New shortlist name').fill(name)
    await page.getByRole('button', { name: 'Save top 20 as shortlist' }).click()
    const drawer = page.getByTestId('shortlist-drawer')
    await expect(drawer.getByText(/players ·/)).toBeVisible()
    await expect(page).toHaveURL(/shortlist=[0-9A-Z]{26}/)

    await drawer.getByRole('button', { name: 'Draft report' }).click()
    await expect(page).toHaveURL(/\/scouting\/reports\/[0-9A-Z]{26}/)
    await expect(page.getByText('Statistical measurements')).toBeVisible()
    await expect(page.getByText(/No reviewed observations are available/)).toBeVisible()
    await expect(page.getByText(/deterministic draft, no language model/)).toBeVisible()

    await page.getByLabel('Claim text').fill('closes out hard')
    await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('reviewed_observation')
    await page.getByRole('button', { name: 'Add claim' }).click()
    const claims = page.getByTestId('claim-list')
    await expect(claims.getByText(/downgraded from reviewed observation/)).toBeVisible()
    expect(errors).toEqual([])
  })

  test('player profile shows the scouting panel with traits kept by class', async ({ page }) => {
    const status = await (await page.request.get('/api/analytics/meta/status')).json()
    const season = status.data.default_season as string
    const hit = (await (await page.request.get('/api/analytics/players/search?q=a&limit=1')).json()).data[0]
    await page.goto(`/players/${hit.player_id}?season=${encodeURIComponent(season)}`)
    await page.getByRole('tab', { name: 'Advanced' }).click()
    await expect(page.getByText(/What does the scouting profile say/)).toBeVisible()
    await expect(page.getByText('Reviewed observations', { exact: true })).toBeVisible()
  })
})
