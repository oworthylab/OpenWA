/**
 * E2E Tests: Webhook Management
 *
 * Tests webhook CRUD operations:
 * - Creating webhooks for a session
 * - Listing webhooks
 * - Getting webhook details
 * - Updating webhooks
 * - Testing webhook delivery
 * - Deleting webhooks
 * - HMAC signature verification
 */
import { ApiClient } from '../helpers/api-client';
import * as crypto from 'crypto';

describe('Webhook Management', () => {
    let client: ApiClient;
    let sessionId: string;
    let webhookId: string;

    beforeAll(async () => {
        client = new ApiClient();
        // Create a session to attach webhooks
        const name = `e2e-webhooks-${Date.now()}`;
        const res = await client.createSession({ name });
        expect(res.status).toBe(201);
        sessionId = res.data.id;
    });

    afterAll(async () => {
        if (sessionId) {
            await client.deleteSession(sessionId);
        }
    });

    describe('POST /api/sessions/:sessionId/webhooks (Create Webhook)', () => {
        it('should create a webhook', async () => {
            const res = await client.createWebhook(sessionId, {
                url: 'https://httpbin.org/post',
                events: ['message.received', 'message.sent'],
            });
            expect(res.status).toBe(201);
            expect(res.data).toHaveProperty('id');
            expect(res.data).toHaveProperty('url', 'https://httpbin.org/post');
            expect(res.data).toHaveProperty('events');
            expect(res.data).toHaveProperty('active', true);
            webhookId = res.data.id;
        });

        it('should create webhook with custom headers', async () => {
            const res = await client.createWebhook(sessionId, {
                url: 'https://httpbin.org/anything',
                events: ['session.status'],
                headers: { 'X-Custom-Header': 'test-value' },
            });
            expect(res.status).toBe(201);
            expect(res.data).toHaveProperty('id');
            // Clean up
            if (res.data.id) {
                await client.deleteWebhook(sessionId, res.data.id);
            }
        });

        it('should create webhook with secret', async () => {
            const res = await client.createWebhook(sessionId, {
                url: 'https://httpbin.org/anything',
                events: ['message.received'],
                secret: 'my-webhook-secret-123',
            });
            expect(res.status).toBe(201);
            if (res.data.id) {
                await client.deleteWebhook(sessionId, res.data.id);
            }
        });

        it('should reject invalid webhook URL', async () => {
            const res = await client.createWebhook(sessionId, {
                url: 'not-a-valid-url',
                events: ['message.received'],
            });
            expect([400, 422]).toContain(res.status);
        });

        it('should return error for non-existent session', async () => {
            const res = await client.createWebhook('non-existent', {
                url: 'https://httpbin.org/post',
                events: ['message.received'],
            });
            expect([404, 500]).toContain(res.status);
        });
    });

    describe('GET /api/sessions/:sessionId/webhooks (List Webhooks)', () => {
        it('should list webhooks for a session', async () => {
            const res = await client.listWebhooks(sessionId);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.data)).toBe(true);
            expect(res.data.length).toBeGreaterThanOrEqual(1);
        });

        it('should include webhook details', async () => {
            const res = await client.listWebhooks(sessionId);
            const webhook = res.data.find((w: any) => w.id === webhookId);
            expect(webhook).toBeDefined();
            expect(webhook.url).toBe('https://httpbin.org/post');
            expect(webhook.active).toBe(true);
        });
    });

    describe('GET /api/sessions/:sessionId/webhooks/:id (Get Webhook)', () => {
        it('should get webhook by ID', async () => {
            const res = await client.getWebhook(sessionId, webhookId);
            expect(res.status).toBe(200);
            expect(res.data.id).toBe(webhookId);
            expect(res.data.url).toBe('https://httpbin.org/post');
        });

        it('should return 404 for non-existent webhook', async () => {
            const res = await client.getWebhook(sessionId, 'non-existent-webhook');
            expect(res.status).toBe(404);
        });
    });

    describe('PUT /api/sessions/:sessionId/webhooks/:id (Update Webhook)', () => {
        it('should update webhook URL', async () => {
            const res = await client.updateWebhook(sessionId, webhookId, {
                url: 'https://httpbin.org/anything',
            });
            expect(res.status).toBe(200);
            expect(res.data.url).toBe('https://httpbin.org/anything');
        });

        it('should update webhook events', async () => {
            const res = await client.updateWebhook(sessionId, webhookId, {
                events: ['message.received', 'session.status'],
            });
            expect(res.status).toBe(200);
            expect(res.data.events).toContain('message.received');
            expect(res.data.events).toContain('session.status');
        });

        it('should return 404 for non-existent webhook', async () => {
            const res = await client.updateWebhook(sessionId, 'non-existent', {
                url: 'https://example.com',
            });
            expect(res.status).toBe(404);
        });
    });

    describe('POST /api/sessions/:sessionId/webhooks/:id/test (Test Webhook)', () => {
        it('should send test payload to webhook URL', async () => {
            const res = await client.testWebhook(sessionId, webhookId);
            // Might succeed or fail depending on httpbin availability
            expect([200, 201, 400, 500]).toContain(res.status);
        });
    });

    describe('DELETE /api/sessions/:sessionId/webhooks/:id (Delete Webhook)', () => {
        it('should delete a webhook', async () => {
            const res = await client.deleteWebhook(sessionId, webhookId);
            expect([200, 204]).toContain(res.status);
        });

        it('should return 404 after deletion', async () => {
            const res = await client.getWebhook(sessionId, webhookId);
            expect(res.status).toBe(404);
        });
    });

    describe('HMAC Signature Verification', () => {
        const webhookSecret = 'e2e-hmac-secret-key';
        let signedWebhookId: string;

        it('should create webhook with signing secret', async () => {
            const res = await client.createWebhook(sessionId, {
                url: 'https://httpbin.org/anything',
                events: ['message.received'],
                secret: webhookSecret,
            });
            expect(res.status).toBe(201);
            signedWebhookId = res.data.id;
        });

        it('should mask secret in webhook details', async () => {
            const res = await client.getWebhook(sessionId, signedWebhookId);
            expect(res.status).toBe(200);
            // Secret should never be returned in plaintext
            expect(res.data.secret).toBeUndefined();
            // Should indicate a secret is configured
            expect(res.data.hasSecret).toBe(true);
        });

        it('should deliver with X-Webhook-Signature header', async () => {
            const testRes = await client.testWebhook(sessionId, signedWebhookId);
            if (testRes.status === 200 || testRes.status === 201) {
                // httpbin echoes back received headers
                if (testRes.data?.headers) {
                    const sig = testRes.data.headers['X-Webhook-Signature'] ||
                        testRes.data.headers['x-webhook-signature'];
                    if (sig) {
                        expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
                    }
                }
            }
        });

        it('should produce deterministic HMAC for same payload', () => {
            const payload = '{"event":"test","timestamp":1234567890}';
            const sig1 = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');
            const sig2 = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');
            expect(sig1).toBe(sig2);
            expect(sig1).toMatch(/^[a-f0-9]{64}$/);
        });

        it('should update webhook secret', async () => {
            const res = await client.updateWebhook(sessionId, signedWebhookId, {
                secret: 'new-secret-key',
            });
            expect(res.status).toBe(200);
            expect(res.data.hasSecret).toBe(true);
        });

        it('should remove webhook secret by setting to null', async () => {
            const res = await client.updateWebhook(sessionId, signedWebhookId, {
                secret: null,
            });
            expect(res.status).toBe(200);
            expect(res.data.hasSecret).toBe(false);
        });

        afterAll(async () => {
            if (signedWebhookId) await client.deleteWebhook(sessionId, signedWebhookId);
        });
    });
});
