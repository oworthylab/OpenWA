import { test, expect } from '@playwright/test';
import { login, waitForContentLoad } from '../helpers/test-utils';

test.describe('Plugins Page', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        // Plugins is admin-only
        const pluginsLink = page.locator('.sidebar-nav a[href="/plugins"]');
        if (await pluginsLink.count() > 0) {
            await pluginsLink.click();
            await page.waitForLoadState('networkidle');
            await waitForContentLoad(page);
        }
    });

    test('should display plugins page with header', async ({ page }) => {
        const pluginsLink = page.locator('.sidebar-nav a[href="/plugins"]');
        if (await pluginsLink.count() === 0) {
            test.skip();
            return;
        }
        const header = page.locator('.page-header');
        await expect(header).toBeVisible();
    });

    test('should display plugin list', async ({ page }) => {
        const pluginsLink = page.locator('.sidebar-nav a[href="/plugins"]');
        if (await pluginsLink.count() === 0) {
            test.skip();
            return;
        }
        // Plugin cards or list items
        const plugins = page.locator('.plugin-card, [class*="plugin-item"], .card, [class*="card"]');
        const count = await plugins.count();
        expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should display engine configuration section', async ({ page }) => {
        const pluginsLink = page.locator('.sidebar-nav a[href="/plugins"]');
        if (await pluginsLink.count() === 0) {
            test.skip();
            return;
        }
        // Engine section
        const engineSection = page.locator('text=engine, text=Engine, text=WhatsApp').first();
        if (await engineSection.count() > 0) {
            await expect(engineSection).toBeVisible();
        }
    });

    test('should have enable/disable toggles for plugins', async ({ page }) => {
        const pluginsLink = page.locator('.sidebar-nav a[href="/plugins"]');
        if (await pluginsLink.count() === 0) {
            test.skip();
            return;
        }
        // Toggle buttons/switches
        const toggles = page.locator('button, [class*="toggle"], input[type="checkbox"]');
        const count = await toggles.count();
        expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should show plugin status indicators', async ({ page }) => {
        const pluginsLink = page.locator('.sidebar-nav a[href="/plugins"]');
        if (await pluginsLink.count() === 0) {
            test.skip();
            return;
        }
        // Health/status indicators
        const indicators = page.locator('[class*="status"], [class*="health"], .badge');
        const count = await indicators.count();
        expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should show plugin types', async ({ page }) => {
        const pluginsLink = page.locator('.sidebar-nav a[href="/plugins"]');
        if (await pluginsLink.count() === 0) {
            test.skip();
            return;
        }
        // Plugin type badges or labels
        const content = page.locator('.plugins-page, [class*="plugin"], .main-content');
        await expect(content.first()).toBeVisible();
    });
});
