/**
 * E2E Tests: Labels Endpoints (WhatsApp Business)
 *
 * Tests WhatsApp Business label management APIs.
 */
import { ApiClient } from '../helpers/api-client';

describe('Labels Endpoints', () => {
    let client: ApiClient;
    let sessionId: string;

    beforeAll(async () => {
        client = new ApiClient();
        const name = `e2e-labels-${Date.now()}`;
        const res = await client.createSession({ name });
        expect(res.status).toBe(201);
        sessionId = res.data.id;
    });

    afterAll(async () => {
        if (sessionId) {
            await client.deleteSession(sessionId);
        }
    });

    describe('GET /api/sessions/:sessionId/labels', () => {
        it('should handle labels request when session not connected', async () => {
            const res = await client.getLabels(sessionId);
            expect([200, 400, 500]).toContain(res.status);
            if (res.status === 200) {
                expect(Array.isArray(res.data)).toBe(true);
            }
        });

        it('should return error for non-existent session', async () => {
            const res = await client.getLabels('non-existent');
            expect([404, 500]).toContain(res.status);
        });
    });

    describe('GET /api/sessions/:sessionId/labels/chat/:chatId', () => {
        it('should handle chat labels request when session not connected', async () => {
            const res = await client.getChatLabels(sessionId, '628123456789@c.us');
            expect([200, 400, 404, 500]).toContain(res.status);
        });
    });
});
