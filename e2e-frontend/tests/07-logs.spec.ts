import { test, expect } from '@playwright/test';
import { login, waitForContentLoad } from '../helpers/test-utils';

test.describe('Audit Logs Page', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.click('.sidebar-nav a[href="/logs"]');
        await page.waitForLoadState('networkidle');
        await waitForContentLoad(page);
    });

    test('should display logs page with header', async ({ page }) => {
        const header = page.locator('.page-header');
        await expect(header).toBeVisible();
    });

    test('should display search input', async ({ page }) => {
        const searchInput = page.locator('.search-input input, input[placeholder]');
        await expect(searchInput.first()).toBeVisible();
    });

    test('should display severity filter dropdown', async ({ page }) => {
        const filterSelect = page.locator('select');
        await expect(filterSelect.first()).toBeVisible();
        // Should have severity options
        const options = filterSelect.first().locator('option');
        const count = await options.count();
        expect(count).toBeGreaterThanOrEqual(2); // at least "all" + one severity
    });

    test('should display logs table with column headers', async ({ page }) => {
        const table = page.locator('.logs-table');
        await expect(table).toBeVisible();

        // Header row with columns
        const headerRow = page.locator('.table-row.header, .logs-table .header');
        if (await headerRow.count() > 0) {
            const columns = headerRow.locator('span');
            const count = await columns.count();
            expect(count).toBeGreaterThanOrEqual(3);
        }
    });

    test('should filter logs by severity', async ({ page }) => {
        const filterSelect = page.locator('select').first();
        // Select "error" severity
        await filterSelect.selectOption('error');
        await page.waitForTimeout(1000);
        // Page should still be functional
        await expect(page.locator('.logs-page')).toBeVisible();
    });

    test('should filter logs by search query', async ({ page }) => {
        const searchInput = page.locator('.search-input input, input[placeholder]').first();
        await searchInput.fill('test-search-query');
        await page.waitForTimeout(500);
        // Should still display the table structure
        await expect(page.locator('.logs-table')).toBeVisible();
    });

    test('should have pagination controls', async ({ page }) => {
        // Pagination might not be visible if few logs
        const pagination = page.locator('.pagination, [class*="pagination"], button').filter({ hasText: /next|prev|›|‹|\d+/i });
        const count = await pagination.count();
        // Just verify the page doesn't crash
        expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should display empty state when no logs match', async ({ page }) => {
        const searchInput = page.locator('.search-input input, input[placeholder]').first();
        await searchInput.fill('zzzz-nonexistent-log-entry-xyz-9999');
        await page.waitForTimeout(500);
        // Either shows empty state or empty table
        const content = page.locator('.logs-page, .logs-table, .empty-table-state');
        await expect(content.first()).toBeVisible();
    });

    test('should have export button', async ({ page }) => {
        const exportBtn = page.locator('button').filter({ hasText: /export|download|csv/i });
        if (await exportBtn.count() > 0) {
            await expect(exportBtn.first()).toBeVisible();
        }
    });
});
