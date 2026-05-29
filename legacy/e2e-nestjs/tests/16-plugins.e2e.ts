/**
 * E2E Tests: Plugins Endpoints
 *
 * Tests plugin management APIs.
 */
import { ApiClient } from '../helpers/api-client';

describe('Plugins Endpoints', () => {
    let client: ApiClient;

    beforeAll(() => {
        client = new ApiClient();
    });

    describe('GET /api/plugins', () => {
        it('should return plugins list', async () => {
            const res = await client.getPlugins();
            expect(res.status).toBe(200);
            expect(Array.isArray(res.data)).toBe(true);
        });

        it('should have expected plugin structure if any exist', async () => {
            const res = await client.getPlugins();
            if (res.data.length > 0) {
                const plugin = res.data[0];
                expect(plugin).toHaveProperty('id');
                expect(plugin).toHaveProperty('name');
            }
        });
    });

    describe('GET /api/plugins/:id', () => {
        it('should return 404 for non-existent plugin', async () => {
            const res = await client.getPlugin('non-existent-plugin');
            expect(res.status).toBe(404);
        });
    });

    describe('POST /api/plugins/:id/enable', () => {
        it('should return 404 for non-existent plugin', async () => {
            const res = await client.enablePlugin('non-existent-plugin');
            expect(res.status).toBe(404);
        });
    });

    describe('POST /api/plugins/:id/disable', () => {
        it('should return 404 for non-existent plugin', async () => {
            const res = await client.disablePlugin('non-existent-plugin');
            expect(res.status).toBe(404);
        });
    });
});
