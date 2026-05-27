/**
 * E2E Tests: Statistics Endpoints
 *
 * Tests the stats/analytics APIs.
 */
import { ApiClient } from '../helpers/api-client';

describe('Statistics Endpoints', () => {
    let client: ApiClient;

    beforeAll(() => {
        client = new ApiClient();
    });

    describe('GET /api/stats/overview', () => {
        it('should return overview statistics', async () => {
            const res = await client.getStatsOverview();
            expect(res.status).toBe(200);
            expect(res.data).toBeDefined();
            // Should have some stats structure
            expect(typeof res.data).toBe('object');
        });
    });

    describe('GET /api/stats/messages', () => {
        it('should return message statistics', async () => {
            const res = await client.getMessageStats();
            expect(res.status).toBe(200);
            expect(res.data).toBeDefined();
        });

        it('should accept period parameter', async () => {
            const res = await client.getMessageStats('24h');
            expect(res.status).toBe(200);
        });

        it('should accept different time periods', async () => {
            const periods = ['24h', '7d', '30d'];
            for (const period of periods) {
                const res = await client.getMessageStats(period);
                expect(res.status).toBe(200);
            }
        });
    });

    describe('GET /api/stats/sessions/:sessionId', () => {
        it('should return stats for a specific session', async () => {
            // Create a session first
            const createRes = await client.createSession({ name: `e2e-stats-${Date.now()}` });
            expect(createRes.status).toBe(201);
            const sessionId = createRes.data.id;

            const res = await client.getSessionStats(sessionId);
            expect([200, 404]).toContain(res.status);

            // Clean up
            await client.deleteSession(sessionId);
        });

        it('should handle non-existent session', async () => {
            const res = await client.getSessionStats('non-existent-session');
            expect([200, 404]).toContain(res.status);
        });
    });
});
