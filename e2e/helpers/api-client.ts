import axios, { AxiosInstance, AxiosResponse } from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:2785/api';
const API_KEY = process.env.API_KEY || 'dev-admin-key';

/**
 * Stack-agnostic HTTP client for e2e testing.
 * Uses plain HTTP requests - no framework dependencies.
 */
export class ApiClient {
    private client: AxiosInstance;

    constructor(apiKey?: string) {
        this.client = axios.create({
            baseURL: API_BASE_URL,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...(apiKey !== undefined ? { 'X-API-Key': apiKey } : { 'X-API-Key': API_KEY }),
            },
            validateStatus: () => true, // Don't throw on any status code
            timeout: 15000,
        });
    }

    get baseUrl(): string {
        return API_BASE_URL;
    }

    get defaultApiKey(): string {
        return API_KEY;
    }

    // Health endpoints
    async healthCheck(): Promise<AxiosResponse> {
        return this.client.get('/health');
    }

    async healthLive(): Promise<AxiosResponse> {
        return this.client.get('/health/live');
    }

    async healthReady(): Promise<AxiosResponse> {
        return this.client.get('/health/ready');
    }

    // Auth endpoints
    async createApiKey(data: {
        name: string;
        role?: string;
        allowedIps?: string[];
        allowedSessions?: string[];
        expiresAt?: string;
    }): Promise<AxiosResponse> {
        return this.client.post('/auth/api-keys', data);
    }

    async listApiKeys(): Promise<AxiosResponse> {
        return this.client.get('/auth/api-keys');
    }

    async getApiKey(id: string): Promise<AxiosResponse> {
        return this.client.get(`/auth/api-keys/${id}`);
    }

    async updateApiKey(id: string, data: Record<string, unknown>): Promise<AxiosResponse> {
        return this.client.put(`/auth/api-keys/${id}`, data);
    }

    async deleteApiKey(id: string): Promise<AxiosResponse> {
        return this.client.delete(`/auth/api-keys/${id}`);
    }

    async revokeApiKey(id: string): Promise<AxiosResponse> {
        return this.client.post(`/auth/api-keys/${id}/revoke`);
    }

    async validateApiKey(key?: string): Promise<AxiosResponse> {
        const headers: Record<string, string> = {};
        if (key) {
            headers['X-API-Key'] = key;
        }
        return this.client.post('/auth/validate', {}, { headers });
    }

    // Session endpoints
    async createSession(data: { name: string; webhook?: Record<string, unknown> }): Promise<AxiosResponse> {
        return this.client.post('/sessions', data);
    }

    async listSessions(): Promise<AxiosResponse> {
        return this.client.get('/sessions');
    }

    async getSession(id: string): Promise<AxiosResponse> {
        return this.client.get(`/sessions/${id}`);
    }

    async deleteSession(id: string): Promise<AxiosResponse> {
        return this.client.delete(`/sessions/${id}`);
    }

    async startSession(id: string): Promise<AxiosResponse> {
        return this.client.post(`/sessions/${id}/start`);
    }

    async stopSession(id: string): Promise<AxiosResponse> {
        return this.client.post(`/sessions/${id}/stop`);
    }

    async getSessionQr(id: string): Promise<AxiosResponse> {
        return this.client.get(`/sessions/${id}/qr`);
    }

    // Message endpoints
    async sendTextMessage(sessionId: string, data: { chatId: string; text: string; options?: Record<string, unknown> }): Promise<AxiosResponse> {
        return this.client.post(`/sessions/${sessionId}/messages/send-text`, data);
    }

    async sendImageMessage(sessionId: string, data: Record<string, unknown>): Promise<AxiosResponse> {
        return this.client.post(`/sessions/${sessionId}/messages/send-image`, data);
    }

    async sendVideoMessage(sessionId: string, data: Record<string, unknown>): Promise<AxiosResponse> {
        return this.client.post(`/sessions/${sessionId}/messages/send-video`, data);
    }

    async sendAudioMessage(sessionId: string, data: Record<string, unknown>): Promise<AxiosResponse> {
        return this.client.post(`/sessions/${sessionId}/messages/send-audio`, data);
    }

    async sendDocumentMessage(sessionId: string, data: Record<string, unknown>): Promise<AxiosResponse> {
        return this.client.post(`/sessions/${sessionId}/messages/send-document`, data);
    }

    async sendLocationMessage(sessionId: string, data: Record<string, unknown>): Promise<AxiosResponse> {
        return this.client.post(`/sessions/${sessionId}/messages/send-location`, data);
    }

    async sendContactMessage(sessionId: string, data: Record<string, unknown>): Promise<AxiosResponse> {
        return this.client.post(`/sessions/${sessionId}/messages/send-contact`, data);
    }

    async sendStickerMessage(sessionId: string, data: Record<string, unknown>): Promise<AxiosResponse> {
        return this.client.post(`/sessions/${sessionId}/messages/send-sticker`, data);
    }

    async sendBulkMessages(sessionId: string, data: Record<string, unknown>): Promise<AxiosResponse> {
        return this.client.post(`/sessions/${sessionId}/messages/send-bulk`, data);
    }

    async getBatchStatus(sessionId: string, batchId: string): Promise<AxiosResponse> {
        return this.client.get(`/sessions/${sessionId}/messages/batch/${batchId}`);
    }

    async cancelBatch(sessionId: string, batchId: string): Promise<AxiosResponse> {
        return this.client.post(`/sessions/${sessionId}/messages/batch/${batchId}/cancel`);
    }

    async getMessages(sessionId: string, chatId: string, params?: Record<string, unknown>): Promise<AxiosResponse> {
        return this.client.get(`/sessions/${sessionId}/chats/${chatId}/messages`, { params });
    }

    // Contact endpoints
    async getContacts(sessionId: string): Promise<AxiosResponse> {
        return this.client.get(`/sessions/${sessionId}/contacts`);
    }

    async getContact(sessionId: string, contactId: string): Promise<AxiosResponse> {
        return this.client.get(`/sessions/${sessionId}/contacts/${contactId}`);
    }

    async checkNumber(sessionId: string, number: string): Promise<AxiosResponse> {
        return this.client.get(`/sessions/${sessionId}/contacts/check/${number}`);
    }

    async getProfilePicture(sessionId: string, contactId: string): Promise<AxiosResponse> {
        return this.client.get(`/sessions/${sessionId}/contacts/${contactId}/profile-picture`);
    }

    async blockContact(sessionId: string, contactId: string): Promise<AxiosResponse> {
        return this.client.post(`/sessions/${sessionId}/contacts/${contactId}/block`);
    }

    async unblockContact(sessionId: string, contactId: string): Promise<AxiosResponse> {
        return this.client.delete(`/sessions/${sessionId}/contacts/${contactId}/block`);
    }

    // Group endpoints
    async getGroups(sessionId: string): Promise<AxiosResponse> {
        return this.client.get(`/sessions/${sessionId}/groups`);
    }

    async getGroup(sessionId: string, groupId: string): Promise<AxiosResponse> {
        return this.client.get(`/sessions/${sessionId}/groups/${groupId}`);
    }

    async createGroup(sessionId: string, data: { name: string; participants: string[] }): Promise<AxiosResponse> {
        return this.client.post(`/sessions/${sessionId}/groups`, data);
    }

    async addParticipants(sessionId: string, groupId: string, data: { participants: string[] }): Promise<AxiosResponse> {
        return this.client.post(`/sessions/${sessionId}/groups/${groupId}/participants`, data);
    }

    async removeParticipants(sessionId: string, groupId: string, data: { participants: string[] }): Promise<AxiosResponse> {
        return this.client.delete(`/sessions/${sessionId}/groups/${groupId}/participants`, { data });
    }

    async updateGroupSubject(sessionId: string, groupId: string, data: { subject: string }): Promise<AxiosResponse> {
        return this.client.put(`/sessions/${sessionId}/groups/${groupId}/subject`, data);
    }

    async updateGroupDescription(sessionId: string, groupId: string, data: { description: string }): Promise<AxiosResponse> {
        return this.client.put(`/sessions/${sessionId}/groups/${groupId}/description`, data);
    }

    async leaveGroup(sessionId: string, groupId: string): Promise<AxiosResponse> {
        return this.client.post(`/sessions/${sessionId}/groups/${groupId}/leave`);
    }

    async getInviteCode(sessionId: string, groupId: string): Promise<AxiosResponse> {
        return this.client.get(`/sessions/${sessionId}/groups/${groupId}/invite-code`);
    }

    // Webhook endpoints
    async createWebhook(sessionId: string, data: Record<string, unknown>): Promise<AxiosResponse> {
        return this.client.post(`/sessions/${sessionId}/webhooks`, data);
    }

    async listWebhooks(sessionId: string): Promise<AxiosResponse> {
        return this.client.get(`/sessions/${sessionId}/webhooks`);
    }

    async getWebhook(sessionId: string, webhookId: string): Promise<AxiosResponse> {
        return this.client.get(`/sessions/${sessionId}/webhooks/${webhookId}`);
    }

    async updateWebhook(sessionId: string, webhookId: string, data: Record<string, unknown>): Promise<AxiosResponse> {
        return this.client.put(`/sessions/${sessionId}/webhooks/${webhookId}`, data);
    }

    async deleteWebhook(sessionId: string, webhookId: string): Promise<AxiosResponse> {
        return this.client.delete(`/sessions/${sessionId}/webhooks/${webhookId}`);
    }

    async testWebhook(sessionId: string, webhookId: string): Promise<AxiosResponse> {
        return this.client.post(`/sessions/${sessionId}/webhooks/${webhookId}/test`);
    }

    // Settings endpoints
    async getSettings(): Promise<AxiosResponse> {
        return this.client.get('/settings');
    }

    async updateSettings(data: Record<string, unknown>): Promise<AxiosResponse> {
        return this.client.put('/settings', data);
    }

    // Stats endpoints
    async getStatsOverview(): Promise<AxiosResponse> {
        return this.client.get('/stats/overview');
    }

    async getMessageStats(period?: string): Promise<AxiosResponse> {
        return this.client.get('/stats/messages', { params: period ? { period } : undefined });
    }

    async getSessionStats(sessionId: string): Promise<AxiosResponse> {
        return this.client.get(`/stats/sessions/${sessionId}`);
    }

    // Audit endpoints
    async getAuditLogs(params?: Record<string, unknown>): Promise<AxiosResponse> {
        return this.client.get('/audit', { params });
    }

    // Infrastructure endpoints
    async getInfraStatus(): Promise<AxiosResponse> {
        return this.client.get('/infra/status');
    }

    async updateInfraConfig(data: Record<string, unknown>): Promise<AxiosResponse> {
        return this.client.put('/infra/config', data);
    }

    async exportSessions(): Promise<AxiosResponse> {
        return this.client.post('/infra/export/sessions');
    }

    async importSessions(data: Record<string, unknown>): Promise<AxiosResponse> {
        return this.client.post('/infra/import/sessions', data);
    }

    // Status endpoints (WhatsApp Stories)
    async getStatuses(sessionId: string): Promise<AxiosResponse> {
        return this.client.get(`/sessions/${sessionId}/status`);
    }

    async sendTextStatus(sessionId: string, data: Record<string, unknown>): Promise<AxiosResponse> {
        return this.client.post(`/sessions/${sessionId}/status/send-text`, data);
    }

    // Label endpoints
    async getLabels(sessionId: string): Promise<AxiosResponse> {
        return this.client.get(`/sessions/${sessionId}/labels`);
    }

    async getChatLabels(sessionId: string, chatId: string): Promise<AxiosResponse> {
        return this.client.get(`/sessions/${sessionId}/labels/chat/${chatId}`);
    }

    // Catalog endpoints
    async getCatalog(sessionId: string): Promise<AxiosResponse> {
        return this.client.get(`/sessions/${sessionId}/catalog`);
    }

    async getCatalogProducts(sessionId: string): Promise<AxiosResponse> {
        return this.client.get(`/sessions/${sessionId}/catalog/products`);
    }

    // Channel endpoints
    async getChannels(sessionId: string): Promise<AxiosResponse> {
        return this.client.get(`/sessions/${sessionId}/channels`);
    }

    // Plugins endpoints
    async getPlugins(): Promise<AxiosResponse> {
        return this.client.get('/plugins');
    }

    async getPlugin(id: string): Promise<AxiosResponse> {
        return this.client.get(`/plugins/${id}`);
    }

    async enablePlugin(id: string): Promise<AxiosResponse> {
        return this.client.post(`/plugins/${id}/enable`);
    }

    async disablePlugin(id: string): Promise<AxiosResponse> {
        return this.client.post(`/plugins/${id}/disable`);
    }

    // Raw request for custom calls
    async get(path: string, config?: Record<string, unknown>): Promise<AxiosResponse> {
        return this.client.get(path, config);
    }

    async post(path: string, data?: unknown, config?: Record<string, unknown>): Promise<AxiosResponse> {
        return this.client.post(path, data, config);
    }

    async put(path: string, data?: unknown, config?: Record<string, unknown>): Promise<AxiosResponse> {
        return this.client.put(path, data, config);
    }

    async delete(path: string, config?: Record<string, unknown>): Promise<AxiosResponse> {
        return this.client.delete(path, config);
    }
}

/**
 * Create a client with no API key (for testing unauthenticated access)
 */
export function createUnauthenticatedClient(): ApiClient {
    return new ApiClient('');
}

/**
 * Create a client with a specific API key
 */
export function createClientWithKey(apiKey: string): ApiClient {
    return new ApiClient(apiKey);
}

// Default singleton client
let defaultClient: ApiClient | null = null;

export function getClient(): ApiClient {
    if (!defaultClient) {
        defaultClient = new ApiClient();
    }
    return defaultClient;
}

export function resetClient(): void {
    defaultClient = null;
}
