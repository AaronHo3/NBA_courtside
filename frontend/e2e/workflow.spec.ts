import { expect, test, type Page } from '@playwright/test'

const SEASON = '2025-26'

async function noConsoleErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  // Image CDNs (headshots, logos) are outside the app; a blocked image is not an application error.
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()) })
  return errors
}

test.describe('core research workflow', () => {
  test('filter the league explorer and open a player profile', async ({ page }) => {
    const errors = await noConsoleErrors(page)
    await page.goto(`/explorer?season=${SEASON}`)
    await expect(page.getByRole('heading', { name: 'Who does what, league-wide?' })).toBeVisible()
    // population filters sit in a collapsed disclosure above the chart toolbar
    await page.getByTestId('explorer-population').locator('summary').click()
    await page.getByRole('combobox', { name: 'Position' }).selectOption('C')
    await expect(page).toHaveURL(/pos=C/)
    const rows = page.locator('tbody tr[data-index]')
    await expect(rows.first()).toBeVisible()
    await expect(rows.first()).toContainText(/C/)
    // a click only selects the row (sel= in the URL); the selection strip opens the profile
    await rows.first().click()
    await expect(page).toHaveURL(/\/explorer\?.*sel=\d+/)
    await page.getByTestId('explorer-selection').getByRole('link', { name: 'Open profile →' }).click()
    await expect(page).toHaveURL(/\/players\/\d+/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.getByRole('tab', { name: 'Advanced' }).click()
    await expect(page.getByText(/Roster heights are usually listed with shoes/)).toBeVisible()
    expect(errors).toEqual([])
  })

  test('build a comparison group from the explorer and compare', async ({ page }) => {
    await page.goto(`/explorer?season=${SEASON}`)
    const addButtons = page.getByRole('button', { name: /^Add .* to comparison$/ })
    await expect(addButtons.first()).toBeVisible()
    await addButtons.nth(0).click()
    await addButtons.nth(0).click() // after the first add, nth(0) is the next un-added row
    await expect(page.getByRole('button', { name: 'Compare · 2/6' })).toBeVisible()
    await page.getByRole('button', { name: 'Compare · 2/6' }).click()
    await page.getByRole('dialog', { name: 'Comparison group' }).getByRole('link', { name: 'Open comparison' }).click()
    await expect(page).toHaveURL(/\/compare\?ids=\d+,\d+/)
    await expect(page.getByRole('heading', { name: 'How do these players stack up?' })).toBeVisible()
    await expect(page.getByLabel('Players in this comparison').getByRole('button', { name: /Remove .* from comparison/ })).toHaveCount(2)
    await expect(page.getByText(/Rank 1 of 2|best/i).first()).toBeVisible({ timeout: 15_000 })
  })

  test('export the filtered explorer rows as CSV', async ({ page }) => {
    await page.goto(`/explorer?season=${SEASON}&pos=G`)
    const link = page.getByRole('link', { name: 'Export CSV' })
    await expect(link).toBeVisible()
    const href = await link.getAttribute('href')
    expect(href).toContain('/api/analytics/league/explorer.csv')
    expect(href).toContain('position=G')
    const res = await page.request.get(href!)
    expect(res.ok()).toBeTruthy()
    expect(res.headers()['content-type']).toContain('text/csv')
    const text = await res.text()
    const [header, firstRow] = text.split('\n')
    expect(header).toContain('ts_pct')
    expect(firstRow.length).toBeGreaterThan(10)
  })

  test('shooting lab renders the court and selecting a bin filters the shot table', async ({ page }) => {
    const errors = await noConsoleErrors(page)
    await page.goto(`/shooting?season=${SEASON}`)
    await page.getByRole('button', { name: /^Load / }).click()
    await expect(page).toHaveURL(/player=\d+/)
    const bins = page.getByRole('button', { name: / bin, / })
    await expect(bins.first()).toBeVisible()
    expect(await bins.count()).toBeGreaterThan(20)
    await bins.first().click()
    await expect(page).toHaveURL(/sel=h/)
    await expect(page.getByText('Wilson', { exact: false }).first()).toBeVisible()
    expect(errors).toEqual([])
  })

  test('matchups and rankings explain their methods', async ({ page }) => {
    await page.goto(`/rankings?season=${SEASON}&lens=balanced`)
    await expect(page.getByText(/user-defined index/i).first()).toBeVisible()
    await expect(page.locator('tbody tr[data-index]').first()).toBeVisible()
    await page.goto(`/matchups?season=2015-16`)
    await expect(page.getByText(/no matchup data|does not generate|matchups from 2017-18/i).first()).toBeVisible()
  })

  test('methodology shows data status and coverage', async ({ page }) => {
    await page.goto(`/methodology?season=${SEASON}`)
    await expect(page.getByText(/demo/i).first()).toBeVisible()
    await expect(page.locator('#coverage')).toBeVisible()
    await expect(page.getByText('make ingest', { exact: false }).first()).toBeVisible()
  })
})
