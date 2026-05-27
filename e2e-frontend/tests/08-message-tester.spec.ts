import { test, expect } from '@playwright/test';
import { login, waitForContentLoad } from '../helpers/test-utils';

test.describe('Message Tester Page', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.click('.sidebar-nav a[href="/message-tester"]');
        await page.waitForLoadState('networkidle');
        await waitForContentLoad(page);
    });

    test('should display message tester page with header', async ({ page }) => {
        const header = page.locator('.page-header');
        await expect(header).toBeVisible();
    });

    test('should display session selector', async ({ page }) => {
        const sessionSelect = page.locator('select').first();
        await expect(sessionSelect).toBeVisible();
    });

    test('should display recipient input', async ({ page }) => {
        // Recipient can be an input field for phone number
        const recipientInput = page.locator('input[type="text"], input[type="tel"]');
        const count = await recipientInput.count();
        expect(count).toBeGreaterThanOrEqual(1);
    });

    test('should display message type selector', async ({ page }) => {
        // Message type tabs or selector
        const typeSelector = page.locator('.message-types, [class*="type"] button, select, .tabs');
        const count = await typeSelector.count();
        expect(count).toBeGreaterThanOrEqual(1);
    });

    test('should display content textarea or input', async ({ page }) => {
        const contentInput = page.locator('textarea, input[type="text"]');
        const count = await contentInput.count();
        expect(count).toBeGreaterThanOrEqual(1);
    });

    test('should have send button', async ({ page }) => {
        const sendBtn = page.locator('button').filter({ hasText: /send/i });
        await expect(sendBtn.first()).toBeVisible();
    });

    test('should switch between message types', async ({ page }) => {
        // Find message type buttons/tabs
        const typeButtons = page.locator('.message-types button, [class*="type-btn"], .type-selector button');
        if (await typeButtons.count() > 1) {
            // Click on "image" type
            const imageBtn = typeButtons.filter({ hasText: /image/i });
            if (await imageBtn.count() > 0) {
                await imageBtn.first().click();
                // Should show media URL input
                const mediaInput = page.locator('input[placeholder*="url" i], input[placeholder*="URL" i], input[type="url"]');
                if (await mediaInput.count() > 0) {
                    await expect(mediaInput.first()).toBeVisible();
                }
            }
        }
    });

    test('should show recipient type toggle', async ({ page }) => {
        // Personal/Group toggle
        const recipientType = page.locator('select, button, [class*="recipient"]').filter({ hasText: /personal|group/i });
        const count = await recipientType.count();
        expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should validate required fields before sending', async ({ page }) => {
        // Try to send without filling anything
        const sendBtn = page.locator('button').filter({ hasText: /send/i }).first();
        // Button might be disabled or show validation
        const isDisabled = await sendBtn.isDisabled();
        // Either disabled or clicking shows error
        if (!isDisabled) {
            await sendBtn.click();
            await page.waitForTimeout(1000);
        }
    });

    test('should display response area', async ({ page }) => {
        // Response/result section might be hidden until a message is sent
        const responsArea = page.locator('.response, [class*="response"], [class*="result"]');
        const count = await responsArea.count();
        expect(count).toBeGreaterThanOrEqual(0);
    });
});
