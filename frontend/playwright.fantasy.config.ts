import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

/**
 * Fantasy copilot end-to-end suite (e2e/fantasy). Boots a throwaway fantasy API on a temp data dir
 * and a Vite dev server whose /api/fantasy proxy points at it, on ports that never collide with
 * `make dev` (8001/8002/5173) or the analytics suite. Run: `npx playwright test -c playwright.fantasy.config.ts`.
 */
const backendPort = Number(process.env.E2E_FANTASY_BACKEND_PORT ?? 8010)
const frontendPort = Number(process.env.E2E_FANTASY_FRONTEND_PORT ?? 5175)
const backendUrl = `http://127.0.0.1:${backendPort}`
const frontendUrl = `http://127.0.0.1:${frontendPort}`
const dataDir = mkdtempSync(join(tmpdir(), 'courtside-fantasy-e2e-'))

export default defineConfig({
  testDir: './e2e/fantasy',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: frontendUrl,
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: `uv run uvicorn app.main:app --host 127.0.0.1 --port ${backendPort}`,
      cwd: '../services/fantasy',
      url: `${backendUrl}/api/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { ...process.env, COPILOT_DATA_DIR: dataDir },
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${frontendPort} --strictPort`,
      url: frontendUrl,
      timeout: 60_000,
      reuseExistingServer: false,
      env: { ...process.env, FANTASY_BACKEND: backendUrl },
    },
  ],
})
