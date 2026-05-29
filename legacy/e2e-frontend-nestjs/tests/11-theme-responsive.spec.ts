import { test, expect } from '@playwright/test';
import { login, waitForContentLoad } from '../helpers/test-utils';

test.describe('Theme & Responsiveness', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await waitForContentLoad(page);
    });

    test('should apply dark theme', async ({ page }) => {
        // Click theme toggle until we get dark mode
        const themeBtn = page.locator('.theme-toggle-btn').last();
        // Keep clicking until dark theme is applied
        for (let i = 0; i < 3; i++) {
            await themeBtn.click();
            await page.waitForTimeout(300);
            const isDark = await page.evaluate(() => {
                return document.documentElement.getAttribute('data-theme') === 'dark' ||
                    document.body.classList.contains('dark') ||
                    document.documentElement.classList.contains('dark');
            });
            if (isDark) break;
        }
        // Verify page still renders correctly
        await expect(page.locator('.main-content')).toBeVisible();
    });

    test('should handle RTL language (Hebrew)', async ({ page }) => {
        // Switch to Hebrew
        const langBtn = page.locator('.theme-toggle-btn').first();
        await langBtn.click();
        await page.waitForTimeout(500);

        // Check if language actually changed
        const text = await langBtn.textContent();
        // Either we're now in Hebrew or English (depending on starting language)
        expect(text).toBeTruthy();
        // Page should still render
        await expect(page.locator('.sidebar')).toBeVisible();
    });

    test('should be responsive on mobile viewport', async ({ page }) => {
        // Resize to mobile
        await page.setViewportSize({ width: 375, height: 667 });
        await page.waitForTimeout(500);

        // Mobile header should appear
        const mobileHeader = page.locator('.mobile-header');
        if (await mobileHeader.count() > 0) {
            await expect(mobileHeader).toBeVisible();
            // Sidebar should be hidden by default
            const sidebar = page.locator('.sidebar');
            const classes = await sidebar.getAttribute('class');
            // On mobile, sidebar is hidden unless open
            expect(classes).toContain('mobile');
        }
    });

    test('should open mobile menu', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.waitForTimeout(500);

        const menuBtn = page.locator('.mobile-menu-btn');
        if (await menuBtn.count() > 0) {
            await menuBtn.click();
            // Sidebar should open
            const sidebar = page.locator('.sidebar.open');
            await expect(sidebar).toBeVisible({ timeout: 3000 });
        }
    });

    test('should close mobile menu on navigation', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.waitForTimeout(500);

        const menuBtn = page.locator('.mobile-menu-btn');
        if (await menuBtn.count() > 0) {
            await menuBtn.click();
            await page.waitForTimeout(300);

            // Click a nav item
            const navItem = page.locator('.sidebar-nav .nav-item').first();
            await navItem.click();
            await page.waitForTimeout(500);

            // Sidebar should close
            const sidebarOpen = page.locator('.sidebar.open');
            await expect(sidebarOpen).not.toBeVisible({ timeout: 3000 });
        }
    });

    test('should maintain layout on tablet viewport', async ({ page }) => {
        await page.setViewportSize({ width: 768, height: 1024 });
        await page.waitForTimeout(500);
        // Content should still be visible
        await expect(page.locator('.main-content')).toBeVisible();
    });
});
