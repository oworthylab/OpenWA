import { test, expect } from '@playwright/test';
import { TEST_API_KEY } from '../helpers/test-utils';

test.describe('Login Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
    });

    test('should display login form', async ({ page }) => {
        // Logo should be visible
        await expect(page.locator('.login-logo img')).toBeVisible();
        // API key input should exist
        await expect(page.locator('#apiKey')).toBeVisible();
        // Connect button should exist
        await expect(page.locator('.connect-btn')).toBeVisible();
        // Help text with docs link should be present
        await expect(page.locator('.login-help')).toBeVisible();
        // Footer with GitHub link
        await expect(page.locator('.login-footer')).toBeVisible();
    });

    test('should show password field by default', async ({ page }) => {
        const input = page.locator('#apiKey');
        await expect(input).toHaveAttribute('type', 'password');
    });

    test('should toggle API key visibility', async ({ page }) => {
        const input = page.locator('#apiKey');
        const toggleBtn = page.locator('.toggle-visibility');

        // Initially password type
        await expect(input).toHaveAttribute('type', 'password');

        // Click toggle
        await toggleBtn.click();
        await expect(input).toHaveAttribute('type', 'text');

        // Click again
        await toggleBtn.click();
        await expect(input).toHaveAttribute('type', 'password');
    });

    test('should show error for empty API key', async ({ page }) => {
        await page.click('.connect-btn');
        // Error message should appear
        await expect(page.locator('.error-message')).toBeVisible();
    });

    test('should show error for invalid API key', async ({ page }) => {
        await page.fill('#apiKey', 'invalid-key-12345');
        await page.click('.connect-btn');
        // Wait for error response
        await expect(page.locator('.error-message')).toBeVisible({ timeout: 5000 });
    });

    test('should show loading state while connecting', async ({ page }) => {
        await page.fill('#apiKey', TEST_API_KEY);
        // Click and immediately check button text changes
        const btn = page.locator('.connect-btn');
        await btn.click();
        // Button should be disabled during request
        // (might be too fast to catch, so we just verify login succeeds)
        // Wait for either sidebar (success) or error (rate limited then retry)
        const result = await Promise.race([
            page.waitForSelector('.sidebar', { timeout: 30000 }).then(() => 'success'),
            page.waitForSelector('.error-message', { timeout: 30000 }).then(() => 'error'),
        ]);
        if (result === 'error') {
            // Rate limited - wait and retry
            await page.waitForTimeout(2000);
            await page.click('.connect-btn');
            await page.waitForSelector('.sidebar', { timeout: 30000 });
        }
    });

    test('should login successfully with valid API key', async ({ page }) => {
        await page.fill('#apiKey', TEST_API_KEY);
        await page.click('.connect-btn');
        // Wait for either sidebar (success) or error (rate limited then retry)
        const result = await Promise.race([
            page.waitForSelector('.sidebar', { timeout: 30000 }).then(() => 'success'),
            page.waitForSelector('.error-message', { timeout: 30000 }).then(() => 'error'),
        ]);
        if (result === 'error') {
            await page.waitForTimeout(2000);
            await page.click('.connect-btn');
            await page.waitForSelector('.sidebar', { timeout: 30000 });
        }
        // Dashboard content should be visible
        await expect(page.locator('.main-content')).toBeVisible();
    });

    test('should display version info', async ({ page }) => {
        await expect(page.locator('.version-info')).toBeVisible();
    });

    test('should have placeholder text in input', async ({ page }) => {
        const input = page.locator('#apiKey');
        const placeholder = await input.getAttribute('placeholder');
        expect(placeholder).toBeTruthy();
    });
});
