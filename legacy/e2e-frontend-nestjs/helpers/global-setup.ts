/**
 * Global setup for Playwright tests.
 * Cleans up any existing sessions in the backend to ensure
 * a clean state for tests.
 *
 * Uses the same URL as the tests (through nginx proxy) to validate
 * the full production request path works.
 */
async function globalSetup() {
    const baseUrl = process.env.BASE_URL || 'http://localhost:2886';
    const apiKey = process.env.TEST_API_KEY || 'e2e-admin-key';

    // Wait for the service stack to be healthy
    const maxWait = 60000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
        try {
            const health = await fetch(`${baseUrl}/api/health`);
            if (health.ok) break;
        } catch {
            // Not ready yet
        }
        await new Promise(r => setTimeout(r, 2000));
    }

    try {
        // Get all sessions
        const res = await fetch(`${baseUrl}/api/sessions`, {
            headers: { 'X-API-Key': apiKey },
        });
        if (res.ok) {
            const sessions = await res.json();
            // Delete each session
            for (const session of sessions) {
                await fetch(`${baseUrl}/api/sessions/${session.id}`, {
                    method: 'DELETE',
                    headers: { 'X-API-Key': apiKey },
                }).catch(() => { });
            }
        }
    } catch {
        // Backend might not be ready yet, that's ok
    }
}

export default globalSetup;
