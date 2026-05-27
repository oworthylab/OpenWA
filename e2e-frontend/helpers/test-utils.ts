import { Page } from '@playwright/test';

/**
 * API key used for testing. Must match DEFAULT_ADMIN_KEY in docker-compose.e2e.yml.
 */
export const TEST_API_KEY = process.env.TEST_API_KEY || 'e2e-admin-key';

/**
 * Base URL for the dashboard
 */
export const BASE_URL = process.env.BASE_URL || 'http://localhost:2886';

/**
 * Login to the dashboard by entering the API key.
 * Includes retry logic to handle backend rate limiting (ThrottlerException).
 */
export async function login(page: Page, apiKey: string = TEST_API_KEY): Promise<void> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await page.goto('/', { waitUntil: 'networkidle' });
        await page.waitForSelector('#apiKey', { timeout: 15000 });
        await page.fill('#apiKey', apiKey);
        await page.click('.connect-btn');

        // Wait for either sidebar (success) or error message (rate limited)
        const result = await Promise.race([
            page.waitForSelector('.sidebar', { timeout: 30000 }).then(() => 'success'),
            page.waitForSelector('.error-message', { timeout: 30000 }).then(() => 'error'),
        ]).catch(() => 'timeout');

        if (result === 'success') return;

        // If rate limited or error, wait and retry
        if (attempt < maxAttempts) {
            await page.waitForTimeout(2000 * attempt);
        }
    }
    // Final attempt - just wait for sidebar or fail
    await page.waitForSelector('.sidebar', { timeout: 30000 });
}

/**
 * Navigate to a specific page via the sidebar
 */
export async function navigateTo(page: Page, path: string): Promise<void> {
    const link = page.locator(`.sidebar-nav a[href="${path}"]`);
    await link.click();
    await page.waitForLoadState('networkidle');
}

/**
 * Logout from the dashboard
 */
export async function logout(page: Page): Promise<void> {
    await page.click('.logout-btn');
    // Should return to login page
    await page.waitForSelector('#apiKey', { timeout: 5000 });
}

/**
 * Wait for page content to load (no loading spinners)
 */
export async function waitForContentLoad(page: Page): Promise<void> {
    // Wait for any loading spinners to disappear
    await page.waitForFunction(() => {
        return document.querySelectorAll('.animate-spin').length === 0;
    }, { timeout: 15000 }).catch(() => {
        // Ignore timeout - some pages may not have spinners
    });
    // Give React time to render page content
    await page.waitForTimeout(300);
}

/**
 * Get current page title from the PageHeader component
 */
export async function getPageTitle(page: Page): Promise<string> {
    const header = page.locator('.page-header h1, .page-header .page-title');
    if (await header.count() > 0) {
        return await header.first().textContent() || '';
    }
    return '';
}

/**
 * Create a unique session name for testing
 */
export function uniqueSessionName(prefix: string = 'pw-test'): string {
    return `${prefix}-${Date.now()}`;
}
