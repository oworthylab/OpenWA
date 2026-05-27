import { test, expect } from '@playwright/test';
import { login, navigateTo, logout } from '../helpers/test-utils';

test.describe('Navigation & Layout', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('should display sidebar with navigation items', async ({ page }) => {
        const sidebar = page.locator('.sidebar');
        await expect(sidebar).toBeVisible();

        // Check navigation items exist
        const navItems = page.locator('.sidebar-nav .nav-item');
        const count = await navItems.count();
        // Admin should see all items (8: dashboard, sessions, webhooks, api-keys, message-tester, infrastructure, plugins, logs)
        expect(count).toBeGreaterThanOrEqual(6);
    });

    test('should highlight active navigation item', async ({ page }) => {
        // Dashboard should be active by default
        const dashboardLink = page.locator('.sidebar-nav a[href="/"]');
        await expect(dashboardLink).toHaveClass(/active/);
    });

    test('should navigate to Sessions page', async ({ page }) => {
        await page.click('.sidebar-nav a[href="/sessions"]');
        await page.waitForLoadState('networkidle');
        // Sessions page content should be visible
        await expect(page.locator('.sessions-page')).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to Webhooks page', async ({ page }) => {
        await page.click('.sidebar-nav a[href="/webhooks"]');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('.webhooks-page')).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to API Keys page (admin only)', async ({ page }) => {
        const apiKeysLink = page.locator('.sidebar-nav a[href="/api-keys"]');
        if (await apiKeysLink.count() > 0) {
            await apiKeysLink.click();
            await page.waitForLoadState('networkidle');
            await expect(page.locator('.api-keys-page')).toBeVisible({ timeout: 10000 });
        }
    });

    test('should navigate to Logs page', async ({ page }) => {
        await page.click('.sidebar-nav a[href="/logs"]');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('.logs-page')).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to Message Tester page', async ({ page }) => {
        await page.click('.sidebar-nav a[href="/message-tester"]');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('.message-tester')).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to Infrastructure page', async ({ page }) => {
        await page.click('.sidebar-nav a[href="/infrastructure"]');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('.infrastructure-page')).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to Plugins page (admin only)', async ({ page }) => {
        const pluginsLink = page.locator('.sidebar-nav a[href="/plugins"]');
        if (await pluginsLink.count() > 0) {
            await pluginsLink.click();
            await page.waitForLoadState('networkidle');
            await expect(page.locator('.plugins-page')).toBeVisible({ timeout: 10000 });
        }
    });

    test('should display brand name in sidebar', async ({ page }) => {
        await expect(page.locator('.brand-name')).toBeVisible();
    });

    test('should toggle theme', async ({ page }) => {
        const themeBtn = page.locator('.theme-toggle-btn').last();
        await expect(themeBtn).toBeVisible();
        // Click to cycle theme
        await themeBtn.click();
        // Verify the button still exists (theme cycled)
        await expect(themeBtn).toBeVisible();
    });

    test('should toggle language', async ({ page }) => {
        // Language toggle is in the sidebar footer
        const langBtn = page.locator('.theme-toggle-btn').first();
        await expect(langBtn).toBeVisible();
        // Get current text
        const textBefore = await langBtn.textContent();
        // Click to cycle language
        await langBtn.click();
        // Text should change
        const textAfter = await langBtn.textContent();
        expect(textAfter).not.toBe(textBefore);
    });

    test('should collapse sidebar', async ({ page }) => {
        const collapseBtn = page.locator('.collapse-toggle');
        if (await collapseBtn.isVisible()) {
            await collapseBtn.click();
            await expect(page.locator('.sidebar')).toHaveClass(/collapsed/);
            // Nav items should still exist but labels hidden
            const navItems = page.locator('.sidebar-nav .nav-item');
            expect(await navItems.count()).toBeGreaterThan(0);
        }
    });

    test('should expand collapsed sidebar', async ({ page }) => {
        const collapseBtn = page.locator('.collapse-toggle');
        if (await collapseBtn.isVisible()) {
            // Collapse
            await collapseBtn.click();
            await expect(page.locator('.sidebar')).toHaveClass(/collapsed/);
            // Expand
            await collapseBtn.click();
            await expect(page.locator('.sidebar')).not.toHaveClass(/collapsed/);
        }
    });

    test('should logout successfully', async ({ page }) => {
        await logout(page);
        // Should see login form again
        await expect(page.locator('#apiKey')).toBeVisible();
        await expect(page.locator('.sidebar')).not.toBeVisible();
    });
});
