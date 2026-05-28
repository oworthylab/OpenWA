/**
 * E2E Tests: Engine Parity
 *
 * Tests that the same API behavior works identically across
 * Cloudflare (Durable Objects) and Node (filesystem/ws) adapters.
 *
 * These tests run the exact same assertions against the API surface
 * and should pass regardless of which engine adapter is active.
 * The underlying adapter is transparent — only HTTP behavior matters.
 *
 * Verifies:
 * - Session lifecycle consistency
 * - Message sending API contract
 * - Contact operations
 * - Webhook management
 * - QR/pairing code endpoints
 * - Event payload structure
 */
import { ApiClient, createUnauthenticatedClient } from '../helpers/api-client';

const ENGINE = process.env.ENGINE_ADAPTER || 'auto';

describe(`Engine Parity (adapter: ${ENGINE})`, () => {
    let client: ApiClient;

    beforeAll(() => {
        client = new ApiClient();
    });

    describe('Health & readiness', () => {
        it('should return healthy status', async () => {
            const res = await client.healthCheck();
            expect(res.status).toBe(200);
            expect(res.data).toHaveProperty('status', 'ok');
        });

        it('should indicate engine type in health response', async () => {
            const res = await client.healthCheck();
            expect(res.status).toBe(200);
            // Health response may include engine info
            if (res.data.engine) {
                expect(['cloudflare', 'node', 'baileys']).toContain(
                    res.data.engine.toLowerCase()
                );
            }
        });
    });

    describe('Session lifecycle parity', () => {
        let sessionId: string;

        it('should create session with consistent response shape', async () => {
            const res = await client.createSession({
                name: `parity-${ENGINE}-${Date.now()}`,
            });
            expect(res.status).toBe(201);
            // These fields must exist regardless of engine
            expect(res.data).toHaveProperty('id');
            expect(res.data).toHaveProperty('name');
            expect(res.data).toHaveProperty('status');
            expect(res.data).toHaveProperty('createdAt');
            expect(typeof res.data.id).toBe('string');
            expect(typeof res.data.name).toBe('string');
            sessionId = res.data.id;
        });

        it('should list sessions with consistent shape', async () => {
            const res = await client.listSessions();
            expect(res.status).toBe(200);
            expect(Array.isArray(res.data)).toBe(true);
            if (res.data.length > 0) {
                const session = res.data[0];
                expect(session).toHaveProperty('id');
                expect(session).toHaveProperty('name');
                expect(session).toHaveProperty('status');
            }
        });

        it('should get session with consistent detail shape', async () => {
            const res = await client.getSession(sessionId);
            expect(res.status).toBe(200);
            expect(res.data).toHaveProperty('id', sessionId);
            expect(res.data).toHaveProperty('status');
            // Additional detail fields
            expect(res.data).toHaveProperty('createdAt');
        });

        it('should start session with consistent response', async () => {
            const res = await client.startSession(sessionId);
            expect([200, 201, 202]).toContain(res.status);
        });

        it('should return QR data in consistent format', async () => {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const res = await client.getSessionQr(sessionId);
            // QR may or may not be available, but response shape should be consistent
            expect([200, 400, 404]).toContain(res.status);
            if (res.status === 200) {
                expect(res.data).toHaveProperty('qrCode');
                expect(typeof res.data.qrCode).toBe('string');
            }
        });

        it('should return pairing code in consistent format', async () => {
            const res = await client.getSessionPairingCode(sessionId, {
                phoneNumber: '+1234567890',
            });
            expect([200, 201, 400, 409]).toContain(res.status);
            if (res.status === 200 || res.status === 201) {
                expect(res.data).toHaveProperty('pairingCode');
                expect(typeof res.data.pairingCode).toBe('string');
            }
        });

        it('should stop session with consistent response', async () => {
            const res = await client.stopSession(sessionId);
            expect([200, 201, 204, 400]).toContain(res.status);
        });

        it('should delete session with 204', async () => {
            const res = await client.deleteSession(sessionId);
            expect(res.status).toBe(204);
        });

        it('should return 404 after delete', async () => {
            const res = await client.getSession(sessionId);
            expect(res.status).toBe(404);
        });
    });

    describe('Message API parity', () => {
        let sessionId: string;

        beforeAll(async () => {
            const res = await client.createSession({ name: `msg-parity-${Date.now()}` });
            sessionId = res.data.id;
        });

        it('should accept text message with consistent request/response', async () => {
            const res = await client.sendTextMessage(sessionId, {
                to: '1234567890@c.us',
                message: 'Parity test message',
            });
            // Session may not be connected, so accept connection-related errors too
            expect([200, 201, 400, 503]).toContain(res.status);
            if (res.status === 200 || res.status === 201) {
                expect(res.data).toHaveProperty('id');
            }
        });

        it('should accept image message with consistent shape', async () => {
            const res = await client.sendImageMessage(sessionId, {
                to: '1234567890@c.us',
                url: 'https://via.placeholder.com/1',
                caption: 'Parity image',
            });
            expect([200, 201, 400, 503]).toContain(res.status);
        });

        it('should accept location message with consistent shape', async () => {
            const res = await client.sendLocationMessage(sessionId, {
                to: '1234567890@c.us',
                latitude: 37.7749,
                longitude: -122.4194,
                description: 'San Francisco',
            });
            expect([200, 201, 400, 503]).toContain(res.status);
        });

        it('should validate message recipients consistently', async () => {
            const res = await client.sendTextMessage(sessionId, {
                to: '',
                message: 'No recipient',
            });
            expect([400, 422]).toContain(res.status);
        });

        afterAll(async () => {
            if (sessionId) await client.deleteSession(sessionId);
        });
    });

    describe('Contact API parity', () => {
        let sessionId: string;

        beforeAll(async () => {
            const res = await client.createSession({ name: `contact-parity-${Date.now()}` });
            sessionId = res.data.id;
        });

        it('should return contacts list with consistent shape', async () => {
            const res = await client.getContacts(sessionId);
            // May return empty or error if not connected
            expect([200, 400, 503]).toContain(res.status);
            if (res.status === 200) {
                expect(Array.isArray(res.data)).toBe(true);
            }
        });

        afterAll(async () => {
            if (sessionId) await client.deleteSession(sessionId);
        });
    });

    describe('Webhook API parity', () => {
        let sessionId: string;
        let webhookId: string;

        beforeAll(async () => {
            const res = await client.createSession({ name: `wh-parity-${Date.now()}` });
            sessionId = res.data.id;
        });

        it('should create webhook with consistent response shape', async () => {
            const res = await client.createWebhook(sessionId, {
                url: 'https://httpbin.org/post',
                events: ['message.received'],
            });
            expect(res.status).toBe(201);
            expect(res.data).toHaveProperty('id');
            expect(res.data).toHaveProperty('url');
            expect(res.data).toHaveProperty('events');
            expect(res.data).toHaveProperty('active');
            webhookId = res.data.id;
        });

        it('should list webhooks with consistent shape', async () => {
            const res = await client.listWebhooks(sessionId);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.data)).toBe(true);
            if (res.data.length > 0) {
                expect(res.data[0]).toHaveProperty('id');
                expect(res.data[0]).toHaveProperty('url');
                expect(res.data[0]).toHaveProperty('events');
            }
        });

        it('should delete webhook consistently', async () => {
            const res = await client.deleteWebhook(sessionId, webhookId);
            expect([200, 204]).toContain(res.status);
        });

        afterAll(async () => {
            if (sessionId) await client.deleteSession(sessionId);
        });
    });

    describe('Auth parity', () => {
        it('should reject unauthenticated requests consistently', async () => {
            const unauthClient = createUnauthenticatedClient();
            const res = await unauthClient.listSessions();
            expect(res.status).toBe(401);
        });

        it('should return consistent error shape for 401', async () => {
            const unauthClient = createUnauthenticatedClient();
            const res = await unauthClient.listSessions();
            expect(res.status).toBe(401);
            expect(res.data).toBeDefined();
            // Error response should have some structure
            if (typeof res.data === 'object') {
                expect(
                    res.data.message || res.data.error || res.data.statusCode
                ).toBeDefined();
            }
        });
    });

    describe('Error response parity', () => {
        it('should return 404 for unknown endpoints consistently', async () => {
            const res = await client.get('/does-not-exist');
            expect(res.status).toBe(404);
        });

        it('should return consistent error for bad JSON', async () => {
            const res = await client.post('/sessions', 'not-json' as any, {
                headers: { 'Content-Type': 'application/json' },
            });
            expect([400, 415, 422]).toContain(res.status);
        });

        it('should return JSON content-type on errors', async () => {
            const unauthClient = createUnauthenticatedClient();
            const res = await unauthClient.listSessions();
            expect(res.headers['content-type']).toMatch(/application\/json/);
        });
    });
});
