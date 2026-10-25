import { defineConfig, devices } from '@playwright/test'

/**
 * Browser smoke tests. Expects the API on :8000 (demo data) and starts Vite on :5173 if needed.
 * Run: `npx playwright install chromium` once, then `npm run e2e`.
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/fantasy/**'], // run with playwright.fantasy.config.ts
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
