// Captures representative Courtside screens at several viewports for visual review.
//
//   node scripts/capture-screens.mjs --session <id> --out <dir> [--viewports 1440x900,390x844]
//        [--theme dark|light] [--reduced-motion] [--pages overview,explorer,...] [--full-page]
//        [--draft-session <id>] [--player <id>] [--block-images] [--variant <name>] [--states]
//
// Needs `make dev` running. Each capture is named <page>-<width>x<height>-<theme>[-<variant>].png and
// the script reports pages whose document is wider than the viewport (accidental horizontal overflow).
//
//   --draft-session  session used by the `draft` page (an in-progress draft made through Setup)
//   --player         player id for the `player` page (e.g. a long name for truncation checks)
//   --block-images   aborts cdn.nba.com / a.espncdn.com so headshot and logo fallbacks show (-noimg)
//   --reduced-motion emulates prefers-reduced-motion (-reduced)
//   --states         for overview and season-free-agents only: empty (a fresh unlinked session made
//                    through the API and deleted afterwards), loading (API delayed 3 s, shot at 1 s)
//                    and error (the page's season endpoint answers 500)
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]] : [])).filter((p) => p.length))
const BASE = args.base ?? 'http://127.0.0.1:5173'
const SESSION = args.session ?? null
const DRAFT_SESSION = args['draft-session'] ?? SESSION
const PLAYER = args.player ?? '1628976'
const OUT = resolve(args.out ?? '../docs/media/review')
const THEME = args.theme === 'light' ? 'light' : 'dark'
const REDUCED = Boolean(args['reduced-motion'])
const FULL = Boolean(args['full-page'])
const BLOCK_IMAGES = Boolean(args['block-images'])
const STATES = Boolean(args.states)
const VARIANT = [args.variant, REDUCED && 'reduced', BLOCK_IMAGES && 'noimg', FULL && 'full'].filter((v) => typeof v === 'string').join('-')
const VIEWPORTS = String(args.viewports ?? '1440x900,1280x800,768x1024,390x844')
  .split(',')
  .map((v) => v.split('x').map(Number))
  .map(([width, height]) => ({ width, height }))
const IMAGE_HOSTS = /^https?:\/\/(cdn\.nba\.com|a\.espncdn\.com)\//
// API calls only: a `**/api/**` glob would also match Vite module paths such as /src/fantasy/api/client.ts.
const API_URL = (u) => u.startsWith(`${BASE}/api/`)
mkdirSync(OUT, { recursive: true })

const f = (hash, sid = SESSION) => `/fantasy${sid ? `?session=${sid}` : ''}${hash}`
const PAGES = {
  overview: { path: () => '/', error: /\/api\/fantasy\/sessions\/[^/]+\/season\/overview/ },
  explorer: { path: () => '/explorer', after: async (p) => p.getByRole('button', { name: 'Volume vs efficiency' }).click() },
  player: { path: () => `/players/${PLAYER}` },
  shooting: { path: () => '/shooting', after: async (p) => { const b = p.getByRole('button', { name: /^Load / }); if (await b.count()) await b.first().click() } },
  matchups: { path: () => '/matchups?player=1628983' },
  rankings: { path: () => '/rankings' },
  scouting: { path: () => '/scouting' },
  teams: { path: () => '/teams' },
  compare: { path: () => '/compare' },
  games: { path: () => '/games' },
  evidence: { path: () => '/evidence' },
  methodology: { path: () => '/methodology' },
  draft: { path: () => f('#/draft', DRAFT_SESSION), wait: '[data-testid="rec-name"]' },
  recap: { path: (sid) => f('#/recap', sid) },
  'season-matchups': { path: (sid) => f('#/season?tab=matchups', sid), wait: '[data-testid="featured-matchup"]' },
  'season-power': { path: (sid) => f('#/season?tab=power', sid), wait: '[data-testid="power-table"] tbody tr:nth-child(3)' },
  'season-free-agents': { path: (sid) => f('#/season?tab=free-agents', sid), wait: 'table[aria-label="Free agents"] tbody tr', error: /\/api\/fantasy\/sessions\/[^/]+\/season\/free-agents/ },
  'season-results': { path: (sid) => f('#/season?tab=results', sid) },
  performers: { path: (sid) => f('#/performers', sid), wait: 'text=Leading contributor' },
  setup: { path: () => f('#/setup') },
}
const STATE_PAGES = ['overview', 'season-free-agents']
const wanted = (args.pages ? String(args.pages).split(',') : Object.keys(PAGES)).filter((n) => !STATES || STATE_PAGES.includes(n))

async function api(method, path, body) {
  const res = await fetch(`${BASE}/api/fantasy${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`)
  return res.status === 204 ? null : res.json()
}

// An unlinked session with the demo league's config and no logs: the honest empty state.
async function createEmptySession() {
  if (!SESSION) throw new Error('--states needs --session (its league config seeds the empty session)')
  const detail = await api('GET', `/sessions/${SESSION}`)
  // Drop the ESPN link so the session is genuinely unlinked (no league name, week or sync to show).
  const { espn_league_id: _id, espn_team_ids: _teams, espn_linked_at: _at, ...rest } = detail.state.league
  const league = { ...rest, name: 'Empty state capture' }
  return (await api('POST', '/sessions', { league, name: 'Empty state capture' })).id
}

// Each state: how to prepare the page, which session it shows and when to take the shot.
function stateRuns(emptySid) {
  if (!STATES) return [{ suffix: VARIANT, sid: SESSION }]
  return [
    { suffix: 'empty', sid: emptySid, noWait: true },
    { suffix: 'loading', sid: SESSION, loading: true },
    { suffix: 'error', sid: SESSION, error: true, noWait: true },
  ]
}

// The session list (Setup table, session picker) names every local session, including private leagues:
// captures only ever list the sessions they were pointed at and the throwaway ones they create.
const CAPTURE_NAMES = new Set(['Portfolio demo draft', 'Empty state capture'])
async function listOnlyCaptureSessions(page, allowed) {
  await page.route((u) => u.href.startsWith(`${BASE}/api/fantasy/sessions`) && new URL(u.href).pathname === '/api/fantasy/sessions', async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    const res = await r.fetch()
    const rows = await res.json()
    await r.fulfill({ response: res, json: rows.filter((s) => allowed.includes(s.id) || CAPTURE_NAMES.has(s.name)) })
  })
}

async function capture(page, name, spec, vp, run) {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await listOnlyCaptureSessions(page, [SESSION, DRAFT_SESSION, run.sid].filter(Boolean))
  if (BLOCK_IMAGES) await page.route(IMAGE_HOSTS, (r) => r.abort())
  if (run.error) await page.route(spec.error, (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: { code: 'internal', message: 'Simulated server error' } }) }))
  await page.addInitScript((sid) => { try { if (sid) window.localStorage.setItem('copilot.session', sid) } catch { /* storage blocked */ } }, run.sid)
  if (run.loading) {
    // Warm the module cache first so the shot shows the API loading state, not the dev server compiling.
    await page.goto(BASE + spec.path(run.sid), { waitUntil: 'networkidle', timeout: 60_000 })
    await page.route((u) => API_URL(u.href), async (r) => { await new Promise((ok) => setTimeout(ok, 3000)); await r.continue().catch(() => {}) })
    await page.reload({ waitUntil: 'commit', timeout: 60_000 })
    await page.waitForTimeout(1000)
  } else {
    await page.goto(BASE + spec.path(run.sid), { waitUntil: 'networkidle', timeout: 60_000 })
    if (spec.wait && !run.noWait) await page.locator(spec.wait).first().waitFor({ timeout: 60_000 }).catch(() => {})
    if (spec.after) await spec.after(page).catch(() => {})
    await page.waitForTimeout(900)
  }
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  const file = `${name}-${vp.width}x${vp.height}-${THEME}${run.suffix ? `-${run.suffix}` : ''}.png`
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: FULL })
  console.log(file)
  return w[0] > w[1] + 1 ? `${file}: document ${w[0]}px > viewport ${w[1]}px` : null
}

const emptySid = STATES ? await createEmptySession() : null
const browser = await chromium.launch()
const overflow = []
try {
  for (const vp of VIEWPORTS) {
    for (const name of wanted) {
      for (const run of stateRuns(emptySid)) {
        const context = await browser.newContext({ viewport: vp, colorScheme: THEME, reducedMotion: REDUCED ? 'reduce' : 'no-preference' })
        await context.addInitScript((theme) => { try { window.localStorage.setItem('theme', theme) } catch { /* storage blocked */ } }, THEME)
        const page = await context.newPage()
        try {
          const o = await capture(page, name, PAGES[name], vp, run)
          if (o) overflow.push(o)
        } catch (e) {
          console.log(`${name} ${vp.width}x${vp.height} ${run.suffix}: ${String(e).split('\n')[0]}`)
        }
        await context.close()
      }
    }
  }
} finally {
  await browser.close()
  if (emptySid) await api('DELETE', `/sessions/${emptySid}`).catch((e) => console.log(`could not delete ${emptySid}: ${e}`))
}
console.log(overflow.length ? `HORIZONTAL OVERFLOW:\n  ${overflow.join('\n  ')}` : 'no horizontal overflow')
