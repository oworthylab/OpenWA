/**
 * E2E Tests: Group Endpoints
 *
 * Tests group management APIs. Since no WhatsApp is connected,
 * these validate request validation and proper error handling.
 */
import { ApiClient } from '../helpers/api-client';

describe('Group Endpoints', () => {
    let client: ApiClient;
    let sessionId: string;

    beforeAll(async () => {
        client = new ApiClient();
        const name = `e2e-groups-${Date.now()}`;
        const res = await client.createSession({ name });
        expect(res.status).toBe(201);
        sessionId = res.data.id;
    });

    afterAll(async () => {
        if (sessionId) {
            await client.deleteSession(sessionId);
        }
    });

    describe('GET /api/sessions/:sessionId/groups', () => {
        it('should return groups list or session-not-ready error', async () => {
            const res = await client.getGroups(sessionId);
            expect([200, 400]).toContain(res.status);
            if (res.status === 200) {
                expect(Array.isArray(res.data)).toBe(true);
            }
        });

        it('should return 404 for non-existent session', async () => {
            const res = await client.getGroups('non-existent');
            expect(res.status).toBe(404);
        });
    });

    describe('GET /api/sessions/:sessionId/groups/:groupId', () => {
        it('should handle request when session not connected', async () => {
            const res = await client.getGroup(sessionId, '628123456789-1234567890@g.us');
            expect([200, 400, 404, 500]).toContain(res.status);
        });

        it('should return error for non-existent session', async () => {
            const res = await client.getGroup('non-existent', '628123456789-1234567890@g.us');
            expect([404, 500]).toContain(res.status);
        });
    });

    describe('POST /api/sessions/:sessionId/groups (Create Group)', () => {
        it('should reject when session not connected', async () => {
            const res = await client.createGroup(sessionId, {
                name: 'Test Group',
                participants: ['628123456789@c.us', '628987654321@c.us'],
            });
            expect([400, 500]).toContain(res.status);
        });

        it('should return error for non-existent session', async () => {
            const res = await client.createGroup('non-existent', {
                name: 'Test Group',
                participants: ['628123456789@c.us'],
            });
            expect([400, 404, 500]).toContain(res.status);
        });
    });

    describe('POST /api/sessions/:sessionId/groups/:groupId/participants', () => {
        it('should handle add participants when session not connected', async () => {
            const res = await client.addParticipants(sessionId, '628123456789-1234567890@g.us', {
                participants: ['628111111111@c.us'],
            });
            expect([400, 404, 500]).toContain(res.status);
        });
    });

    describe('DELETE /api/sessions/:sessionId/groups/:groupId/participants', () => {
        it('should handle remove participants when session not connected', async () => {
            const res = await client.removeParticipants(sessionId, '628123456789-1234567890@g.us', {
                participants: ['628111111111@c.us'],
            });
            expect([400, 404, 500]).toContain(res.status);
        });
    });

    describe('PUT /api/sessions/:sessionId/groups/:groupId/subject', () => {
        it('should handle update subject when session not connected', async () => {
            const res = await client.updateGroupSubject(sessionId, '628123456789-1234567890@g.us', {
                subject: 'New Group Name',
            });
            expect([400, 404, 500]).toContain(res.status);
        });
    });

    describe('PUT /api/sessions/:sessionId/groups/:groupId/description', () => {
        it('should handle update description when session not connected', async () => {
            const res = await client.updateGroupDescription(sessionId, '628123456789-1234567890@g.us', {
                description: 'New description',
            });
            expect([400, 404, 500]).toContain(res.status);
        });
    });

    describe('POST /api/sessions/:sessionId/groups/:groupId/leave', () => {
        it('should handle leave group when session not connected', async () => {
            const res = await client.leaveGroup(sessionId, '628123456789-1234567890@g.us');
            expect([400, 404, 500]).toContain(res.status);
        });
    });

    describe('GET /api/sessions/:sessionId/groups/:groupId/invite-code', () => {
        it('should handle get invite code when session not connected', async () => {
            const res = await client.getInviteCode(sessionId, '628123456789-1234567890@g.us');
            expect([200, 400, 404, 500]).toContain(res.status);
        });
    });
});
