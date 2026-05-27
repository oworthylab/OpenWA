/**
 * E2E Tests: Channel Endpoints (WhatsApp Newsletters)
 *
 * Tests WhatsApp Channel/Newsletter APIs.
 */
import { ApiClient } from '../helpers/api-client';

describe('Channel Endpoints', () => {
    let client: ApiClient;
    let sessionId: string;

    beforeAll(async () => {
        client = new ApiClient();
        const name = `e2e-channels-${Date.now()}`;
        const res = await client.createSession({ name });
        expect(res.status).toBe(201);
        sessionId = res.data.id;
    });

    afterAll(async () => {
        if (sessionId) {
            await client.deleteSession(sessionId);
        }
    });

    describe('GET /api/sessions/:sessionId/channels', () => {
        it('should handle channels request when session not connected', async () => {
            const res = await client.getChannels(sessionId);
            expect([200, 400, 500]).toContain(res.status);
            if (res.status === 200) {
                expect(Array.isArray(res.data)).toBe(true);
            }
        });

        it('should return error for non-existent session', async () => {
            const res = await client.getChannels('non-existent');
            expect([404, 500]).toContain(res.status);
        });
    });
});
