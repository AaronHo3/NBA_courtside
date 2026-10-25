// Captures representative Courtside screens at several viewports for visual review.
//
//   node scripts/capture-screens.mjs --session <id> --out <dir> [--viewports 1440x900,390x844]
//        [--theme dark|light] [--reduced-motion] [--pages overview,explorer,...] [--full-page]
//
// Needs `make dev` running. Each capture is named <page>-<width>x<height>-<theme>.png and the script
// reports pages whose document is wider than the viewport (accidental horizontal overflow).
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]] : [])).filter((p) => p.length))
const BASE = args.base ?? 'http://127.0.0.1:5173'
const SESSION = args.session ?? null
const OUT = resolve(args.out ?? '../docs/media/review')
const THEME = args.theme === 'light' ? 'light' : 'dark'
const REDUCED = Boolean(args['reduced-motion'])
const FULL = Boolean(args['full-page'])
const VIEWPORTS = String(args.viewports ?? '1440x900,1280x800,768x1024,390x844')
  .split(',')
  .map((v) => v.split('x').map(Number))
  .map(([width, height]) => ({ width, height }))
mkdirSync(OUT, { recursive: true })

const f = (hash) => `/fantasy${SESSION ? `?session=${SESSION}` : ''}${hash}`
const PAGES = {
  overview: { path: '/' },
  explorer: { path: '/explorer', after: async (p) => p.getByRole('button', { name: 'Volume vs efficiency' }).click() },
  player: { path: '/players/1628976' },
  shooting: { path: '/shooting', after: async (p) => { const b = p.getByRole('button', { name: /^Load / }); if (await b.count()) await b.first().click() } },
  matchups: { path: '/matchups?player=1628983' },
  rankings: { path: '/rankings' },
  scouting: { path: '/scouting' },
  teams: { path: '/teams' },
  compare: { path: '/compare' },
  games: { path: '/games' },
  evidence: { path: '/evidence' },
  methodology: { path: '/methodology' },
  draft: { path: f('#/draft') },
  recap: { path: f('#/recap') },
  'season-matchups': { path: f('#/season?tab=matchups'), wait: '[data-testid="featured-matchup"]' },
  'season-power': { path: f('#/season?tab=power'), wait: '[data-testid="power-table"] tbody tr:nth-child(3)' },
  'season-free-agents': { path: f('#/season?tab=free-agents'), wait: 'table[aria-label="Free agents"] tbody tr' },
  'season-results': { path: f('#/season?tab=results') },
  performers: { path: f('#/performers'), wait: 'text=Leading contributor' },
  setup: { path: f('#/setup') },
}
const wanted = args.pages ? String(args.pages).split(',') : Object.keys(PAGES)

const browser = await chromium.launch()
const overflow = []
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: vp, colorScheme: THEME, reducedMotion: REDUCED ? 'reduce' : 'no-preference' })
  await context.addInitScript(({ sid, theme }) => {
    try {
      if (sid) window.localStorage.setItem('copilot.session', sid)
      window.localStorage.setItem('theme', theme)
    } catch { /* storage blocked */ }
  }, { sid: SESSION, theme: THEME })
  const page = await context.newPage()
  for (const name of wanted) {
    const spec = PAGES[name]
    if (!spec) continue
    try {
      await page.goto(BASE + spec.path, { waitUntil: 'networkidle', timeout: 60_000 })
      if (spec.wait) await page.locator(spec.wait).first().waitFor({ timeout: 60_000 }).catch(() => {})
      if (spec.after) await spec.after(page).catch(() => {})
      await page.waitForTimeout(900)
      const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
      if (w[0] > w[1] + 1) overflow.push(`${name} @${vp.width}: document ${w[0]}px > viewport ${w[1]}px`)
      await page.screenshot({ path: `${OUT}/${name}-${vp.width}x${vp.height}-${THEME}.png`, fullPage: FULL })
      console.log(`${name} ${vp.width}x${vp.height} ${THEME}`)
    } catch (e) {
      console.log(`${name} ${vp.width}x${vp.height}: ${String(e).split('\n')[0]}`)
    }
  }
  await context.close()
}
await browser.close()
console.log(overflow.length ? `HORIZONTAL OVERFLOW:\n  ${overflow.join('\n  ')}` : 'no horizontal overflow')
