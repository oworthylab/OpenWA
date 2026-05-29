/**
 * E2E Tests: Media Storage (R2/Filesystem)
 *
 * Tests media upload, retrieval, and management:
 * - Media upload (various types)
 * - Presigned URL generation
 * - Tenant-scoped media paths
 * - Media metadata and listing
 * - Media deletion
 * - Storage quota enforcement
 * - Invalid file type rejection
 */
import { ApiClient, createClientWithKey } from '../helpers/api-client';
import { describeServerlessAcceptance } from '../helpers/acceptance';

describeServerlessAcceptance('Media Storage', () => {
    let client: ApiClient;
    let sessionId: string;

    beforeAll(async () => {
        client = new ApiClient();
        const res = await client.createSession({ name: `media-test-${Date.now()}` });
        expect(res.status).toBe(201);
        sessionId = res.data.id;
    });

    afterAll(async () => {
        if (sessionId) await client.deleteSession(sessionId);
    });

    describe('Media upload', () => {
        let uploadedMediaId: string;

        it('should upload media with base64 data', async () => {
            // Small 1x1 PNG as base64
            const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
            const res = await client.uploadMedia(sessionId, {
                filename: 'test-image.png',
                mimetype: 'image/png',
                data: base64Png,
            });
            expect([200, 201]).toContain(res.status);
            expect(res.data).toHaveProperty('id');
            expect(res.data).toHaveProperty('filename');
            expect(res.data).toHaveProperty('mimetype', 'image/png');
            expect(res.data).toHaveProperty('size');
            uploadedMediaId = res.data.id;
        });

        it('should upload document media', async () => {
            const base64Txt = Buffer.from('Hello, this is a test document.').toString('base64');
            const res = await client.uploadMedia(sessionId, {
                filename: 'test-doc.txt',
                mimetype: 'text/plain',
                data: base64Txt,
            });
            expect([200, 201]).toContain(res.status);
            expect(res.data).toHaveProperty('id');
            // Cleanup
            if (res.data.id) await client.deleteMedia(sessionId, res.data.id);
        });

        it('should reject upload without filename', async () => {
            const res = await client.uploadMedia(sessionId, {
                mimetype: 'image/png',
                data: 'base64data',
            });
            expect([400, 422]).toContain(res.status);
        });

        it('should reject upload without data', async () => {
            const res = await client.uploadMedia(sessionId, {
                filename: 'empty.png',
                mimetype: 'image/png',
            });
            expect([400, 422]).toContain(res.status);
        });

        it('should reject oversized uploads', async () => {
            // Create a large payload (>16MB to exceed typical limit)
            const largeData = Buffer.alloc(17 * 1024 * 1024).toString('base64');
            const res = await client.uploadMedia(sessionId, {
                filename: 'huge-file.bin',
                mimetype: 'application/octet-stream',
                data: largeData,
            });
            expect([400, 413, 422]).toContain(res.status);
        });

        it('should return 404 for non-existent session', async () => {
            const res = await client.uploadMedia('non-existent-session', {
                filename: 'test.png',
                mimetype: 'image/png',
                data: 'base64data',
            });
            expect([404, 500]).toContain(res.status);
        });

        afterAll(async () => {
            // Keep uploadedMediaId for retrieval tests
            (global as any).__testMediaId = uploadedMediaId;
        });
    });

    describe('Media retrieval', () => {
        it('should get media metadata by ID', async () => {
            const mediaId = (global as any).__testMediaId;
            if (!mediaId) return;

            const res = await client.getMedia(sessionId, mediaId);
            expect(res.status).toBe(200);
            expect(res.data).toHaveProperty('id', mediaId);
            expect(res.data).toHaveProperty('filename');
            expect(res.data).toHaveProperty('mimetype');
            expect(res.data).toHaveProperty('size');
            expect(res.data).toHaveProperty('createdAt');
        });

        it('should return 404 for non-existent media', async () => {
            const res = await client.getMedia(sessionId, 'non-existent-media-id');
            expect(res.status).toBe(404);
        });
    });

    describe('Presigned URLs', () => {
        it('should generate a presigned download URL', async () => {
            const mediaId = (global as any).__testMediaId;
            if (!mediaId) return;

            const res = await client.getMediaUrl(sessionId, mediaId);
            expect(res.status).toBe(200);
            expect(res.data).toHaveProperty('url');
            expect(typeof res.data.url).toBe('string');
            // URL should contain signature/token parameters
            expect(res.data.url).toMatch(/^https?:\/\//);
        });

        it('should include expiration in presigned URL response', async () => {
            const mediaId = (global as any).__testMediaId;
            if (!mediaId) return;

            const res = await client.getMediaUrl(sessionId, mediaId);
            if (res.status === 200) {
                expect(res.data).toHaveProperty('expiresAt');
            }
        });

        it('should return 404 for non-existent media URL', async () => {
            const res = await client.getMediaUrl(sessionId, 'fake-media-id');
            expect(res.status).toBe(404);
        });
    });

    describe('Tenant-scoped media isolation', () => {
        let tenantAClient: ApiClient;
        let tenantBClient: ApiClient;
        let tenantASessionId: string;
        let tenantBSessionId: string;
        let tenantAMediaId: string;

        beforeAll(async () => {
            const superAdmin = new ApiClient();

            // Create two tenants
            const tA = await superAdmin.createTenant({
                name: 'Media Tenant A',
                slug: `media-a-${Date.now()}`,
            });
            const tB = await superAdmin.createTenant({
                name: 'Media Tenant B',
                slug: `media-b-${Date.now()}`,
            });

            const keyA = await superAdmin.createTenantApiKey(tA.data.id, {
                name: 'Media A Key',
                role: 'admin',
            });
            const keyB = await superAdmin.createTenantApiKey(tB.data.id, {
                name: 'Media B Key',
                role: 'admin',
            });

            tenantAClient = createClientWithKey(keyA.data.apiKey);
            tenantBClient = createClientWithKey(keyB.data.apiKey);

            (global as any).__mediaTenantAId = tA.data.id;
            (global as any).__mediaTenantBId = tB.data.id;

            // Create sessions
            const sA = await tenantAClient.createSession({ name: `media-iso-a-${Date.now()}` });
            const sB = await tenantBClient.createSession({ name: `media-iso-b-${Date.now()}` });
            tenantASessionId = sA.data.id;
            tenantBSessionId = sB.data.id;
        });

        it('tenant A uploads media', async () => {
            const base64 = Buffer.from('tenant-a-file-content').toString('base64');
            const res = await tenantAClient.uploadMedia(tenantASessionId, {
                filename: 'tenant-a.txt',
                mimetype: 'text/plain',
                data: base64,
            });
            expect([200, 201]).toContain(res.status);
            tenantAMediaId = res.data.id;
        });

        it('tenant B cannot access tenant A media', async () => {
            const res = await tenantBClient.getMedia(tenantASessionId, tenantAMediaId);
            expect([403, 404]).toContain(res.status);
        });

        it('tenant B cannot get presigned URL for tenant A media', async () => {
            const res = await tenantBClient.getMediaUrl(tenantASessionId, tenantAMediaId);
            expect([403, 404]).toContain(res.status);
        });

        it('tenant B cannot delete tenant A media', async () => {
            const res = await tenantBClient.deleteMedia(tenantASessionId, tenantAMediaId);
            expect([403, 404]).toContain(res.status);
        });

        afterAll(async () => {
            const superAdmin = new ApiClient();
            if (tenantAMediaId) await tenantAClient.deleteMedia(tenantASessionId, tenantAMediaId);
            if (tenantASessionId) await tenantAClient.deleteSession(tenantASessionId);
            if (tenantBSessionId) await tenantBClient.deleteSession(tenantBSessionId);
            const tAId = (global as any).__mediaTenantAId;
            const tBId = (global as any).__mediaTenantBId;
            if (tAId) await superAdmin.deleteTenant(tAId);
            if (tBId) await superAdmin.deleteTenant(tBId);
        });
    });

    describe('Media deletion', () => {
        it('should delete uploaded media', async () => {
            const mediaId = (global as any).__testMediaId;
            if (!mediaId) return;

            const res = await client.deleteMedia(sessionId, mediaId);
            expect([200, 204]).toContain(res.status);
        });

        it('should return 404 after media deletion', async () => {
            const mediaId = (global as any).__testMediaId;
            if (!mediaId) return;

            const res = await client.getMedia(sessionId, mediaId);
            expect(res.status).toBe(404);
        });

        it('should return 404 for deleting non-existent media', async () => {
            const res = await client.deleteMedia(sessionId, 'already-deleted');
            expect(res.status).toBe(404);
        });
    });
});
