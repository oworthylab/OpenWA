/**
 * E2E Tests: Health Endpoints
 *
 * Tests the health check endpoints which are public (no auth required).
 * These validate the basic service availability.
 */
import { ApiClient, createUnauthenticatedClient } from '../helpers/api-client';

describe('Health Endpoints', () => {
    let client: ApiClient;
    let unauthClient: ApiClient;

    beforeAll(() => {
        client = new ApiClient();
        unauthClient = createUnauthenticatedClient();
    });

    describe('GET /api/health', () => {
        it('should return 200 with ok status', async () => {
            const res = await client.healthCheck();
            expect(res.status).toBe(200);
            expect(res.data).toHaveProperty('status', 'ok');
            expect(res.data).toHaveProperty('timestamp');
        });

        it('should be accessible without authentication', async () => {
            const res = await unauthClient.healthCheck();
            expect(res.status).toBe(200);
            expect(res.data.status).toBe('ok');
        });

        it('should return a valid ISO timestamp', async () => {
            const res = await client.healthCheck();
            const timestamp = new Date(res.data.timestamp);
            expect(timestamp.getTime()).not.toBeNaN();
        });
    });

    describe('GET /api/health/live', () => {
        it('should return 200 with ok status (liveness probe)', async () => {
            const res = await client.healthLive();
            expect(res.status).toBe(200);
            expect(res.data).toHaveProperty('status', 'ok');
        });

        it('should be accessible without authentication', async () => {
            const res = await unauthClient.healthLive();
            expect(res.status).toBe(200);
        });
    });

    describe('GET /api/health/ready', () => {
        it('should return 200 with ok status (readiness probe)', async () => {
            const res = await client.healthReady();
            expect(res.status).toBe(200);
            expect(res.data).toHaveProperty('status', 'ok');
        });

        it('should include details about dependencies', async () => {
            const res = await client.healthReady();
            expect(res.data).toHaveProperty('details');
            expect(res.data.details).toHaveProperty('database');
        });

        it('should be accessible without authentication', async () => {
            const res = await unauthClient.healthReady();
            expect(res.status).toBe(200);
        });
    });
});
