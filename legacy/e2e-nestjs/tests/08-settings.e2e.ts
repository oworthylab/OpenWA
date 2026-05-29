/**
 * E2E Tests: Settings Endpoint
 *
 * Tests application settings management.
 */
import { ApiClient, createClientWithKey } from '../helpers/api-client';

describe('Settings Endpoints', () => {
    let adminClient: ApiClient;

    beforeAll(() => {
        adminClient = new ApiClient();
    });

    describe('GET /api/settings', () => {
        it('should return current settings', async () => {
            const res = await adminClient.getSettings();
            expect(res.status).toBe(200);
            expect(res.data).toHaveProperty('general');
            expect(res.data).toHaveProperty('api');
            expect(res.data).toHaveProperty('notifications');
        });

        it('should include expected general settings', async () => {
            const res = await adminClient.getSettings();
            expect(res.data.general).toHaveProperty('apiBaseUrl');
            expect(res.data.general).toHaveProperty('autoReconnect');
        });

        it('should include expected api settings', async () => {
            const res = await adminClient.getSettings();
            expect(res.data.api).toHaveProperty('rateLimit');
            expect(res.data.api).toHaveProperty('enableDocs');
        });
    });

    describe('PUT /api/settings', () => {
        it('should update general settings', async () => {
            const res = await adminClient.updateSettings({
                general: {
                    autoReconnect: true,
                },
            });
            expect(res.status).toBe(200);
            expect(res.data.general.autoReconnect).toBe(true);
        });

        it('should update notification settings', async () => {
            const res = await adminClient.updateSettings({
                notifications: {
                    webhookAlerts: false,
                },
            });
            expect(res.status).toBe(200);
            expect(res.data.notifications.webhookAlerts).toBe(false);
        });

        it('should preserve other settings when updating partial', async () => {
            // Get current settings
            const before = await adminClient.getSettings();
            const currentApiSettings = before.data.api;

            // Update only general
            await adminClient.updateSettings({
                general: { debugMode: true },
            });

            // Check api settings unchanged
            const after = await adminClient.getSettings();
            expect(after.data.api.rateLimit).toBe(currentApiSettings.rateLimit);
            expect(after.data.api.enableDocs).toBe(currentApiSettings.enableDocs);
        });

        it('should reject non-admin access for updating settings', async () => {
            // Create an operator key
            const keyRes = await adminClient.createApiKey({ name: 'settings-test-op', role: 'operator' });
            const opClient = createClientWithKey(keyRes.data.apiKey);

            const res = await opClient.updateSettings({
                general: { debugMode: false },
            });
            expect(res.status).toBe(401);

            // Clean up
            await adminClient.deleteApiKey(keyRes.data.id);
        });
    });
});
