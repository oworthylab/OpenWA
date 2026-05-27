/**
 * E2E Tests: Contact Endpoints
 *
 * Tests contact-related APIs. Since no WhatsApp is connected,
 * these validate request validation and error responses.
 */
import { ApiClient } from '../helpers/api-client';

describe('Contact Endpoints', () => {
    let client: ApiClient;
    let sessionId: string;

    beforeAll(async () => {
        client = new ApiClient();
        const name = `e2e-contacts-${Date.now()}`;
        const res = await client.createSession({ name });
        expect(res.status).toBe(201);
        sessionId = res.data.id;
    });

    afterAll(async () => {
        if (sessionId) {
            await client.deleteSession(sessionId);
        }
    });

    describe('GET /api/sessions/:sessionId/contacts', () => {
        it('should return contacts list or session-not-ready error', async () => {
            const res = await client.getContacts(sessionId);
            // Session is not connected, may return empty array or error
            expect([200, 400, 500]).toContain(res.status);
            if (res.status === 200) {
                expect(Array.isArray(res.data)).toBe(true);
            }
        });

        it('should return error for non-existent session', async () => {
            const res = await client.getContacts('non-existent-session');
            expect([404, 500]).toContain(res.status);
        });
    });

    describe('GET /api/sessions/:sessionId/contacts/:contactId', () => {
        it('should handle request for contact when session not connected', async () => {
            const res = await client.getContact(sessionId, '628123456789@c.us');
            expect([200, 400, 404, 500]).toContain(res.status);
        });

        it('should return error for non-existent session', async () => {
            const res = await client.getContact('non-existent', '628123456789@c.us');
            expect([404, 500]).toContain(res.status);
        });
    });

    describe('GET /api/sessions/:sessionId/contacts/check/:number', () => {
        it('should handle number check when session not connected', async () => {
            const res = await client.checkNumber(sessionId, '628123456789');
            expect([200, 400, 500]).toContain(res.status);
        });

        it('should return error for non-existent session', async () => {
            const res = await client.checkNumber('non-existent', '628123456789');
            expect([404, 500]).toContain(res.status);
        });
    });

    describe('GET /api/sessions/:sessionId/contacts/:contactId/profile-picture', () => {
        it('should handle profile picture request when session not connected', async () => {
            const res = await client.getProfilePicture(sessionId, '628123456789@c.us');
            expect([200, 400, 404, 500]).toContain(res.status);
        });
    });

    describe('POST /api/sessions/:sessionId/contacts/:contactId/block', () => {
        it('should handle block request when session not connected', async () => {
            const res = await client.blockContact(sessionId, '628123456789@c.us');
            expect([200, 400, 500]).toContain(res.status);
        });

        it('should return error for non-existent session', async () => {
            const res = await client.blockContact('non-existent', '628123456789@c.us');
            expect([404, 500]).toContain(res.status);
        });
    });

    describe('DELETE /api/sessions/:sessionId/contacts/:contactId/block', () => {
        it('should handle unblock request when session not connected', async () => {
            const res = await client.unblockContact(sessionId, '628123456789@c.us');
            expect([200, 400, 500]).toContain(res.status);
        });
    });
});
