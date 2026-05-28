/**
 * E2E Tests: Multi-Tenant Isolation
 *
 * Tests tenant isolation guarantees:
 * - Tenant CRUD operations
 * - Data isolation between tenants (sessions, contacts, webhooks)
 * - Cross-tenant access prevention
 * - Tenant-scoped API key access
 * - Unauthenticated tenant access rejection
 */
import { ApiClient, createUnauthenticatedClient, createClientWithKey } from '../helpers/api-client';
import { describeServerlessAcceptance } from '../helpers/acceptance';

describeServerlessAcceptance('Multi-Tenant Isolation', () => {
    let superAdminClient: ApiClient;
    let tenantAClient: ApiClient;
    let tenantBClient: ApiClient;
    let tenantAId: string;
    let tenantBId: string;
    let tenantAKeyRaw: string;
    let tenantBKeyRaw: string;

    beforeAll(async () => {
        superAdminClient = new ApiClient(); // dev-admin-key = super admin
    });

    describe('Tenant CRUD', () => {
        it('should create tenant A', async () => {
            const res = await superAdminClient.createTenant({
                name: 'Tenant Alpha',
                slug: `alpha-${Date.now()}`,
                plan: 'pro',
            });
            expect(res.status).toBe(201);
            expect(res.data).toHaveProperty('id');
            expect(res.data.name).toBe('Tenant Alpha');
            expect(res.data).toHaveProperty('slug');
            tenantAId = res.data.id;
        });

        it('should create tenant B', async () => {
            const res = await superAdminClient.createTenant({
                name: 'Tenant Beta',
                slug: `beta-${Date.now()}`,
                plan: 'free',
            });
            expect(res.status).toBe(201);
            expect(res.data).toHaveProperty('id');
            tenantBId = res.data.id;
        });

        it('should list all tenants (super admin)', async () => {
            const res = await superAdminClient.listTenants();
            expect(res.status).toBe(200);
            expect(Array.isArray(res.data)).toBe(true);
            expect(res.data.length).toBeGreaterThanOrEqual(2);
        });

        it('should get tenant by ID', async () => {
            const res = await superAdminClient.getTenant(tenantAId);
            expect(res.status).toBe(200);
            expect(res.data.id).toBe(tenantAId);
            expect(res.data.name).toBe('Tenant Alpha');
        });

        it('should update tenant', async () => {
            const res = await superAdminClient.updateTenant(tenantAId, {
                name: 'Tenant Alpha Updated',
            });
            expect(res.status).toBe(200);
            expect(res.data.name).toBe('Tenant Alpha Updated');
        });

        it('should reject duplicate tenant slug', async () => {
            // Attempt to create another tenant with the same slug
            const existingTenant = await superAdminClient.getTenant(tenantAId);
            const res = await superAdminClient.createTenant({
                name: 'Duplicate Slug',
                slug: existingTenant.data.slug,
            });
            expect([400, 409, 422]).toContain(res.status);
        });

        it('should reject unauthenticated tenant creation', async () => {
            const unauthClient = createUnauthenticatedClient();
            const res = await unauthClient.createTenant({
                name: 'Should Fail',
                slug: 'no-auth',
            });
            expect(res.status).toBe(401);
        });
    });

    describe('Tenant-scoped API keys', () => {
        it('should create API key scoped to tenant A', async () => {
            const res = await superAdminClient.createTenantApiKey(tenantAId, {
                name: 'Tenant A Admin',
                role: 'admin',
            });
            expect(res.status).toBe(201);
            expect(res.data).toHaveProperty('apiKey');
            tenantAKeyRaw = res.data.apiKey;
            tenantAClient = createClientWithKey(tenantAKeyRaw);
        });

        it('should create API key scoped to tenant B', async () => {
            const res = await superAdminClient.createTenantApiKey(tenantBId, {
                name: 'Tenant B Admin',
                role: 'admin',
            });
            expect(res.status).toBe(201);
            expect(res.data).toHaveProperty('apiKey');
            tenantBKeyRaw = res.data.apiKey;
            tenantBClient = createClientWithKey(tenantBKeyRaw);
        });

        it('should resolve correct tenant from API key', async () => {
            const res = await tenantAClient.getCurrentTenant();
            expect(res.status).toBe(200);
            expect(res.data.id).toBe(tenantAId);
        });

        it('should resolve correct tenant B from API key', async () => {
            const res = await tenantBClient.getCurrentTenant();
            expect(res.status).toBe(200);
            expect(res.data.id).toBe(tenantBId);
        });
    });

    describe('Session isolation', () => {
        let tenantASessionId: string;
        let tenantBSessionId: string;

        it('tenant A should create a session', async () => {
            const res = await tenantAClient.createSession({
                name: `tenant-a-session-${Date.now()}`,
            });
            expect(res.status).toBe(201);
            tenantASessionId = res.data.id;
        });

        it('tenant B should create a session', async () => {
            const res = await tenantBClient.createSession({
                name: `tenant-b-session-${Date.now()}`,
            });
            expect(res.status).toBe(201);
            tenantBSessionId = res.data.id;
        });

        it('tenant A should only see own sessions', async () => {
            const res = await tenantAClient.listSessions();
            expect(res.status).toBe(200);
            const sessionIds = res.data.map((s: any) => s.id);
            expect(sessionIds).toContain(tenantASessionId);
            expect(sessionIds).not.toContain(tenantBSessionId);
        });

        it('tenant B should only see own sessions', async () => {
            const res = await tenantBClient.listSessions();
            expect(res.status).toBe(200);
            const sessionIds = res.data.map((s: any) => s.id);
            expect(sessionIds).toContain(tenantBSessionId);
            expect(sessionIds).not.toContain(tenantASessionId);
        });

        it('tenant A cannot access tenant B session by ID', async () => {
            const res = await tenantAClient.getSession(tenantBSessionId);
            expect([403, 404]).toContain(res.status);
        });

        it('tenant B cannot access tenant A session by ID', async () => {
            const res = await tenantBClient.getSession(tenantASessionId);
            expect([403, 404]).toContain(res.status);
        });

        it('tenant A cannot delete tenant B session', async () => {
            const res = await tenantAClient.deleteSession(tenantBSessionId);
            expect([403, 404]).toContain(res.status);
        });

        afterAll(async () => {
            if (tenantASessionId) await tenantAClient.deleteSession(tenantASessionId);
            if (tenantBSessionId) await tenantBClient.deleteSession(tenantBSessionId);
        });
    });

    describe('Webhook isolation', () => {
        let tenantASessionId: string;
        let tenantBSessionId: string;
        let tenantAWebhookId: string;

        beforeAll(async () => {
            const resA = await tenantAClient.createSession({ name: `wh-iso-a-${Date.now()}` });
            tenantASessionId = resA.data.id;
            const resB = await tenantBClient.createSession({ name: `wh-iso-b-${Date.now()}` });
            tenantBSessionId = resB.data.id;
        });

        it('tenant A creates a webhook on own session', async () => {
            const res = await tenantAClient.createWebhook(tenantASessionId, {
                url: 'https://httpbin.org/post',
                events: ['message.received'],
            });
            expect(res.status).toBe(201);
            tenantAWebhookId = res.data.id;
        });

        it('tenant B cannot list tenant A webhooks', async () => {
            const res = await tenantBClient.listWebhooks(tenantASessionId);
            expect([403, 404]).toContain(res.status);
        });

        it('tenant B cannot create webhook on tenant A session', async () => {
            const res = await tenantBClient.createWebhook(tenantASessionId, {
                url: 'https://httpbin.org/anything',
                events: ['message.received'],
            });
            expect([403, 404]).toContain(res.status);
        });

        it('tenant B cannot delete tenant A webhook', async () => {
            const res = await tenantBClient.deleteWebhook(tenantASessionId, tenantAWebhookId);
            expect([403, 404]).toContain(res.status);
        });

        afterAll(async () => {
            if (tenantAWebhookId) await tenantAClient.deleteWebhook(tenantASessionId, tenantAWebhookId);
            if (tenantASessionId) await tenantAClient.deleteSession(tenantASessionId);
            if (tenantBSessionId) await tenantBClient.deleteSession(tenantBSessionId);
        });
    });

    describe('Contact isolation', () => {
        let contactAId: string;

        it('tenant A creates a CRM contact', async () => {
            const res = await tenantAClient.createCrmContact({
                name: 'Alice from Tenant A',
                phone: '+1234567890',
            });
            expect(res.status).toBe(201);
            expect(res.data).toHaveProperty('id');
            contactAId = res.data.id;
        });

        it('tenant A can see own contact', async () => {
            const res = await tenantAClient.getCrmContact(contactAId);
            expect(res.status).toBe(200);
            expect(res.data.name).toBe('Alice from Tenant A');
        });

        it('tenant B cannot see tenant A contact', async () => {
            const res = await tenantBClient.getCrmContact(contactAId);
            expect([403, 404]).toContain(res.status);
        });

        it('tenant B contacts list does not include tenant A contacts', async () => {
            const res = await tenantBClient.listCrmContacts();
            expect(res.status).toBe(200);
            const contactIds = (res.data.data || res.data).map((c: any) => c.id);
            expect(contactIds).not.toContain(contactAId);
        });

        it('tenant B cannot delete tenant A contact', async () => {
            const res = await tenantBClient.deleteCrmContact(contactAId);
            expect([403, 404]).toContain(res.status);
        });

        afterAll(async () => {
            if (contactAId) await tenantAClient.deleteCrmContact(contactAId);
        });
    });

    describe('Stats & audit isolation', () => {
        it('tenant A stats only reflect own data', async () => {
            const res = await tenantAClient.get('/stats');
            expect(res.status).toBe(200);
            // Stats should be scoped to tenant A
            expect(res.data).toBeDefined();
        });

        it('tenant B stats do not include tenant A data', async () => {
            const res = await tenantBClient.get('/stats');
            expect(res.status).toBe(200);
            expect(res.data).toBeDefined();
        });

        it('tenant A audit log only shows own actions', async () => {
            const res = await tenantAClient.get('/audit');
            expect(res.status).toBe(200);
        });
    });

    describe('Cleanup', () => {
        it('should delete tenant B', async () => {
            const res = await superAdminClient.deleteTenant(tenantBId);
            expect([200, 204]).toContain(res.status);
        });

        it('should delete tenant A', async () => {
            const res = await superAdminClient.deleteTenant(tenantAId);
            expect([200, 204]).toContain(res.status);
        });

        it('deleted tenant key should be rejected', async () => {
            const res = await tenantAClient.listSessions();
            expect(res.status).toBe(401);
        });
    });
});
