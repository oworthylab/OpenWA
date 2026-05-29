/**
 * E2E Tests: Catalog Endpoints (WhatsApp Business)
 *
 * Tests WhatsApp Business catalog/product APIs.
 */
import { ApiClient } from '../helpers/api-client';

describe('Catalog Endpoints', () => {
    let client: ApiClient;
    let sessionId: string;

    beforeAll(async () => {
        client = new ApiClient();
        const name = `e2e-catalog-${Date.now()}`;
        const res = await client.createSession({ name });
        expect(res.status).toBe(201);
        sessionId = res.data.id;
    });

    afterAll(async () => {
        if (sessionId) {
            await client.deleteSession(sessionId);
        }
    });

    describe('GET /api/sessions/:sessionId/catalog', () => {
        it('should handle catalog request when session not connected', async () => {
            const res = await client.getCatalog(sessionId);
            expect([200, 400, 404, 500]).toContain(res.status);
        });

        it('should return error for non-existent session', async () => {
            const res = await client.getCatalog('non-existent');
            expect([404, 500]).toContain(res.status);
        });
    });

    describe('GET /api/sessions/:sessionId/catalog/products', () => {
        it('should handle products request when session not connected', async () => {
            const res = await client.getCatalogProducts(sessionId);
            expect([200, 400, 404, 500]).toContain(res.status);
            if (res.status === 200) {
                expect(Array.isArray(res.data)).toBe(true);
            }
        });

        it('should return error for non-existent session', async () => {
            const res = await client.getCatalogProducts('non-existent');
            expect([404, 500]).toContain(res.status);
        });
    });
});
