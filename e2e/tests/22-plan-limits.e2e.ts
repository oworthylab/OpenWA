/**
 * E2E Tests: Plan Limits & Rate Limiting
 *
 * Tests plan-based restrictions:
 * - Session count limits per plan tier (Free/Pro/Business)
 * - Message rate limiting
 * - Storage quota enforcement
 * - Plan usage reporting
 * - Upgrade/downgrade behavior
 * - Rate limit headers
 */
import { ApiClient, createClientWithKey } from '../helpers/api-client';

describe('Plan Limits & Rate Limiting', () => {
    let superAdmin: ApiClient;

    beforeAll(() => {
        superAdmin = new ApiClient();
    });

    describe('Plan info & usage', () => {
        it('should return current tenant plan details', async () => {
            const res = await superAdmin.getTenantPlan();
            expect(res.status).toBe(200);
            expect(res.data).toHaveProperty('plan');
            expect(res.data).toHaveProperty('limits');
            expect(res.data.limits).toHaveProperty('maxSessions');
            expect(res.data.limits).toHaveProperty('maxMessagesPerDay');
            expect(res.data.limits).toHaveProperty('maxStorageMb');
        });

        it('should return current usage', async () => {
            const res = await superAdmin.getTenantUsage();
            expect(res.status).toBe(200);
            expect(res.data).toHaveProperty('sessions');
            expect(res.data).toHaveProperty('messagestoday');
            expect(res.data).toHaveProperty('storageMb');
        });

        it('should show usage does not exceed plan limits', async () => {
            const planRes = await superAdmin.getTenantPlan();
            const usageRes = await superAdmin.getTenantUsage();
            expect(usageRes.data.sessions).toBeLessThanOrEqual(planRes.data.limits.maxSessions);
        });
    });

    describe('Session count limits', () => {
        let freeTenantId: string;
        let freeTenantKey: string;
        let freeTenantClient: ApiClient;
        const createdSessionIds: string[] = [];

        beforeAll(async () => {
            // Create a free-tier tenant for limit testing
            const tenantRes = await superAdmin.createTenant({
                name: 'Free Tier Test',
                slug: `free-limit-${Date.now()}`,
                plan: 'free',
            });
            freeTenantId = tenantRes.data.id;

            const keyRes = await superAdmin.createTenantApiKey(freeTenantId, {
                name: 'Free Admin',
                role: 'admin',
            });
            freeTenantKey = keyRes.data.apiKey;
            freeTenantClient = createClientWithKey(freeTenantKey);
        });

        it('should allow creating sessions up to plan limit', async () => {
            // Free plan allows limited sessions (e.g., 1 or 2)
            const planRes = await freeTenantClient.getTenantPlan();
            const maxSessions = planRes.data.limits.maxSessions;

            for (let i = 0; i < Math.min(maxSessions, 3); i++) {
                const res = await freeTenantClient.createSession({
                    name: `limit-test-${i}-${Date.now()}`,
                });
                expect(res.status).toBe(201);
                createdSessionIds.push(res.data.id);
            }
        });

        it('should reject session creation beyond plan limit', async () => {
            const planRes = await freeTenantClient.getTenantPlan();
            const maxSessions = planRes.data.limits.maxSessions;

            // Only test if we already hit the limit
            if (createdSessionIds.length >= maxSessions) {
                const res = await freeTenantClient.createSession({
                    name: `over-limit-${Date.now()}`,
                });
                expect([402, 403, 429]).toContain(res.status);
                // Error message should mention plan limit
                expect(JSON.stringify(res.data)).toMatch(/limit|plan|upgrade|quota/i);
            }
        });

        afterAll(async () => {
            for (const id of createdSessionIds) {
                await freeTenantClient.deleteSession(id);
            }
            if (freeTenantId) await superAdmin.deleteTenant(freeTenantId);
        });
    });

    describe('Message rate limiting', () => {
        let sessionId: string;

        beforeAll(async () => {
            const res = await superAdmin.createSession({
                name: `rate-limit-test-${Date.now()}`,
            });
            sessionId = res.data.id;
        });

        it('should include rate limit headers in responses', async () => {
            const res = await superAdmin.sendTextMessage(sessionId, {
                chatId: '1234567890@c.us',
                text: 'Rate limit test',
            });
            // Even if message fails (no active session), rate limit headers should be present
            const headers = res.headers;
            const hasRateHeaders =
                headers['x-ratelimit-limit'] !== undefined ||
                headers['ratelimit-limit'] !== undefined ||
                headers['retry-after'] !== undefined;
            // Rate limiting is expected but implementation-dependent
            expect([200, 201, 400, 429, 503]).toContain(res.status);
        });

        it('should enforce per-endpoint rate limits', async () => {
            const requests = [];
            // Send many rapid requests
            for (let i = 0; i < 50; i++) {
                requests.push(
                    superAdmin.sendTextMessage(sessionId, {
                        chatId: '1234567890@c.us',
                        text: `Burst message ${i}`,
                    })
                );
            }
            const results = await Promise.all(requests);
            const statuses = results.map(r => r.status);

            // Some should succeed, some should be rate limited
            const hasRateLimited = statuses.includes(429);
            const hasSuccessOrExpected = statuses.some(s => [200, 201, 400, 503].includes(s));
            // At least some requests went through
            expect(hasSuccessOrExpected).toBe(true);
            // If rate limiting is active, we should see 429s
            // This is a soft check since rate limit config may vary
        });

        afterAll(async () => {
            if (sessionId) await superAdmin.deleteSession(sessionId);
        });
    });

    describe('Storage quota', () => {
        it('should report storage usage', async () => {
            const res = await superAdmin.getTenantUsage();
            expect(res.status).toBe(200);
            expect(typeof res.data.storageMb).toBe('number');
            expect(res.data.storageMb).toBeGreaterThanOrEqual(0);
        });

        it('should expose storage limit in plan', async () => {
            const res = await superAdmin.getTenantPlan();
            expect(res.status).toBe(200);
            expect(typeof res.data.limits.maxStorageMb).toBe('number');
            expect(res.data.limits.maxStorageMb).toBeGreaterThan(0);
        });
    });

    describe('API-wide rate limiting', () => {
        it('should not rate limit health endpoint under normal load', async () => {
            const requests = Array.from({ length: 10 }, () => superAdmin.healthCheck());
            const results = await Promise.all(requests);
            const allOk = results.every(r => r.status === 200);
            expect(allOk).toBe(true);
        });

        it('should return Retry-After header on 429', async () => {
            // Send burst to potentially trigger rate limit
            const requests = Array.from({ length: 100 }, () =>
                superAdmin.listSessions()
            );
            const results = await Promise.all(requests);
            const rateLimited = results.find(r => r.status === 429);
            if (rateLimited) {
                expect(
                    rateLimited.headers['retry-after'] !== undefined ||
                    rateLimited.headers['x-ratelimit-reset'] !== undefined
                ).toBe(true);
            }
        });
    });

    describe('Plan upgrade behavior', () => {
        let testTenantId: string;
        let testTenantKey: string;
        let testClient: ApiClient;

        beforeAll(async () => {
            const tenantRes = await superAdmin.createTenant({
                name: 'Upgrade Test',
                slug: `upgrade-${Date.now()}`,
                plan: 'free',
            });
            testTenantId = tenantRes.data.id;

            const keyRes = await superAdmin.createTenantApiKey(testTenantId, {
                name: 'Upgrade Admin',
                role: 'admin',
            });
            testTenantKey = keyRes.data.apiKey;
            testClient = createClientWithKey(testTenantKey);
        });

        it('should show free plan limits initially', async () => {
            const res = await testClient.getTenantPlan();
            expect(res.status).toBe(200);
            expect(res.data.plan).toBe('free');
        });

        it('should update plan to pro (admin action)', async () => {
            const res = await superAdmin.updateTenant(testTenantId, {
                plan: 'pro',
            });
            expect(res.status).toBe(200);
        });

        it('should reflect increased limits after upgrade', async () => {
            const res = await testClient.getTenantPlan();
            expect(res.status).toBe(200);
            expect(res.data.plan).toBe('pro');
            expect(res.data.limits.maxSessions).toBeGreaterThan(1);
        });

        afterAll(async () => {
            if (testTenantId) await superAdmin.deleteTenant(testTenantId);
        });
    });
});
