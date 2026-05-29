/**
 * E2E Tests: Message Endpoints
 *
 * Tests message sending APIs. Since we don't have a real WhatsApp connection,
 * these tests validate:
 * - Request validation (correct/incorrect payloads)
 * - Proper error handling for disconnected sessions
 * - API contract compliance (response shapes)
 */
import { ApiClient } from '../helpers/api-client';

describe('Message Endpoints', () => {
    let client: ApiClient;
    let sessionId: string;

    beforeAll(async () => {
        client = new ApiClient();
        // Create a session for testing messages
        const name = `e2e-messages-${Date.now()}`;
        const res = await client.createSession({ name });
        expect(res.status).toBe(201);
        sessionId = res.data.id;
    });

    afterAll(async () => {
        // Clean up
        if (sessionId) {
            await client.deleteSession(sessionId);
        }
    });

    describe('POST /api/sessions/:sessionId/messages/send-text', () => {
        it('should reject when session is not connected', async () => {
            const res = await client.sendTextMessage(sessionId, {
                chatId: '628123456789@c.us',
                text: 'Hello World',
            });
            // Session not connected, should fail gracefully
            expect([400, 500]).toContain(res.status);
        });

        it('should validate required fields - missing chatId', async () => {
            const res = await client.sendTextMessage(sessionId, {
                chatId: '',
                text: 'Hello',
            });
            expect([400, 422, 500]).toContain(res.status);
        });

        it('should validate required fields - missing text', async () => {
            const res = await client.post(`/sessions/${sessionId}/messages/send-text`, {
                chatId: '628123456789@c.us',
            });
            expect([400, 422, 500]).toContain(res.status);
        });

        it('should return error for non-existent session', async () => {
            const res = await client.sendTextMessage('non-existent-session', {
                chatId: '628123456789@c.us',
                text: 'Hello',
            });
            expect([400, 404]).toContain(res.status);
        });
    });

    describe('POST /api/sessions/:sessionId/messages/send-image', () => {
        it('should reject when session is not connected', async () => {
            const res = await client.sendImageMessage(sessionId, {
                chatId: '628123456789@c.us',
                image: { url: 'https://example.com/image.jpg' },
                caption: 'Test image',
            });
            expect([400, 500]).toContain(res.status);
        });

        it('should validate required chatId', async () => {
            const res = await client.sendImageMessage(sessionId, {
                chatId: '',
                image: { url: 'https://example.com/image.jpg' },
            });
            expect([400, 422, 500]).toContain(res.status);
        });

        it('should return error for non-existent session', async () => {
            const res = await client.sendImageMessage('non-existent', {
                chatId: '628123456789@c.us',
                image: { url: 'https://example.com/image.jpg' },
            });
            expect([400, 404]).toContain(res.status);
        });
    });

    describe('POST /api/sessions/:sessionId/messages/send-video', () => {
        it('should reject when session is not connected', async () => {
            const res = await client.sendVideoMessage(sessionId, {
                chatId: '628123456789@c.us',
                video: { url: 'https://example.com/video.mp4' },
            });
            expect([400, 500]).toContain(res.status);
        });

        it('should return error for non-existent session', async () => {
            const res = await client.sendVideoMessage('non-existent', {
                chatId: '628123456789@c.us',
                video: { url: 'https://example.com/video.mp4' },
            });
            expect([400, 404]).toContain(res.status);
        });
    });

    describe('POST /api/sessions/:sessionId/messages/send-audio', () => {
        it('should reject when session is not connected', async () => {
            const res = await client.sendAudioMessage(sessionId, {
                chatId: '628123456789@c.us',
                audio: { url: 'https://example.com/audio.mp3' },
                ptt: true,
            });
            expect([400, 500]).toContain(res.status);
        });

        it('should return error for non-existent session', async () => {
            const res = await client.sendAudioMessage('non-existent', {
                chatId: '628123456789@c.us',
                audio: { url: 'https://example.com/audio.mp3' },
            });
            expect([400, 404]).toContain(res.status);
        });
    });

    describe('POST /api/sessions/:sessionId/messages/send-document', () => {
        it('should reject when session is not connected', async () => {
            const res = await client.sendDocumentMessage(sessionId, {
                chatId: '628123456789@c.us',
                document: { url: 'https://example.com/file.pdf' },
                filename: 'test.pdf',
            });
            expect([400, 500]).toContain(res.status);
        });

        it('should return error for non-existent session', async () => {
            const res = await client.sendDocumentMessage('non-existent', {
                chatId: '628123456789@c.us',
                document: { url: 'https://example.com/file.pdf' },
            });
            expect([400, 404]).toContain(res.status);
        });
    });

    describe('POST /api/sessions/:sessionId/messages/send-location', () => {
        it('should reject when session is not connected', async () => {
            const res = await client.sendLocationMessage(sessionId, {
                chatId: '628123456789@c.us',
                latitude: -6.2088,
                longitude: 106.8456,
                description: 'Jakarta',
            });
            expect([400, 500]).toContain(res.status);
        });

        it('should return error for non-existent session', async () => {
            const res = await client.sendLocationMessage('non-existent', {
                chatId: '628123456789@c.us',
                latitude: -6.2088,
                longitude: 106.8456,
            });
            expect([400, 404]).toContain(res.status);
        });
    });

    describe('POST /api/sessions/:sessionId/messages/send-contact', () => {
        it('should reject when session is not connected', async () => {
            const res = await client.sendContactMessage(sessionId, {
                chatId: '628123456789@c.us',
                contact: { name: 'John Doe', phone: '628987654321' },
            });
            expect([400, 500]).toContain(res.status);
        });

        it('should return error for non-existent session', async () => {
            const res = await client.sendContactMessage('non-existent', {
                chatId: '628123456789@c.us',
                contact: { name: 'John', phone: '628111111111' },
            });
            expect([400, 404]).toContain(res.status);
        });
    });

    describe('POST /api/sessions/:sessionId/messages/send-sticker', () => {
        it('should reject when session is not connected', async () => {
            const res = await client.sendStickerMessage(sessionId, {
                chatId: '628123456789@c.us',
                sticker: { url: 'https://example.com/sticker.webp' },
            });
            expect([400, 500]).toContain(res.status);
        });

        it('should return error for non-existent session', async () => {
            const res = await client.sendStickerMessage('non-existent', {
                chatId: '628123456789@c.us',
                sticker: { url: 'https://example.com/sticker.webp' },
            });
            expect([400, 404]).toContain(res.status);
        });
    });

    describe('POST /api/sessions/:sessionId/messages/send-bulk', () => {
        it('should reject when session is not connected', async () => {
            const res = await client.sendBulkMessages(sessionId, {
                messages: [
                    {
                        chatId: '628123456789@c.us',
                        type: 'text',
                        content: { text: 'Bulk message 1' },
                    },
                    {
                        chatId: '628987654321@c.us',
                        type: 'text',
                        content: { text: 'Bulk message 2' },
                    },
                ],
            });
            expect([400, 500]).toContain(res.status);
        });

        it('should return error for non-existent session', async () => {
            const res = await client.sendBulkMessages('non-existent', {
                messages: [
                    { chatId: '628123456789@c.us', type: 'text', content: { text: 'Test' } },
                ],
            });
            expect([400, 404]).toContain(res.status);
        });
    });

    describe('GET /api/sessions/:sessionId/messages/batch/:batchId', () => {
        it('should return 404 for non-existent batch', async () => {
            const res = await client.getBatchStatus(sessionId, 'non-existent-batch');
            expect([404, 400]).toContain(res.status);
        });
    });
});
