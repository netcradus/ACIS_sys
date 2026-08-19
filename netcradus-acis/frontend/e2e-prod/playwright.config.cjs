// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// Real E2E config for the live public URL, used by
// .github/workflows/deploy-production.yml's `verify` job after every
// production deploy. Deliberately separate from playwright.config.ts
// (which points at localhost:3000 for local dev) - this one only ever
// runs against https://acis.netcradus.com, never a dev server this
// config would need to start.
module.exports = defineConfig({
  testDir: __dirname,
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 1,
  reporter: [['line']],
  use: {
    baseURL: 'https://acis.netcradus.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
