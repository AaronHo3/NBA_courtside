// Records a scripted tour of Courtside for the README: a video plus one screenshot per step.
//
// Usage (with `make dev` running and a sanitized demo session in the fantasy store):
//   node scripts/demo-tour.mjs --session <sessionId> --out ../docs/media/raw [--short]
//
// `--short` records only the fantasy highlights (used for the README GIF). The script never touches
// the real league: point it at a session whose manager and team names are already pseudonymous.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]] : [])).filter((p) => p.length))
const BASE = args.base ?? 'http://127.0.0.1:5173'
const SESSION = args.session
const OUT = resolve(args.out ?? '../docs/media/raw')
const SHORT = Boolean(args.short)
if (!SESSION) {
  console.error('missing --session <id>')
  process.exit(1)
}
mkdirSync(OUT, { recursive: true })

const VIEWPORT = { width: 1440, height: 900 }
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: VIEWPORT,
  colorScheme: 'dark',
  recordVideo: { dir: OUT, size: VIEWPORT },
  reducedMotion: 'no-preference',
})
await context.addInitScript((sid) => {
  try {
    window.localStorage.setItem('copilot.session', sid)
  } catch {
    /* storage blocked: the tour still works, the overview just shows no session */
  }
}, SESSION)
const page = await context.newPage()
// The Setup table and session picker list every local session, private leagues included: the tour only
// ever shows the sanitized session and the practice draft it creates.
await page.route((u) => new URL(u.href).pathname === '/api/fantasy/sessions', async (r) => {
  if (r.request().method() !== 'GET') return r.continue()
  const res = await r.fetch()
  const rows = await res.json()
  await r.fulfill({ response: res, json: rows.filter((s) => s.id === SESSION || s.name === 'Portfolio demo draft') })
})
page.on('dialog', (d) => void d.accept())
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

const marks = []
const t0 = Date.now()
let n = 0
const pause = (ms) => page.waitForTimeout(ms)
async function shot(name) {
  n += 1
  const file = `${String(n).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: `${OUT}/${file}` })
  marks.push({ t: (Date.now() - t0) / 1000, name })
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${file}`)
}
async function go(path, wait = 'networkidle') {
  await page.goto(BASE + path, { waitUntil: wait, timeout: 60_000 })
  await pause(900)
}
async function scroll(px, steps = 6) {
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, px / steps)
    await pause(90)
  }
  await pause(700)
}
async function pickPlayer(input, query) {
  await input.click()
  await input.fill(query)
  const option = page.locator('[role="listbox"]:visible [role="option"]').first()
  await option.waitFor({ state: 'visible', timeout: 15_000 })
  await pause(500)
  await option.click()
  await page.waitForLoadState('networkidle')
  await pause(900)
}
const fantasy = (hash) => `/fantasy?session=${SESSION}${hash}`

// ------------------------------------------------------------------------------------------------
if (!SHORT) {
  // Research: every player on one plot
  await go('/explorer')
  await shot('explorer')
  await page.getByRole('button', { name: 'Volume vs efficiency' }).click()
  await pause(1200)
  await scroll(420)
  await shot('explorer-preset')

  // Player profile: eight seasons of a real player
  await go('/players/1628976')
  await shot('player-profile')
  await scroll(700)
  await shot('player-trends')
  await page.getByRole('tab', { name: 'Shooting' }).click()
  await page.waitForLoadState('networkidle')
  await pause(1200)
  await shot('player-shooting')

  // Shooting lab: hexbins for a full season
  await go('/shooting')
  const load = page.getByRole('button', { name: /^Load / })
  if (await load.count()) {
    await load.first().click()
    await page.waitForLoadState('networkidle')
    await pause(1500)
  }
  await shot('shooting-lab')
  await scroll(820)
  await shot('shooting-lab-zones')

  // Matchups: who guards whom
  await go('/matchups')
  await pickPlayer(page.getByPlaceholder('Search a player'), 'Shai Gilgeous')
  await shot('matchups')
  await scroll(600)
  await shot('matchups-detail')

  // Rankings and scouting
  await go('/rankings')
  await scroll(900)
  await shot('rankings')
  await go('/scouting')
  await scroll(700)
  await shot('scouting')

  // Live draft on real players: setup, five picks, a recommendation, draft it
  await go('/fantasy#/setup')
  await page.getByTestId('setup-league-name').fill('Portfolio demo draft')
  await page.getByTestId('setup-confirm-format').check()
  await shot('draft-setup')
  await page.getByTestId('setup-create').click()
  await page.waitForURL(/\?session=[a-z0-9]+#\/draft/, { timeout: 30_000 })
  await page.getByTestId('rec-name').waitFor({ timeout: 30_000 })
  await pause(1200)
  await shot('draft-start')
  for (let i = 0; i < 5; i += 1) {
    await page.locator('[data-testid="picker-results"]').waitFor()
    await page.locator('[data-testid="picker-row"][data-drafted="false"]').first().waitFor()
    await page.locator('body').press('/')
    await page.getByTestId('picker-search').press('Enter')
    await page.getByTestId('confirm-pick-dialog').waitFor()
    await pause(350)
    await page.getByTestId('picker-search').press('Enter')
    await page.getByTestId('confirm-pick-dialog').waitFor({ state: 'hidden' })
    await page.getByTestId('top-save-status').filter({ hasText: 'saved' }).waitFor({ timeout: 20_000 })
    await pause(250)
  }
  await page.getByTestId('rec-updating').waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {})
  await pause(1500)
  await shot('draft-on-the-clock')
  await scroll(500)
  await shot('draft-shortlist')
  await scroll(-500)
  await page.getByTestId('rec-draft').click()
  const dialog = page.getByTestId('confirm-pick-dialog')
  if (await dialog.isVisible().catch(() => false)) {
    await pause(600)
    await page.getByTestId('picker-search').press('Enter').catch(() => {})
  }
  await pause(1500)
  await shot('draft-picked')
}

// ------------------------------------------------------------------------------------------------
// The league, sanitized: overview, matchups, power, free agents with in-season minutes, performers
await go(fantasy('#/season?tab=matchups'))
await page.getByTestId('season-tab-matchups').click()
await page.getByTestId('featured-matchup').waitFor({ timeout: 60_000 })
await page.getByTestId('projected-winner').first().waitFor({ timeout: 60_000 })
await pause(1500)
await shot('season-matchups')
await scroll(650)
await shot('season-matchups-all')

await page.getByTestId('season-tab-power').click()
await page.getByTestId('power-table').waitFor({ timeout: 60_000 })
await page.getByTestId('power-table').getByRole('row').nth(3).waitFor({ timeout: 60_000 })
await pause(1500)
await shot('season-power')
await scroll(600)
await shot('season-power-profile')

await page.getByTestId('season-tab-free-agents').click()
const table = page.getByRole('table', { name: 'Free agents' })
await table.locator('tbody tr').first().waitFor({ timeout: 60_000 })
await pause(1200)
await shot('season-free-agents')
const carter = table.locator('tbody tr').filter({ hasText: 'Wendell Carter' }).first()
if (await carter.count()) {
  await carter.locator('td').first().click()
  await pause(1200)
}
await shot('season-swap')
await scroll(700)
await shot('season-free-agents-table')

if (!SHORT) {
  await page.getByTestId('season-tab-results').click()
  await pause(2000)
  await shot('season-results')
}

await go(fantasy('#/performers'))
await page.getByText('Leading contributor', { exact: false }).first().waitFor({ timeout: 60_000 })
await pause(1500)
await shot('performers')
await scroll(900)
await shot('performers-heatmap')

if (!SHORT) {
  await go('/')
  await pause(1500)
  await shot('overview')
  await go(fantasy('#/recap'))
  await pause(1200)
  await shot('recap')
  await scroll(800)
  await shot('recap-rosters')
}

await pause(1200)
const video = page.video()
await context.close()
await browser.close()
const videoPath = video ? await video.path() : null
console.log(JSON.stringify({ video: videoPath, marks, errors }, null, 1))
