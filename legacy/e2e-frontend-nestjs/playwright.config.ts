import { defineConfig } from '@playwright/test';

/**
 * Playwright configuration for OpenWA Dashboard E2E tests.
 *
 * These tests run against a PRODUCTION-LIKE environment:
 * - Dashboard: nginx serving built static files (same as production)
 * - Backend: node dist/main in production mode (same as production)
 * - Proxy: nginx proxies /api to backend (same as production)
 *
 * Setup:
 *   cd e2e-frontend
 *   docker compose -f docker-compose.e2e.yml up --build -d
 *   npx playwright test
 *   docker compose -f docker-compose.e2e.yml down
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
        baseURL: process.env.BASE_URL || 'http://localhost:2886',
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
});
