import { defineConfig } from '@playwright/test';

/**
 * Playwright configuration for OpenWA Dashboard E2E tests.
 *
 * These tests are stack-agnostic - they test the UI behavior through the browser
 * without depending on React/Vite/any specific framework internals.
 *
 * Prerequisites:
 * - Backend API running on port 2785 (Docker container)
 * - Dashboard dev server running on port 2886 (Vite)
 */
export default defineConfig({
    testDir: './tests',
    globalSetup: './helpers/global-setup.ts',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: [['html', { open: 'never' }], ['list']],
    timeout: 45000,
    expect: {
        timeout: 10000,
    },
    use: {
        baseURL: 'http://localhost:2886',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        headless: true,
    },
    projects: [
        {
            name: 'chromium',
            use: { browserName: 'chromium' },
        },
    ],
    webServer: [
        {
            command: 'cd ../dashboard && npm run dev',
            port: 2886,
            reuseExistingServer: true,
            timeout: 30000,
        },
    ],
});
