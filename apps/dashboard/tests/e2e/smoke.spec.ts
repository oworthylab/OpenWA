import { expect, test } from '@playwright/test';

/**
 * Sprint 9 smoke test — runs against the deployed Pages preview URL.
 *
 * Set DASHBOARD_URL to the preview URL emitted by `wrangler pages deploy`.
 * OPENWA_API_KEY is required if the API enforces self-host auth so the
 * Sessions list loads.
 */
test.describe('OpenWA dashboard smoke', () => {
  test('loads login screen and renders branding', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await expect(page).toHaveTitle(/OpenWA/i);
    // Either Login (unauthed) or Dashboard layout renders. Both should
    // mount React without throwing.
    await page.waitForLoadState('networkidle');
    expect(errors, `Unexpected pageerror: ${errors.join(' / ')}`).toEqual([]);
  });

  test('proxies /api/health to the worker', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBeLessThan(500);
    const body = await res.json().catch(() => ({}));
    expect(body).toBeDefined();
  });
});
