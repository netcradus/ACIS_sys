// Real production smoke/E2E test against the live public URL. Run by
// .github/workflows/deploy-production.yml's `verify` job after every
// deploy - a real browser driving the actual OAuth redirect flow through
// Keycloak, not a mocked or stubbed login. Requires SMOKE_ADMIN_PASS /
// SMOKE_ANALYST_PASS env vars (GitHub Actions secrets
// SMOKE_TEST_ADMIN_PASSWORD / SMOKE_TEST_ANALYST_PASSWORD) - real
// credentials for two already-provisioned realm users, never printed.
const { test, expect } = require('@playwright/test');

const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS;
const ANALYST_PASS = process.env.SMOKE_ANALYST_PASS;

test('invalid login is rejected', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL(/realms\/acis/, { timeout: 15000 });
  await page.fill('#username', 'admin');
  await page.fill('#password', 'definitely-wrong-password-123');
  await page.click('#kc-login');
  await expect(page.locator('text=/invalid/i')).toBeVisible({ timeout: 10000 });
});

test('real admin login succeeds and reaches a real API', async ({ page }) => {
  test.skip(!ADMIN_PASS, 'SMOKE_ADMIN_PASS not set');
  await page.goto('/');
  await page.waitForURL(/realms\/acis/, { timeout: 15000 });
  await page.fill('#username', 'admin');
  await page.fill('#password', ADMIN_PASS);
  await page.click('#kc-login');
  await page.waitForURL(/acis\.netcradus\.com/, { timeout: 20000 });

  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/') && r.request().method() === 'GET', { timeout: 15000 }),
    page.reload(),
  ]);
  expect(resp.status()).toBe(200);
});

test('real analyst login succeeds (second real account)', async ({ page }) => {
  test.skip(!ANALYST_PASS, 'SMOKE_ANALYST_PASS not set');
  await page.goto('/');
  await page.waitForURL(/realms\/acis/, { timeout: 15000 });
  await page.fill('#username', 'analyst1');
  await page.fill('#password', ANALYST_PASS);
  await page.click('#kc-login');
  await page.waitForURL(/acis\.netcradus\.com/, { timeout: 20000 });
});
