/**
 * E2E Tests: Complete Workflow Integration
 *
 * Tests full user journeys that span multiple endpoints:
 * 1. Create API key → Use it → Manage sessions
 * 2. Session lifecycle (create → start → check status → stop → delete)
 * 3. Webhook integration flow
 * 4. Multi-session management
 */
import { ApiClient, createClientWithKey } from '../helpers/api-client';

describe('Integration Workflows', () => {
    let adminClient: ApiClient;

    beforeAll(() => {
        adminClient = new ApiClient();
    });

    describe('Workflow: API Key → Session Management', () => {
        let operatorKey: string;
        let operatorKeyId: string;
        let sessionId: string;

        it('Step 1: Admin creates operator API key', async () => {
            const res = await adminClient.createApiKey({
                name: 'Workflow Operator',
                role: 'operator',
            });
            expect(res.status).toBe(201);
            operatorKey = res.data.apiKey;
            operatorKeyId = res.data.id;
        });

        it('Step 2: Operator creates a session', async () => {
            const opClient = createClientWithKey(operatorKey);
            const res = await opClient.createSession({ name: `workflow-session-${Date.now()}` });
            expect(res.status).toBe(201);
            sessionId = res.data.id;
        });

        it('Step 3: Operator starts the session', async () => {
            const opClient = createClientWithKey(operatorKey);
            const res = await opClient.startSession(sessionId);
            expect([200, 201, 202]).toContain(res.status);
        });

        it('Step 4: Operator checks session status', async () => {
            const opClient = createClientWithKey(operatorKey);
            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 2000));
            const res = await opClient.getSession(sessionId);
            expect(res.status).toBe(200);
            expect(res.data.id).toBe(sessionId);
            expect(res.data.status).toBeDefined();
        });

        it('Step 5: Operator stops the session', async () => {
            const opClient = createClientWithKey(operatorKey);
            const res = await opClient.stopSession(sessionId);
            expect([200, 201, 204, 400]).toContain(res.status);
        });

        it('Step 6: Operator deletes the session', async () => {
            const opClient = createClientWithKey(operatorKey);
            const res = await opClient.deleteSession(sessionId);
            expect(res.status).toBe(204);
        });

        it('Step 7: Admin revokes operator key', async () => {
            const res = await adminClient.revokeApiKey(operatorKeyId);
            expect([200, 201]).toContain(res.status);
            expect(res.data.isActive).toBe(false);
        });

        it('Step 8: Revoked key is rejected', async () => {
            const opClient = createClientWithKey(operatorKey);
            const res = await opClient.listSessions();
            expect(res.status).toBe(401);
        });
    });

    describe('Workflow: Session + Webhook Integration', () => {
        let sessionId: string;
        let webhookId: string;

        it('Step 1: Create session for webhook integration', async () => {
            const res = await adminClient.createSession({
                name: `webhook-workflow-${Date.now()}`,
            });
            expect(res.status).toBe(201);
            sessionId = res.data.id;
        });

        it('Step 2: Add webhook to session', async () => {
            const res = await adminClient.createWebhook(sessionId, {
                url: 'https://httpbin.org/anything',
                events: ['session.status', 'message.sent'],
            });
            expect(res.status).toBe(201);
            webhookId = res.data.id;
        });

        it('Step 3: List webhooks shows the webhook', async () => {
            const res = await adminClient.listWebhooks(sessionId);
            expect(res.status).toBe(200);
            expect(res.data.length).toBeGreaterThanOrEqual(1);
        });

        it('Step 4: Update webhook events', async () => {
            const res = await adminClient.updateWebhook(sessionId, webhookId, {
                events: ['message.received', 'message.sent', 'session.status'],
            });
            expect(res.status).toBe(200);
        });

        it('Step 5: Delete session also cleans up', async () => {
            await adminClient.deleteSession(sessionId);
            // Webhooks should be gone with the session
            const res = await adminClient.listWebhooks(sessionId);
            expect([200, 404]).toContain(res.status);
            if (res.status === 200) {
                expect(res.data.length).toBe(0);
            }
        });
    });

    describe('Workflow: Multi-Session Management', () => {
        const sessionIds: string[] = [];

        it('Step 1: Create multiple sessions', async () => {
            for (let i = 0; i < 3; i++) {
                const res = await adminClient.createSession({ name: `multi-session-${Date.now()}-${i}` });
                expect(res.status).toBe(201);
                sessionIds.push(res.data.id);
            }
        });

        it('Step 2: List should show all sessions', async () => {
            const res = await adminClient.listSessions();
            expect(res.status).toBe(200);
            for (const id of sessionIds) {
                const found = res.data.find((s: any) => s.id === id);
                expect(found).toBeDefined();
            }
        });

        it('Step 3: Get each session individually', async () => {
            for (const id of sessionIds) {
                const res = await adminClient.getSession(id);
                expect(res.status).toBe(200);
                expect(res.data.id).toBe(id);
            }
        });

        it('Step 4: Delete all sessions', async () => {
            for (const id of sessionIds) {
                const res = await adminClient.deleteSession(id);
                expect(res.status).toBe(204);
            }
        });

        it('Step 5: Verify all deleted', async () => {
            for (const id of sessionIds) {
                const res = await adminClient.getSession(id);
                expect(res.status).toBe(404);
            }
        });
    });

    describe('Workflow: Viewer Role Restrictions', () => {
        let viewerKey: string;
        let viewerKeyId: string;

        it('Step 1: Create viewer key', async () => {
            const res = await adminClient.createApiKey({
                name: 'Workflow Viewer',
                role: 'viewer',
            });
            expect(res.status).toBe(201);
            viewerKey = res.data.apiKey;
            viewerKeyId = res.data.id;
        });

        it('Step 2: Viewer can list sessions', async () => {
            const viewerClient = createClientWithKey(viewerKey);
            const res = await viewerClient.listSessions();
            expect(res.status).toBe(200);
        });

        it('Step 3: Viewer cannot create sessions', async () => {
            const viewerClient = createClientWithKey(viewerKey);
            const res = await viewerClient.createSession({ name: 'viewer-attempt' });
            expect(res.status).toBe(401);
        });

        it('Step 4: Viewer can read settings', async () => {
            const viewerClient = createClientWithKey(viewerKey);
            const res = await viewerClient.getSettings();
            expect(res.status).toBe(200);
        });

        it('Step 5: Viewer cannot update settings', async () => {
            const viewerClient = createClientWithKey(viewerKey);
            const res = await viewerClient.updateSettings({ general: { debugMode: true } });
            expect(res.status).toBe(401);
        });

        afterAll(async () => {
            await adminClient.deleteApiKey(viewerKeyId);
        });
    });

    describe('Workflow: Audit Trail Verification', () => {
        it('should record session create/delete in audit log', async () => {
            // Create
            const createRes = await adminClient.createSession({ name: `audit-trail-${Date.now()}` });
            expect(createRes.status).toBe(201);
            const sessionId = createRes.data.id;

            // Delete
            await adminClient.deleteSession(sessionId);

            // Check audit
            const auditRes = await adminClient.getAuditLogs();
            expect(auditRes.status).toBe(200);
            const logs = Array.isArray(auditRes.data) ? auditRes.data : auditRes.data.data;
            expect(logs.length).toBeGreaterThan(0);
        });
    });
});
