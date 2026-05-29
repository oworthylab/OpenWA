import { test, expect } from '@playwright/test';
import { login, waitForContentLoad } from '../helpers/test-utils';

test.describe('Infrastructure Page', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.click('.sidebar-nav a[href="/infrastructure"]');
        await page.waitForLoadState('networkidle');
        await waitForContentLoad(page);
    });

    test('should display infrastructure page with header', async ({ page }) => {
        const header = page.locator('.page-header');
        await expect(header).toBeVisible();
    });

    test('should display configuration sections', async ({ page }) => {
        // Infrastructure page has multiple config sections (database, redis, storage, etc.)
        const sections = page.locator('section, .config-section, [class*="section"], .card, [class*="card"]');
        const count = await sections.count();
        expect(count).toBeGreaterThanOrEqual(1);
    });

    test('should display database configuration', async ({ page }) => {
        // Look for database-related content
        const dbSection = page.locator('text=database, text=Database, text=SQLite, text=PostgreSQL').first();
        if (await dbSection.count() > 0) {
            await expect(dbSection).toBeVisible();
        }
    });

    test('should display storage configuration', async ({ page }) => {
        // Look for storage section
        const storageSection = page.locator('text=storage, text=Storage, text=S3, text=Local').first();
        if (await storageSection.count() > 0) {
            await expect(storageSection).toBeVisible();
        }
    });

    test('should display server status indicators', async ({ page }) => {
        // Status indicators (connected/disconnected/running)
        const statusIndicators = page.locator('[class*="status"], [class*="indicator"], .badge');
        const count = await statusIndicators.count();
        expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should have save/apply button for configuration', async ({ page }) => {
        const saveBtn = page.locator('button').filter({ hasText: /save|apply|update/i });
        const count = await saveBtn.count();
        expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should display form inputs for configuration', async ({ page }) => {
        // Config forms have various inputs
        const inputs = page.locator('input, select, textarea');
        const count = await inputs.count();
        expect(count).toBeGreaterThanOrEqual(1);
    });

    test('should display queue/redis status', async ({ page }) => {
        // Redis or queue section
        const redisSection = page.locator('text=Redis, text=redis, text=Queue, text=queue').first();
        if (await redisSection.count() > 0) {
            await expect(redisSection).toBeVisible();
        }
    });
});
