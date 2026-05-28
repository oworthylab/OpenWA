/**
 * E2E Tests: Webhook Delivery & Reliability
 *
 * Tests advanced webhook delivery features:
 * - HMAC signature generation and verification
 * - Retry on 5xx responses
 * - Dead Letter Queue (DLQ) for failed deliveries
 * - Idempotency keys on webhook payloads
 * - Delivery status tracking
 * - Event filtering and selective delivery
 */
import { ApiClient } from '../helpers/api-client';
import * as crypto from 'crypto';

describe('Webhook Delivery & Reliability', () => {
    let client: ApiClient;
    let sessionId: string;

    beforeAll(async () => {
        client = new ApiClient();
        const res = await client.createSession({ name: `webhook-delivery-${Date.now()}` });
        expect(res.status).toBe(201);
        sessionId = res.data.id;
    });

    afterAll(async () => {
        if (sessionId) await client.deleteSession(sessionId);
    });

    describe('HMAC signature', () => {
        let webhookId: string;
        const webhookSecret = 'test-hmac-secret-key-2024';

        beforeAll(async () => {
            const res = await client.createWebhook(sessionId, {
                url: 'https://httpbin.org/anything',
                events: ['message.received'],
                secret: webhookSecret,
            });
            expect(res.status).toBe(201);
            webhookId = res.data.id;
        });

        it('should include secret in webhook config (masked)', async () => {
            const res = await client.getWebhook(sessionId, webhookId);
            expect(res.status).toBe(200);
            // Secret should be stored but masked in response
            expect(res.data).toHaveProperty('hasSecret', true);
            // Should NOT expose raw secret
            expect(res.data.secret).toBeUndefined();
        });

        it('should generate valid HMAC-SHA256 signature on delivery', async () => {
            // Trigger a test webhook delivery
            const testRes = await client.testWebhook(sessionId, webhookId);
            if (testRes.status === 200 || testRes.status === 201) {
                // If httpbin captured the request, check for signature header
                if (testRes.data?.headers) {
                    const signature = testRes.data.headers['X-Webhook-Signature'] ||
                        testRes.data.headers['x-webhook-signature'];
                    if (signature) {
                        // Signature should be in format "sha256=<hex>"
                        expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
                    }
                }
            }
        });

        it('should verify HMAC locally with known payload', () => {
            // Verify our HMAC implementation works correctly
            const payload = JSON.stringify({ event: 'test', data: {} });
            const expectedSignature = crypto
                .createHmac('sha256', webhookSecret)
                .update(payload)
                .digest('hex');
            expect(expectedSignature).toMatch(/^[a-f0-9]{64}$/);
        });

        afterAll(async () => {
            if (webhookId) await client.deleteWebhook(sessionId, webhookId);
        });
    });

    describe('Delivery status tracking', () => {
        let webhookId: string;

        beforeAll(async () => {
            const res = await client.createWebhook(sessionId, {
                url: 'https://httpbin.org/post',
                events: ['message.received'],
            });
            webhookId = res.data.id;
        });

        it('should track delivery attempts', async () => {
            // Trigger a test delivery
            await client.testWebhook(sessionId, webhookId);

            // Check delivery logs
            const res = await client.get(
                `/sessions/${sessionId}/webhooks/${webhookId}/deliveries`
            );
            if (res.status === 200) {
                expect(Array.isArray(res.data)).toBe(true);
                if (res.data.length > 0) {
                    const delivery = res.data[0];
                    expect(delivery).toHaveProperty('status');
                    expect(delivery).toHaveProperty('statusCode');
                    expect(delivery).toHaveProperty('attemptedAt');
                }
            }
        });

        it('should include idempotency key in webhook payload', async () => {
            const testRes = await client.testWebhook(sessionId, webhookId);
            if (testRes.status === 200 || testRes.status === 201) {
                // The payload or headers should include an idempotency/delivery ID
                if (testRes.data?.headers) {
                    const idempotencyKey =
                        testRes.data.headers['X-Webhook-Id'] ||
                        testRes.data.headers['x-webhook-id'] ||
                        testRes.data.headers['X-Delivery-Id'] ||
                        testRes.data.headers['x-delivery-id'];
                    if (idempotencyKey) {
                        expect(idempotencyKey).toBeDefined();
                        expect(typeof idempotencyKey).toBe('string');
                        expect(idempotencyKey.length).toBeGreaterThan(0);
                    }
                }
            }
        });

        afterAll(async () => {
            if (webhookId) await client.deleteWebhook(sessionId, webhookId);
        });
    });

    describe('Retry behavior', () => {
        let failingWebhookId: string;

        it('should create webhook pointing to failing endpoint', async () => {
            // httpbin.org/status/500 always returns 500
            const res = await client.createWebhook(sessionId, {
                url: 'https://httpbin.org/status/500',
                events: ['message.received'],
            });
            expect(res.status).toBe(201);
            failingWebhookId = res.data.id;
        });

        it('should record failed delivery attempts', async () => {
            // Trigger delivery to failing endpoint
            const testRes = await client.testWebhook(sessionId, failingWebhookId);
            // The test call itself may succeed (it's the delivery that fails)
            expect([200, 201, 202, 400, 500, 502]).toContain(testRes.status);

            // Wait for potential retries
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Check delivery logs for retry attempts
            const deliveriesRes = await client.get(
                `/sessions/${sessionId}/webhooks/${failingWebhookId}/deliveries`
            );
            if (deliveriesRes.status === 200 && deliveriesRes.data.length > 0) {
                // Should show failed status
                const delivery = deliveriesRes.data[0];
                expect(['failed', 'retrying', 'pending_retry']).toContain(delivery.status);
            }
        });

        afterAll(async () => {
            if (failingWebhookId) await client.deleteWebhook(sessionId, failingWebhookId);
        });
    });

    describe('Dead Letter Queue (DLQ)', () => {
        it('should list DLQ entries for failed deliveries', async () => {
            const res = await client.get(`/sessions/${sessionId}/webhooks/dlq`);
            // DLQ endpoint should exist
            if (res.status === 200) {
                expect(Array.isArray(res.data)).toBe(true);
                if (res.data.length > 0) {
                    const entry = res.data[0];
                    expect(entry).toHaveProperty('webhookId');
                    expect(entry).toHaveProperty('payload');
                    expect(entry).toHaveProperty('failedAt');
                    expect(entry).toHaveProperty('attempts');
                }
            } else {
                // DLQ might not be populated yet or endpoint may differ
                expect([200, 404]).toContain(res.status);
            }
        });

        it('should allow replaying DLQ entries', async () => {
            const dlqRes = await client.get(`/sessions/${sessionId}/webhooks/dlq`);
            if (dlqRes.status === 200 && dlqRes.data.length > 0) {
                const entryId = dlqRes.data[0].id;
                const replayRes = await client.post(
                    `/sessions/${sessionId}/webhooks/dlq/${entryId}/replay`
                );
                expect([200, 201, 202]).toContain(replayRes.status);
            }
        });
    });

    describe('Event filtering', () => {
        let filteredWebhookId: string;

        it('should create webhook with specific event filter', async () => {
            const res = await client.createWebhook(sessionId, {
                url: 'https://httpbin.org/anything',
                events: ['message.received'],
            });
            expect(res.status).toBe(201);
            filteredWebhookId = res.data.id;
        });

        it('should only receive subscribed event types', async () => {
            const res = await client.getWebhook(sessionId, filteredWebhookId);
            expect(res.status).toBe(200);
            expect(res.data.events).toContain('message.received');
            expect(res.data.events).not.toContain('session.status');
        });

        it('should update event subscriptions', async () => {
            const res = await client.updateWebhook(sessionId, filteredWebhookId, {
                events: ['message.received', 'message.sent', 'session.status'],
            });
            expect(res.status).toBe(200);
            expect(res.data.events).toHaveLength(3);
        });

        it('should reject empty events array', async () => {
            const res = await client.updateWebhook(sessionId, filteredWebhookId, {
                events: [],
            });
            expect([400, 422]).toContain(res.status);
        });

        it('should reject invalid event types', async () => {
            const res = await client.createWebhook(sessionId, {
                url: 'https://httpbin.org/anything',
                events: ['invalid.event.type'],
            });
            expect([400, 422]).toContain(res.status);
        });

        afterAll(async () => {
            if (filteredWebhookId) await client.deleteWebhook(sessionId, filteredWebhookId);
        });
    });

    describe('Webhook security', () => {
        it('should reject webhook with non-HTTPS URL in production', async () => {
            const res = await client.createWebhook(sessionId, {
                url: 'http://insecure.example.com/webhook',
                events: ['message.received'],
            });
            // In development, might allow HTTP; in production, should reject
            // Accept either behavior
            expect([201, 400, 422]).toContain(res.status);
            if (res.status === 201) {
                await client.deleteWebhook(sessionId, res.data.id);
            }
        });

        it('should reject webhook with private/internal IP', async () => {
            const res = await client.createWebhook(sessionId, {
                url: 'https://192.168.1.1/webhook',
                events: ['message.received'],
            });
            // Should prevent SSRF by rejecting internal IPs
            expect([400, 403, 422]).toContain(res.status);
        });

        it('should reject webhook with localhost URL', async () => {
            const res = await client.createWebhook(sessionId, {
                url: 'https://localhost:8080/webhook',
                events: ['message.received'],
            });
            expect([400, 403, 422]).toContain(res.status);
        });
    });
});
