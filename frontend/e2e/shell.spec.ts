import { expect, test } from '@playwright/test'

test.describe('app shell', () => {
  test('loads, labels demo data when serving it, and exposes the global season picker', async ({ page }) => {
    const status = await (await page.request.get('/api/analytics/meta/status')).json()
    await page.goto('/')
    if (status.data.is_demo) await expect(page.getByRole('status')).toContainText('Demo data')
    else await expect(page.getByRole('status')).toHaveCount(0)
    await expect(page.getByRole('combobox', { name: 'Season', exact: true })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Season type' })).toHaveValue('Regular Season')
    await expect(page.getByRole('navigation', { name: 'Primary' }).first()).toBeVisible()
  })

  test('season choice is written to the URL so views are shareable', async ({ page }) => {
    await page.goto('/')
    const season = page.getByRole('combobox', { name: 'Season', exact: true })
    await expect(season).not.toHaveValue('')
    const options = await season.locator('option').allTextContents()
    await season.selectOption(options[1])
    await expect(page).toHaveURL(new RegExp(`season=${options[1]}`))
  })

  test('player search opens a profile', async ({ page }) => {
    await page.goto('/')
    const input = page.locator('#global-player-search')
    await input.fill('a')
    const first = page.getByRole('option').first()
    await expect(first).toBeVisible()
    await first.click()
    await expect(page).toHaveURL(/\/players\/\d+/)
  })
})
