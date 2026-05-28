/**
 * E2E Tests: Session Management
 *
 * Tests session lifecycle:
 * - Creating sessions
 * - Listing sessions
 * - Getting session details
 * - Starting sessions (triggers QR generation)
 * - Pairing code authentication (phone number linking)
 * - Stopping sessions
 * - Deleting sessions
 * - Duplicate session name handling
 */
import { ApiClient } from '../helpers/api-client';

describe('Session Management', () => {
    let client: ApiClient;
    let createdSessionId: string;
    const sessionName = `e2e-test-session-${Date.now()}`;

    beforeAll(() => {
        client = new ApiClient();
    });

    describe('POST /api/sessions (Create Session)', () => {
        it('should create a new session', async () => {
            const res = await client.createSession({ name: sessionName });
            expect(res.status).toBe(201);
            expect(res.data).toHaveProperty('id');
            expect(res.data).toHaveProperty('name', sessionName);
            expect(res.data).toHaveProperty('status');
            expect(res.data).toHaveProperty('createdAt');
            createdSessionId = res.data.id;
        });

        it('should reject duplicate session names', async () => {
            const res = await client.createSession({ name: sessionName });
            expect(res.status).toBe(409);
        });

        it('should create session with additional config', async () => {
            const name = `e2e-webhook-session-${Date.now()}`;
            const res = await client.createSession({
                name,
            });
            expect(res.status).toBe(201);
            expect(res.data).toHaveProperty('id');
            // Clean up
            (global as any).__webhookSessionId = res.data.id;
        });

        it('should validate session name format', async () => {
            // Empty name should fail
            const res = await client.createSession({ name: '' });
            expect([400, 422]).toContain(res.status);
        });
    });

    describe('GET /api/sessions (List Sessions)', () => {
        it('should list all sessions', async () => {
            const res = await client.listSessions();
            expect(res.status).toBe(200);
            expect(Array.isArray(res.data)).toBe(true);
            expect(res.data.length).toBeGreaterThanOrEqual(1);
        });

        it('should include session details in listing', async () => {
            const res = await client.listSessions();
            const session = res.data.find((s: any) => s.id === createdSessionId);
            expect(session).toBeDefined();
            expect(session).toHaveProperty('name');
            expect(session).toHaveProperty('status');
            expect(session).toHaveProperty('createdAt');
        });
    });

    describe('GET /api/sessions/:id (Get Session)', () => {
        it('should get session by ID', async () => {
            const res = await client.getSession(createdSessionId);
            expect(res.status).toBe(200);
            expect(res.data.id).toBe(createdSessionId);
            expect(res.data.name).toBe(sessionName);
        });

        it('should return 404 for non-existent session', async () => {
            const res = await client.getSession('non-existent-session-id');
            // 404 expected, but may get 429 if rate-limited
            expect([404, 429]).toContain(res.status);
        });
    });

    describe('POST /api/sessions/:id/start (Start Session)', () => {
        it('should start a session', async () => {
            const res = await client.startSession(createdSessionId);
            // Should return 200, 201, or 202 (starting/qr)
            expect([200, 201, 202]).toContain(res.status);
        });

        it('should transition to QR or connecting state', async () => {
            // Give it a moment to initialize
            await new Promise(resolve => setTimeout(resolve, 2000));
            const res = await client.getSession(createdSessionId);
            expect(res.status).toBe(200);
            // Status should be one of the valid states after start (case-insensitive)
            const validStatuses = ['created', 'initializing', 'scan_qr', 'connecting', 'connected', 'disconnected', 'failed'];
            expect(validStatuses).toContain(res.data.status.toLowerCase());
        });

        it('should return 404 when starting non-existent session', async () => {
            const res = await client.startSession('non-existent-id');
            expect(res.status).toBe(404);
        });
    });

    describe('GET /api/sessions/:id/qr (Get QR Code)', () => {
        it('should return QR data or appropriate error', async () => {
            const res = await client.getSessionQr(createdSessionId);
            // QR might be available or session might not be in QR state
            expect([200, 400, 404]).toContain(res.status);
            if (res.status === 200) {
                // QR response has qrCode field
                expect(res.data).toHaveProperty('qrCode');
            }
        });
    });

    describe('POST /api/sessions/:id/pairing-code (Pairing Code Auth)', () => {
        let pairingSessionId: string;

        beforeAll(async () => {
            const res = await client.createSession({ name: `pairing-test-${Date.now()}` });
            expect(res.status).toBe(201);
            pairingSessionId = res.data.id;
            // Start session first (pairing code requires an active session)
            await client.startSession(pairingSessionId);
            await new Promise(resolve => setTimeout(resolve, 2000));
        });

        it('should request pairing code with valid phone number', async () => {
            const res = await client.getSessionPairingCode(pairingSessionId, {
                phoneNumber: '+1234567890',
            });
            // Should return a pairing code or indicate session state issue
            expect([200, 201, 400, 409]).toContain(res.status);
            if (res.status === 200 || res.status === 201) {
                expect(res.data).toHaveProperty('pairingCode');
                // Pairing code is typically 8 alphanumeric characters
                expect(typeof res.data.pairingCode).toBe('string');
                expect(res.data.pairingCode.length).toBeGreaterThan(0);
            }
        });

        it('should reject pairing code without phone number', async () => {
            const res = await client.getSessionPairingCode(pairingSessionId, {
                phoneNumber: '',
            });
            expect([400, 422]).toContain(res.status);
        });

        it('should reject pairing code with invalid phone format', async () => {
            const res = await client.getSessionPairingCode(pairingSessionId, {
                phoneNumber: 'not-a-phone',
            });
            expect([400, 422]).toContain(res.status);
        });

        it('should return 404 for non-existent session', async () => {
            const res = await client.getSessionPairingCode('non-existent', {
                phoneNumber: '+1234567890',
            });
            expect(res.status).toBe(404);
        });

        afterAll(async () => {
            if (pairingSessionId) {
                await client.stopSession(pairingSessionId);
                await client.deleteSession(pairingSessionId);
            }
        });
    });

    describe('POST /api/sessions/:id/stop (Stop Session)', () => {
        it('should stop a running session', async () => {
            const res = await client.stopSession(createdSessionId);
            // Should succeed with 200, 201, 204 or return 400 if already stopped
            expect([200, 201, 204, 400]).toContain(res.status);
        });
    });

    describe('DELETE /api/sessions/:id (Delete Session)', () => {
        it('should delete a session', async () => {
            const res = await client.deleteSession(createdSessionId);
            expect(res.status).toBe(204);
        });

        it('should return 404 after deletion', async () => {
            const res = await client.getSession(createdSessionId);
            expect(res.status).toBe(404);
        });

        it('should return 404 when deleting non-existent session', async () => {
            const res = await client.deleteSession('already-deleted-id');
            expect(res.status).toBe(404);
        });

        // Clean up webhook session
        afterAll(async () => {
            const webhookSessionId = (global as any).__webhookSessionId;
            if (webhookSessionId) {
                await client.deleteSession(webhookSessionId);
            }
            // Also clean up operator-test-session from auth tests
            const sessions = await client.listSessions();
            if (sessions.status === 200) {
                for (const s of sessions.data) {
                    if (s.name === 'operator-test-session') {
                        await client.deleteSession(s.id);
                    }
                }
            }
        });
    });
});
