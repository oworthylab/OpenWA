/**
 * E2E Tests: Authentication & API Key Management
 *
 * Tests the full authentication lifecycle:
 * - API key validation
 * - Key creation (ADMIN only)
 * - Key listing and details
 * - Key update, revoke, and deletion
 * - Role-based access control
 * - Unauthenticated access rejection
 */
import { ApiClient, createUnauthenticatedClient, createClientWithKey } from '../helpers/api-client';

describe('Authentication & API Keys', () => {
    let adminClient: ApiClient;
    let unauthClient: ApiClient;

    beforeAll(() => {
        adminClient = new ApiClient(); // Uses dev-admin-key
        unauthClient = createUnauthenticatedClient();
    });

    describe('Authentication enforcement', () => {
        it('should reject requests without API key', async () => {
            const res = await unauthClient.listSessions();
            expect(res.status).toBe(401);
        });

        it('should reject requests with invalid API key', async () => {
            const invalidClient = createClientWithKey('invalid-key-12345');
            const res = await invalidClient.listSessions();
            expect(res.status).toBe(401);
        });

        it('should accept requests with valid admin key', async () => {
            const res = await adminClient.listSessions();
            expect(res.status).toBe(200);
        });
    });

    describe('POST /api/auth/api-keys (Create API Key)', () => {
        it('should create a new operator key', async () => {
            const res = await adminClient.createApiKey({
                name: 'Test Operator Key',
                role: 'operator',
            });
            expect(res.status).toBe(201);
            expect(res.data).toHaveProperty('id');
            expect(res.data).toHaveProperty('apiKey');
            expect(res.data.name).toBe('Test Operator Key');
            expect(res.data.role).toBe('operator');
            expect(res.data.isActive).toBe(true);
            // Store for later tests
            (global as any).__testOperatorKeyId = res.data.id;
            (global as any).__testOperatorKeyRaw = res.data.apiKey;
        });

        it('should create a viewer key', async () => {
            const res = await adminClient.createApiKey({
                name: 'Test Viewer Key',
                role: 'viewer',
            });
            expect(res.status).toBe(201);
            expect(res.data.role).toBe('viewer');
            (global as any).__testViewerKeyId = res.data.id;
            (global as any).__testViewerKeyRaw = res.data.apiKey;
        });

        it('should create a key with expiration', async () => {
            const futureDate = new Date(Date.now() + 86400000).toISOString(); // +1 day
            const res = await adminClient.createApiKey({
                name: 'Expiring Key',
                role: 'operator',
                expiresAt: futureDate,
            });
            expect(res.status).toBe(201);
            expect(res.data.expiresAt).toBeDefined();
            (global as any).__testExpiringKeyId = res.data.id;
        });

        it('should reject creation by non-admin', async () => {
            const operatorClient = createClientWithKey((global as any).__testOperatorKeyRaw);
            const res = await operatorClient.createApiKey({
                name: 'Should Fail',
                role: 'viewer',
            });
            expect(res.status).toBe(401);
        });
    });

    describe('GET /api/auth/api-keys (List API Keys)', () => {
        it('should list all API keys', async () => {
            const res = await adminClient.listApiKeys();
            expect(res.status).toBe(200);
            expect(Array.isArray(res.data)).toBe(true);
            expect(res.data.length).toBeGreaterThanOrEqual(3); // admin + operator + viewer created above
        });

        it('should not expose key hashes in listing', async () => {
            const res = await adminClient.listApiKeys();
            for (const key of res.data) {
                expect(key).not.toHaveProperty('keyHash');
                expect(key).toHaveProperty('keyPrefix');
                expect(key).toHaveProperty('id');
                expect(key).toHaveProperty('name');
                expect(key).toHaveProperty('role');
            }
        });

        it('should reject listing by non-admin', async () => {
            const operatorClient = createClientWithKey((global as any).__testOperatorKeyRaw);
            const res = await operatorClient.listApiKeys();
            expect(res.status).toBe(401);
        });
    });

    describe('GET /api/auth/api-keys/:id (Get Key Details)', () => {
        it('should get a specific API key by id', async () => {
            const keyId = (global as any).__testOperatorKeyId;
            const res = await adminClient.getApiKey(keyId);
            expect(res.status).toBe(200);
            expect(res.data.id).toBe(keyId);
            expect(res.data.name).toBe('Test Operator Key');
        });

        it('should return 404 for non-existent key', async () => {
            const res = await adminClient.getApiKey('non-existent-id');
            expect(res.status).toBe(404);
        });
    });

    describe('PUT /api/auth/api-keys/:id (Update Key)', () => {
        it('should update key name', async () => {
            const keyId = (global as any).__testOperatorKeyId;
            const res = await adminClient.updateApiKey(keyId, {
                name: 'Updated Operator Key',
            });
            expect(res.status).toBe(200);
            expect(res.data.name).toBe('Updated Operator Key');
        });
    });

    describe('POST /api/auth/api-keys/:id/revoke (Revoke Key)', () => {
        it('should revoke an API key', async () => {
            const keyId = (global as any).__testExpiringKeyId;
            const res = await adminClient.revokeApiKey(keyId);
            expect([200, 201]).toContain(res.status);
            expect(res.data.isActive).toBe(false);
        });

        it('should reject requests with revoked key', async () => {
            // First create a new key, then revoke it, then try to use it
            const createRes = await adminClient.createApiKey({
                name: 'To Be Revoked',
                role: 'operator',
            });
            const rawKey = createRes.data.apiKey;
            const keyId = createRes.data.id;

            // Verify it works
            const validClient = createClientWithKey(rawKey);
            const validRes = await validClient.listSessions();
            expect(validRes.status).toBe(200);

            // Revoke
            await adminClient.revokeApiKey(keyId);

            // Verify it no longer works
            const revokedRes = await validClient.listSessions();
            expect(revokedRes.status).toBe(401);
        });
    });

    describe('Role-based access control', () => {
        it('viewer should be able to read sessions', async () => {
            const viewerClient = createClientWithKey((global as any).__testViewerKeyRaw);
            const res = await viewerClient.listSessions();
            expect(res.status).toBe(200);
        });

        it('viewer should NOT be able to create sessions', async () => {
            const viewerClient = createClientWithKey((global as any).__testViewerKeyRaw);
            const res = await viewerClient.createSession({ name: 'viewer-attempt' });
            expect(res.status).toBe(401);
        });

        it('operator should be able to create sessions', async () => {
            const operatorClient = createClientWithKey((global as any).__testOperatorKeyRaw);
            const res = await operatorClient.createSession({ name: 'operator-test-session' });
            // Should succeed (201) or fail with session-related error (not 401)
            expect(res.status).not.toBe(401);
        });
    });

    describe('DELETE /api/auth/api-keys/:id (Delete Key)', () => {
        it('should delete an API key', async () => {
            const keyId = (global as any).__testExpiringKeyId;
            const res = await adminClient.deleteApiKey(keyId);
            expect(res.status).toBe(204);
        });

        it('should return 404 after deletion', async () => {
            const keyId = (global as any).__testExpiringKeyId;
            const res = await adminClient.getApiKey(keyId);
            expect(res.status).toBe(404);
        });
    });
});
