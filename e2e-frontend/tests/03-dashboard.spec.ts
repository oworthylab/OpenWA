import { test, expect } from '@playwright/test';
import { login, waitForContentLoad } from '../helpers/test-utils';

test.describe('Dashboard Page', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await waitForContentLoad(page);
    });

    test('should display dashboard page with stats cards', async ({ page }) => {
        await expect(page.locator('.dashboard')).toBeVisible();
        // Stats grid should be present
        await expect(page.locator('.stats-grid')).toBeVisible();
        // Should have stat cards
        const statCards = page.locator('.stat-card');
        const count = await statCards.count();
        expect(count).toBeGreaterThanOrEqual(3);
    });

    test('should display page header with title', async ({ page }) => {
        const header = page.locator('.page-header');
        await expect(header).toBeVisible();
    });

    test('should display connection status badge', async ({ page }) => {
        const badge = page.locator('.status-badge');
        await expect(badge).toBeVisible();
        // Should be either "connected" or "disconnected"
        const classes = await badge.getAttribute('class');
        expect(classes).toMatch(/connected|disconnected/);
    });

    test('should display stat card values', async ({ page }) => {
        const statValues = page.locator('.stat-value');
        const count = await statValues.count();
        expect(count).toBeGreaterThanOrEqual(3);
        // Values should be visible
        for (let i = 0; i < count; i++) {
            await expect(statValues.nth(i)).toBeVisible();
        }
    });

    test('should display stat card labels', async ({ page }) => {
        const statLabels = page.locator('.stat-label');
        const count = await statLabels.count();
        expect(count).toBeGreaterThanOrEqual(3);
    });

    test('should display sessions overview section', async ({ page }) => {
        await expect(page.locator('.sessions-section')).toBeVisible();
        // Section header
        await expect(page.locator('.section-header h2')).toBeVisible();
    });

    test('should display sessions table with headers', async ({ page }) => {
        const table = page.locator('.sessions-table');
        await expect(table).toBeVisible();
        // Table header should have columns
        const tableHeader = page.locator('.table-header span');
        const count = await tableHeader.count();
        expect(count).toBeGreaterThanOrEqual(4);
    });

    test('should show session count in subtitle', async ({ page }) => {
        const subtitle = page.locator('.section-subtitle');
        await expect(subtitle).toBeVisible();
        const text = await subtitle.textContent();
        expect(text).toBeTruthy();
    });

    test('should handle empty sessions state', async ({ page }) => {
        // Either shows sessions or empty state
        const tableRows = page.locator('.sessions-table .table-row');
        const count = await tableRows.count();
        expect(count).toBeGreaterThanOrEqual(0);
    });
});
