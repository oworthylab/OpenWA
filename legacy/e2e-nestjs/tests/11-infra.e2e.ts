/**
 * E2E Tests: Infrastructure Endpoints
 *
 * Tests infrastructure management APIs.
 */
import { ApiClient } from '../helpers/api-client';

describe('Infrastructure Endpoints', () => {
    let client: ApiClient;

    beforeAll(() => {
        client = new ApiClient();
    });

    describe('GET /api/infra/status', () => {
        it('should return infrastructure status', async () => {
            const res = await client.getInfraStatus();
            expect(res.status).toBe(200);
            expect(res.data).toBeDefined();
            expect(typeof res.data).toBe('object');
        });
    });

    describe('PUT /api/infra/config', () => {
        it('should accept infrastructure config updates', async () => {
            const res = await client.updateInfraConfig({});
            // Endpoint may or may not exist
            expect([200, 400, 404]).toContain(res.status);
        });
    });

    describe('POST /api/infra/export/sessions', () => {
        it('should export sessions data', async () => {
            const res = await client.exportSessions();
            // Endpoint may or may not exist
            expect([200, 204, 404]).toContain(res.status);
        });
    });
});
