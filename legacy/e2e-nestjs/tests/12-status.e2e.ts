/**
 * E2E Tests: Status Endpoints (WhatsApp Stories)
 *
 * Tests WhatsApp Status/Stories APIs.
 */
import { ApiClient } from '../helpers/api-client';

describe('Status (Stories) Endpoints', () => {
    let client: ApiClient;
    let sessionId: string;

    beforeAll(async () => {
        client = new ApiClient();
        const name = `e2e-status-${Date.now()}`;
        const res = await client.createSession({ name });
        expect(res.status).toBe(201);
        sessionId = res.data.id;
    });

    afterAll(async () => {
        if (sessionId) {
            await client.deleteSession(sessionId);
        }
    });

    describe('GET /api/sessions/:sessionId/status', () => {
        it('should handle status request when session not connected', async () => {
            const res = await client.getStatuses(sessionId);
            expect([200, 400, 404, 500]).toContain(res.status);
            if (res.status === 200) {
                expect(Array.isArray(res.data)).toBe(true);
            }
        });

        it('should return error for non-existent session', async () => {
            const res = await client.getStatuses('non-existent');
            expect([404, 500]).toContain(res.status);
        });
    });

    describe('POST /api/sessions/:sessionId/status/send-text', () => {
        it('should reject when session not connected', async () => {
            const res = await client.sendTextStatus(sessionId, {
                text: 'Test status update',
            });
            expect([400, 404, 500]).toContain(res.status);
        });

        it('should return error for non-existent session', async () => {
            const res = await client.sendTextStatus('non-existent', {
                text: 'Test status',
            });
            expect([400, 404, 500]).toContain(res.status);
        });
    });
});
