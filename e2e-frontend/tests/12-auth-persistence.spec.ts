import { test, expect } from '@playwright/test';
import { TEST_API_KEY } from '../helpers/test-utils';

test.describe('Authentication & Session Persistence', () => {
    test('should persist login across page reload', async ({ page }) => {
        // Login
        await page.goto('/');
        await page.fill('#apiKey', TEST_API_KEY);
        await page.click('.connect-btn');
        await page.waitForSelector('.sidebar', { timeout: 10000 });

        // Reload page
        await page.reload();
        await page.waitForTimeout(2000);

        // Should still be logged in (sessionStorage persists within tab)
        // Note: sessionStorage survives reload but not new tabs
        const sidebar = page.locator('.sidebar');
        await expect(sidebar).toBeVisible({ timeout: 5000 });
    });

    test('should redirect to login when not authenticated', async ({ page }) => {
        // Clear any stored keys
        await page.goto('/');
        await page.evaluate(() => sessionStorage.clear());
        await page.reload();
        await page.waitForTimeout(1000);

        // Should show login form
        await expect(page.locator('#apiKey')).toBeVisible({ timeout: 5000 });
    });

    test('should clear session on logout', async ({ page }) => {
        // Login first
        await page.goto('/');
        await page.fill('#apiKey', TEST_API_KEY);
        await page.click('.connect-btn');
        await page.waitForSelector('.sidebar', { timeout: 10000 });

        // Logout
        await page.click('.logout-btn');
        await page.waitForSelector('#apiKey', { timeout: 5000 });

        // Verify sessionStorage is cleared
        const key = await page.evaluate(() => sessionStorage.getItem('openwa_api_key'));
        expect(key).toBeNull();
    });

    test('should handle API key with special characters in input', async ({ page }) => {
        await page.goto('/');
        // Fill with special characters
        await page.fill('#apiKey', 'key-with-special-chars!@#$%^&*()');
        // Input should accept and hold the value
        const value = await page.inputValue('#apiKey');
        expect(value).toBe('key-with-special-chars!@#$%^&*()');
    });

    test('should submit form with Enter key', async ({ page }) => {
        await page.goto('/');
        await page.fill('#apiKey', TEST_API_KEY);
        await page.press('#apiKey', 'Enter');
        // Should attempt login
        await page.waitForSelector('.sidebar', { timeout: 10000 });
    });

    test('should show error styling on invalid input', async ({ page }) => {
        await page.goto('/');
        await page.fill('#apiKey', 'bad-key');
        await page.click('.connect-btn');
        await page.waitForTimeout(2000);
        // Input should have error class
        const input = page.locator('#apiKey');
        const hasError = await input.evaluate(el => el.classList.contains('error'));
        // Either input has error class or error message appears
        const errorMsg = page.locator('.error-message');
        if (!hasError) {
            await expect(errorMsg).toBeVisible({ timeout: 3000 });
        }
    });
});
