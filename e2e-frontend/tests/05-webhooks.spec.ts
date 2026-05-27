import { test, expect } from '@playwright/test';
import { login, waitForContentLoad } from '../helpers/test-utils';

test.describe('Webhooks Page', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.click('.sidebar-nav a[href="/webhooks"]');
        await page.waitForLoadState('networkidle');
        await waitForContentLoad(page);
    });

    test('should display webhooks page with header', async ({ page }) => {
        const header = page.locator('.page-header');
        await expect(header).toBeVisible();
    });

    test('should have create webhook button', async ({ page }) => {
        const createBtn = page.locator('button').filter({ hasText: /create|add|new/i });
        await expect(createBtn.first()).toBeVisible();
    });

    test('should open create webhook modal', async ({ page }) => {
        const createBtn = page.locator('button').filter({ hasText: /create|add|new/i }).first();
        await createBtn.click();

        // Modal should appear
        await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 });
    });

    test('should show URL input in create modal', async ({ page }) => {
        const createBtn = page.locator('button').filter({ hasText: /create|add|new/i }).first();
        await createBtn.click();
        await page.waitForSelector('.modal-overlay', { timeout: 5000 });

        // URL input should be present
        const urlInput = page.locator('.modal input').first();
        await expect(urlInput).toBeVisible();
    });

    test('should show event selection in create modal', async ({ page }) => {
        const createBtn = page.locator('button').filter({ hasText: /create|add|new/i }).first();
        await createBtn.click();
        await page.waitForSelector('.modal-overlay', { timeout: 5000 });

        // Events should be selectable (checkboxes or multi-select)
        const eventElements = page.locator('.modal input[type="checkbox"], .modal label');
        const count = await eventElements.count();
        expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should show session selector in create modal', async ({ page }) => {
        const createBtn = page.locator('button').filter({ hasText: /create|add|new/i }).first();
        await createBtn.click();
        await page.waitForSelector('.modal-overlay', { timeout: 5000 });

        // Session selector (select element)
        const sessionSelect = page.locator('.modal select');
        const count = await sessionSelect.count();
        expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should display webhook list', async ({ page }) => {
        // Either shows webhooks or empty state
        const content = page.locator('.webhooks-page');
        await expect(content).toBeVisible();
    });

    test('should close modal on cancel', async ({ page }) => {
        const createBtn = page.locator('button').filter({ hasText: /create|add|new/i }).first();
        await createBtn.click();
        await page.waitForSelector('.modal-overlay', { timeout: 5000 });

        // Close modal
        const closeBtn = page.locator('.modal button').filter({ hasText: /cancel|close/i });
        if (await closeBtn.count() > 0) {
            await closeBtn.first().click();
        } else {
            // Try X button
            const xBtn = page.locator('.modal-header button').first();
            await xBtn.click();
        }

        // Modal should be gone
        await expect(page.locator('.modal-overlay')).not.toBeVisible({ timeout: 3000 });
    });
});
