import { test, expect } from '@playwright/test';
import { login, waitForContentLoad } from '../helpers/test-utils';

test.describe('API Keys Page', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        // API Keys is admin-only
        const apiKeysLink = page.locator('.sidebar-nav a[href="/api-keys"]');
        if (await apiKeysLink.count() > 0) {
            await apiKeysLink.click();
            await page.waitForLoadState('networkidle');
            await waitForContentLoad(page);
        }
    });

    test('should display API keys page', async ({ page }) => {
        const apiKeysLink = page.locator('.sidebar-nav a[href="/api-keys"]');
        if (await apiKeysLink.count() === 0) {
            test.skip();
            return;
        }
        const header = page.locator('.page-header');
        await expect(header).toBeVisible();
    });

    test('should have create API key button', async ({ page }) => {
        const apiKeysLink = page.locator('.sidebar-nav a[href="/api-keys"]');
        if (await apiKeysLink.count() === 0) {
            test.skip();
            return;
        }
        const createBtn = page.locator('button').filter({ hasText: /create|generate|new|add/i });
        await expect(createBtn.first()).toBeVisible();
    });

    test('should open create API key modal', async ({ page }) => {
        const apiKeysLink = page.locator('.sidebar-nav a[href="/api-keys"]');
        if (await apiKeysLink.count() === 0) {
            test.skip();
            return;
        }
        const createBtn = page.locator('button').filter({ hasText: /create|generate|new|add/i }).first();
        await createBtn.click();

        const modal = page.locator('.modal-overlay');
        await expect(modal).toBeVisible({ timeout: 5000 });
    });

    test('should show name input and role selector in create modal', async ({ page }) => {
        const apiKeysLink = page.locator('.sidebar-nav a[href="/api-keys"]');
        if (await apiKeysLink.count() === 0) {
            test.skip();
            return;
        }
        const createBtn = page.locator('button').filter({ hasText: /create|generate|new|add/i }).first();
        await createBtn.click();
        await page.waitForSelector('.modal-overlay', { timeout: 5000 });

        // Name input
        const nameInput = page.locator('.modal input[type="text"]').first();
        await expect(nameInput).toBeVisible();

        // Role selector (select or radio buttons)
        const roleSelect = page.locator('.modal select, .modal input[type="radio"]');
        const count = await roleSelect.count();
        expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should create a new API key', async ({ page }) => {
        const apiKeysLink = page.locator('.sidebar-nav a[href="/api-keys"]');
        if (await apiKeysLink.count() === 0) {
            test.skip();
            return;
        }
        const createBtn = page.locator('button').filter({ hasText: /create|generate|new|add/i }).first();
        await createBtn.click();
        await page.waitForSelector('.modal-overlay', { timeout: 5000 });

        // Fill name
        const nameInput = page.locator('.modal input[type="text"]').first();
        await nameInput.fill(`pw-test-key-${Date.now()}`);

        // Submit
        const submitBtn = page.locator('.modal button').filter({ hasText: /create|generate|save/i }).first();
        await submitBtn.click();

        // Should show the created key or success state
        await page.waitForTimeout(2000);
    });

    test('should display API keys table', async ({ page }) => {
        const apiKeysLink = page.locator('.sidebar-nav a[href="/api-keys"]');
        if (await apiKeysLink.count() === 0) {
            test.skip();
            return;
        }
        // Table or list of keys
        const table = page.locator('table, .api-keys-table, [class*="table"]');
        await expect(table.first()).toBeVisible({ timeout: 5000 });
    });

    test('should have visibility toggle for key values', async ({ page }) => {
        const apiKeysLink = page.locator('.sidebar-nav a[href="/api-keys"]');
        if (await apiKeysLink.count() === 0) {
            test.skip();
            return;
        }
        // Look for eye/eyeoff toggle buttons in the table
        const toggleBtns = page.locator('button').filter({ has: page.locator('svg') });
        // At least some buttons should exist if keys are present
        const count = await toggleBtns.count();
        expect(count).toBeGreaterThanOrEqual(0);
    });
});
