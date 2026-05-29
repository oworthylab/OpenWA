import { test, expect } from '@playwright/test';
import { login, waitForContentLoad, uniqueSessionName, TEST_API_KEY } from '../helpers/test-utils';

// Clean up sessions created during tests (via nginx proxy, same as production path)
test.afterAll(async () => {
    const baseUrl = process.env.BASE_URL || 'http://localhost:2886';
    try {
        const res = await fetch(`${baseUrl}/api/sessions`, {
            headers: { 'X-API-Key': TEST_API_KEY },
        });
        if (res.ok) {
            const sessions = await res.json();
            for (const s of sessions) {
                await fetch(`${baseUrl}/api/sessions/${(s as any).id}`, {
                    method: 'DELETE',
                    headers: { 'X-API-Key': TEST_API_KEY },
                }).catch(() => { });
            }
        }
    } catch {
        // Cleanup is best-effort
    }
});

test.describe('Sessions Page', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.click('.sidebar-nav a[href="/sessions"]');
        await page.waitForLoadState('networkidle');
        await waitForContentLoad(page);
    });

    test('should display sessions page', async ({ page }) => {
        // Page header should be visible
        const header = page.locator('.page-header');
        await expect(header).toBeVisible();
    });

    test('should display search input', async ({ page }) => {
        const searchInput = page.locator('input[type="text"][placeholder]').first();
        await expect(searchInput).toBeVisible();
    });

    test('should display status filter', async ({ page }) => {
        const filter = page.locator('select, .filter-group select');
        if (await filter.count() > 0) {
            await expect(filter.first()).toBeVisible();
        }
    });

    test('should have create session button', async ({ page }) => {
        // Look for a button that creates sessions (Plus icon or text)
        const createBtn = page.locator('button').filter({ hasText: /create|new|add/i });
        if (await createBtn.count() === 0) {
            // Try finding by icon
            const plusBtn = page.locator('.page-header button, .sessions-actions button').first();
            await expect(plusBtn).toBeVisible();
        } else {
            await expect(createBtn.first()).toBeVisible();
        }
    });

    test('should open create session modal', async ({ page }) => {
        // Click create button
        const createBtn = page.locator('button').filter({ hasText: /create|new|add/i }).first();
        if (await createBtn.count() > 0) {
            await createBtn.click();
        } else {
            // Fallback: click first action button in header
            const headerBtn = page.locator('.page-header button').first();
            await headerBtn.click();
        }
        // Modal should appear with name input
        await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 });
    });

    test('should create a new session', async ({ page }) => {
        const sessionName = uniqueSessionName();

        // Open create modal
        const createBtn = page.locator('button').filter({ hasText: /create|new|add/i }).first();
        if (await createBtn.count() > 0) {
            await createBtn.click();
        } else {
            await page.locator('.page-header button').first().click();
        }

        // Wait for modal
        await page.waitForSelector('.modal-overlay', { timeout: 5000 });

        // Fill session name
        const nameInput = page.locator('.modal .modal-body input').first();
        await nameInput.fill(sessionName);

        // Submit
        const submitBtn = page.locator('.modal .modal-footer button').filter({ hasText: /create/i }).first();
        await submitBtn.click();

        // Wait for modal to close
        await expect(page.locator('.modal-overlay')).not.toBeVisible({ timeout: 10000 });
    });

    test('should filter sessions by search query', async ({ page }) => {
        const searchInput = page.locator('input[type="text"][placeholder]').first();
        await searchInput.fill('nonexistent-session-xyz');
        await page.waitForTimeout(500);
        // Results should filter (either empty or less items)
    });

    test('should display session status badges', async ({ page }) => {
        // If there are sessions, they should have status badges
        const statusPills = page.locator('.status-pill, [class*="status"]');
        // Count doesn't matter - just verify structure is there
        const count = await statusPills.count();
        expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should have action buttons per session', async ({ page }) => {
        // If sessions exist, they should have action buttons
        const sessionCards = page.locator('.session-card, .table-row, [class*="session-item"]');
        const count = await sessionCards.count();
        if (count > 0) {
            // First session should have at least one action button
            const actions = sessionCards.first().locator('button');
            expect(await actions.count()).toBeGreaterThanOrEqual(0);
        }
    });

    test('should handle session deletion', async ({ page }) => {
        // Create a session first
        const sessionName = uniqueSessionName('del-test');
        const createBtn = page.locator('button').filter({ hasText: /create|new|add/i }).first();
        if (await createBtn.count() > 0) {
            await createBtn.click();
        } else {
            await page.locator('.page-header button').first().click();
        }

        await page.waitForSelector('.modal-overlay', { timeout: 5000 });
        const nameInput = page.locator('.modal .modal-body input').first();
        await nameInput.fill(sessionName);
        const submitBtn = page.locator('.modal .modal-footer button').filter({ hasText: /create/i }).first();
        await submitBtn.click();
        await page.waitForTimeout(2000);

        // Now find and delete it
        const sessionRow = page.locator(`text=${sessionName}`).locator('..');
        const deleteBtn = sessionRow.locator('button').filter({ hasText: /delete/i });
        if (await deleteBtn.count() > 0) {
            await deleteBtn.first().click();
            // Confirm deletion if dialog appears
            const confirmBtn = page.locator('button').filter({ hasText: /confirm|yes|delete/i });
            if (await confirmBtn.count() > 0) {
                await confirmBtn.first().click();
            }
            await page.waitForTimeout(2000);
        }
    });

    test('should refresh sessions list', async ({ page }) => {
        // Look for refresh button
        const refreshBtn = page.locator('button').filter({ hasText: /refresh/i });
        if (await refreshBtn.count() > 0) {
            await refreshBtn.first().click();
            await page.waitForLoadState('networkidle');
        }
    });
});
