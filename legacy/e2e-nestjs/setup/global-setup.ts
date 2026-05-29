import axios from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:2785/api';
const MAX_RETRIES = 60;
const RETRY_INTERVAL = 2000;

/**
 * Wait for the API to be healthy before running tests
 */
async function waitForApi(): Promise<void> {
    console.log(`\n⏳ Waiting for API at ${API_BASE_URL}/health ...`);

    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            const response = await axios.get(`${API_BASE_URL}/health`, {
                timeout: 5000,
                validateStatus: () => true,
            });

            if (response.status === 200 && response.data?.status === 'ok') {
                console.log(`✅ API is healthy after ${(i + 1) * (RETRY_INTERVAL / 1000)}s`);
                return;
            }
        } catch {
            // Connection refused or timeout - keep retrying
        }

        if (i < MAX_RETRIES - 1) {
            await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
        }
    }

    throw new Error(
        `❌ API did not become healthy within ${(MAX_RETRIES * RETRY_INTERVAL) / 1000}s. ` +
        `Check docker logs: docker compose -f e2e/docker-compose.e2e.yml logs`
    );
}

export default async function globalSetup(): Promise<void> {
    await waitForApi();

    // Give the system a brief moment to finish initialization (e.g., seed API keys)
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('🚀 E2E tests starting...\n');
}
