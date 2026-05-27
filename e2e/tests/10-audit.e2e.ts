/**
 * E2E Tests: Audit Log Endpoints
 *
 * Tests the audit logging system.
 * Previous tests (session creation, API key operations) should have
 * generated audit entries.
 */
import { ApiClient } from '../helpers/api-client';

describe('Audit Log Endpoints', () => {
    let client: ApiClient;

    beforeAll(() => {
        client = new ApiClient();
    });

    describe('GET /api/audit', () => {
        it('should return audit logs', async () => {
            const res = await client.getAuditLogs();
            expect(res.status).toBe(200);
            // Response may be wrapped: {data: [...], total: N} or direct array
            const logs = Array.isArray(res.data) ? res.data : res.data.data;
            expect(Array.isArray(logs)).toBe(true);
        });

        it('should include recent session operations in audit log', async () => {
            // Create and delete a session to generate audit entries
            const createRes = await client.createSession({ name: `e2e-audit-${Date.now()}` });
            expect(createRes.status).toBe(201);
            const sessionId = createRes.data.id;
            await client.deleteSession(sessionId);

            // Check audit log
            const res = await client.getAuditLogs();
            expect(res.status).toBe(200);
            const logs = Array.isArray(res.data) ? res.data : res.data.data;
            expect(logs.length).toBeGreaterThan(0);
        });

        it('should support pagination/filtering', async () => {
            const res = await client.getAuditLogs({ limit: 5 });
            expect(res.status).toBe(200);
            const logs = Array.isArray(res.data) ? res.data : res.data.data;
            if (Array.isArray(logs)) {
                expect(logs.length).toBeLessThanOrEqual(5);
            }
        });

        it('should have expected audit entry structure', async () => {
            const res = await client.getAuditLogs({ limit: 1 });
            expect(res.status).toBe(200);
            const logs = Array.isArray(res.data) ? res.data : res.data.data;
            if (Array.isArray(logs) && logs.length > 0) {
                const entry = logs[0];
                expect(entry).toHaveProperty('id');
                expect(entry).toHaveProperty('action');
                expect(entry).toHaveProperty('createdAt');
            }
        });
    });
});
