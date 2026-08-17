import { defineConfig, devices } from '@playwright/test'

/**
 * E2E config for the tenant console. Points at an already-running local dev
 * stack (frontend `npm run dev` on :3000 + the real backend services + real
 * Keycloak) - it does NOT start its own servers, since this app's full
 * stack (9 JVM services, Postgres, Kafka, Elasticsearch, Keycloak) is too
 * heavy to spin up per test run. Run `npm run dev` and the backend
 * separately first (see README.md), then `npx playwright test`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
