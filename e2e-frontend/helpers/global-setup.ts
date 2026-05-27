/**
 * Global setup for Playwright tests.
 * Cleans up any existing sessions in the backend to ensure
 * a clean state for tests.
 */
async function globalSetup() {
    const apiUrl = process.env.API_URL || 'http://localhost:2785';
    const apiKey = process.env.TEST_API_KEY || 'dev-admin-key';

    try {
        // Get all sessions
        const res = await fetch(`${apiUrl}/api/sessions`, {
            headers: { 'X-API-Key': apiKey },
        });
        if (res.ok) {
            const sessions = await res.json();
            // Delete each session
            for (const session of sessions) {
                await fetch(`${apiUrl}/api/sessions/${session.id}`, {
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
