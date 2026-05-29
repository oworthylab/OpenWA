import type { ApiError } from '../errors/index.js';

export interface Paginated<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
}

export type ApiResult<T> = { data: T } | { error: ApiError };

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  service: string;
  version: string;
  timestamp: string;
  checks?: Record<string, 'ok' | 'fail' | 'skip'>;
}

export interface CreateSessionRequest {
  name: string;
  proxyUrl?: string | null;
}

export interface StartSessionResponse {
  sessionId: string;
  status: string;
  qr?: string;
  pairingCode?: string;
}

export interface SendTextRequest {
  to: string;
  body: string;
  quotedMessageId?: string;
}

export interface SendMediaRequest {
  to: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  url?: string;
  base64?: string;
  caption?: string;
  fileName?: string;
}

export interface CreateWebhookRequest {
  sessionId?: string | null;
  url: string;
  events: string[];
  secret?: string;
}

export interface CreateApiKeyRequest {
  name: string;
  role: 'admin' | 'read_write' | 'read_only';
  expiresAt?: string | null;
}

export interface CreateApiKeyResponse {
  id: string;
  key: string;
  prefix: string;
  message: string;
}
