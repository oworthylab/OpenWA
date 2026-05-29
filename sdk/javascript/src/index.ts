/**
 * OpenWA JavaScript/TypeScript SDK (Sprint 8, US-061).
 *
 * Zero-dependency client for the OpenWA WhatsApp API gateway. Targets
 * the public `/v1/...` HTTP surface; works in Node, Bun, Deno, and
 * modern browsers (anywhere `fetch` is available).
 *
 * @example
 * ```typescript
 * import { OpenWAClient, OpenWAError } from '@openwa/sdk';
 *
 * const client = new OpenWAClient({
 *   baseUrl: 'https://api.openwa.io',
 *   apiKey: process.env.OPENWA_API_KEY!,
 * });
 *
 * try {
 *   await client.sessions.create({ name: 'main' });
 * } catch (e) {
 *   if (e instanceof OpenWAError) console.error(e.code, e.message);
 * }
 * ```
 *
 * @packageDocumentation
 */

// ────────────────── configuration ──────────────────

export interface OpenWAClientConfig {
  /** Base URL of the OpenWA API (no trailing slash). */
  baseUrl: string;
  /** API key for authentication — sent as `X-API-Key`. */
  apiKey: string;
  /** Request timeout in milliseconds. Defaults to 30000. */
  timeout?: number;
  /** Custom fetch implementation (tests, polyfills). */
  fetch?: typeof fetch;
  /** Optional default headers merged into every request. */
  defaultHeaders?: Record<string, string>;
}

// ────────────────── errors ──────────────────

/** Wire shape of `{ error: {...} }` responses. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export class OpenWAError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId?: string;

  constructor(status: number, body: ApiErrorBody['error'], requestId?: string) {
    super(body.message);
    this.name = 'OpenWAError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
    if (requestId) this.requestId = requestId;
  }
}

export class AuthError extends OpenWAError {
  constructor(status: number, body: ApiErrorBody['error'], requestId?: string) {
    super(status, body, requestId);
    this.name = 'AuthError';
  }
}
export class ValidationError extends OpenWAError {
  constructor(body: ApiErrorBody['error'], requestId?: string) {
    super(400, body, requestId);
    this.name = 'ValidationError';
  }
}
export class NotFoundError extends OpenWAError {
  constructor(body: ApiErrorBody['error'], requestId?: string) {
    super(404, body, requestId);
    this.name = 'NotFoundError';
  }
}
export class ConflictError extends OpenWAError {
  constructor(body: ApiErrorBody['error'], requestId?: string) {
    super(409, body, requestId);
    this.name = 'ConflictError';
  }
}
export class RateLimitError extends OpenWAError {
  readonly retryAfterSeconds?: number;
  constructor(body: ApiErrorBody['error'], retryAfter?: number, requestId?: string) {
    super(429, body, requestId);
    this.name = 'RateLimitError';
    if (retryAfter !== undefined) this.retryAfterSeconds = retryAfter;
  }
}
export class ServerError extends OpenWAError {
  constructor(status: number, body: ApiErrorBody['error'], requestId?: string) {
    super(status, body, requestId);
    this.name = 'ServerError';
  }
}

// ────────────────── response shapes ──────────────────

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total?: number };
}

export interface Session {
  id: string;
  name: string;
  status: string;
  phone: string | null;
  pushName: string | null;
}

export interface MessageResponse {
  messageId: string;
  timestamp: number;
}

export interface CrmContact {
  id: string;
  phoneNumber: string;
  name: string | null;
  email: string | null;
  tags: Array<{ id: string; name: string; color: string }>;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  waLabelId: string | null;
}

export interface Status {
  id: string;
  kind: 'text' | 'image' | 'video';
  text: string | null;
  mediaKey: string | null;
  viewCount: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface Settings {
  tenantId: string;
  displayName: string | null;
  timezone: string;
  language: string;
  theme: 'light' | 'dark' | 'system';
  notifyOnIncomingMessage: boolean;
  notifyOnSessionDisconnect: boolean;
  notifyEmail: string | null;
}

export interface PluginInstallation {
  id: string;
  pluginId: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
  installedAt: string;
  updatedAt: string;
}

// ────────────────── client ──────────────────

export class OpenWAClient {
  private readonly cfg: {
    baseUrl: string;
    apiKey: string;
    timeout: number;
    fetch: typeof fetch;
    defaultHeaders: Record<string, string>;
  };

  constructor(config: OpenWAClientConfig) {
    this.cfg = {
      baseUrl: config.baseUrl.replace(/\/$/, ''),
      apiKey: config.apiKey,
      timeout: config.timeout ?? 30000,
      fetch: config.fetch ?? globalThis.fetch.bind(globalThis),
      defaultHeaders: config.defaultHeaders ?? {},
    };
  }

  // ── resources ──

  get sessions() {
    const r = this.request.bind(this);
    return {
      list: () => r<{ data: Session[] }>('GET', '/v1/sessions'),
      get: (id: string) => r<Session>('GET', `/v1/sessions/${encodeURIComponent(id)}`),
      create: (data: { name: string }) => r<Session>('POST', '/v1/sessions', data),
      delete: (id: string) => r<void>('DELETE', `/v1/sessions/${encodeURIComponent(id)}`),
    };
  }

  get messages() {
    const r = this.request.bind(this);
    return {
      sendText: (sessionId: string, data: { to: string; text: string }) =>
        r<MessageResponse>(
          'POST',
          `/v1/sessions/${encodeURIComponent(sessionId)}/messages/text`,
          data,
        ),
    };
  }

  get crm() {
    const r = this.request.bind(this);
    return {
      contacts: {
        list: (q?: { page?: number; pageSize?: number; tag?: string; search?: string }) =>
          r<Paginated<CrmContact>>('GET', appendQuery('/v1/crm/contacts', q)),
        get: (id: string) => r<CrmContact>('GET', `/v1/crm/contacts/${encodeURIComponent(id)}`),
        create: (data: { phoneNumber: string; name?: string; email?: string }) =>
          r<{ id: string }>('POST', '/v1/crm/contacts', data),
        update: (id: string, data: Partial<CrmContact>) =>
          r<{ id: string; updated: true }>(
            'PATCH',
            `/v1/crm/contacts/${encodeURIComponent(id)}`,
            data,
          ),
        delete: (id: string) =>
          r<void>('DELETE', `/v1/crm/contacts/${encodeURIComponent(id)}`),
      },
      tags: {
        list: () =>
          r<{ data: Array<{ id: string; name: string; color: string }> }>('GET', '/v1/crm/tags'),
        create: (data: { name: string; color?: string }) =>
          r<{ id: string }>('POST', '/v1/crm/tags', data),
      },
      conversations: {
        list: (q?: { status?: string; assignee?: string }) =>
          r<{ data: unknown[] }>('GET', appendQuery('/v1/crm/conversations', q)),
      },
      templates: {
        list: () => r<{ data: unknown[] }>('GET', '/v1/crm/templates'),
        create: (data: { name: string; body: string }) =>
          r<{ id: string }>('POST', '/v1/crm/templates', data),
      },
    };
  }

  get mart() {
    const r = this.request.bind(this);
    return {
      link: (data: { storeUrl: string; secret: string }) =>
        r<{ id: string }>('POST', '/v1/integrations/mart/link', data),
      unlink: () => r<void>('DELETE', '/v1/integrations/mart/link'),
    };
  }

  get labels() {
    const r = this.request.bind(this);
    return {
      list: () => r<{ data: Label[] }>('GET', '/v1/labels'),
      create: (data: { name: string; color?: string; waLabelId?: string | null }) =>
        r<{ id: string }>('POST', '/v1/labels', data),
      update: (id: string, data: Partial<Label>) =>
        r<{ id: string; updated: true }>('PATCH', `/v1/labels/${encodeURIComponent(id)}`, data),
      delete: (id: string) => r<void>('DELETE', `/v1/labels/${encodeURIComponent(id)}`),
      assign: (contactId: string, labelIds: string[]) =>
        r<{ contactId: string; assigned: string[] }>(
          'POST',
          `/v1/contacts/${encodeURIComponent(contactId)}/labels`,
          { labelIds },
        ),
      remove: (contactId: string, labelId: string) =>
        r<void>(
          'DELETE',
          `/v1/contacts/${encodeURIComponent(contactId)}/labels/${encodeURIComponent(labelId)}`,
        ),
      bulk: (data: { contactIds: string[]; labelIds: string[]; action: 'assign' | 'remove' }) =>
        r<{ action: 'assign' | 'remove'; touched: number }>('POST', '/v1/labels/bulk', data),
    };
  }

  get status() {
    const r = this.request.bind(this);
    return {
      list: (q?: { page?: number; pageSize?: number; sessionId?: string }) =>
        r<Paginated<Status>>('GET', appendQuery('/v1/status', q)),
      postText: (data: {
        sessionId: string;
        text: string;
        backgroundColor?: string;
        font?: string;
      }) => r<{ id: string; expiresAt: string }>('POST', '/v1/status/text', data),
      postMedia: (data: {
        sessionId: string;
        kind: 'image' | 'video';
        mediaUrl?: string;
        mediaKey?: string;
        caption?: string;
      }) => r<{ id: string; expiresAt: string }>('POST', '/v1/status/media', data),
      get: (id: string) => r<Status>('GET', `/v1/status/${encodeURIComponent(id)}`),
      delete: (id: string) => r<void>('DELETE', `/v1/status/${encodeURIComponent(id)}`),
      views: (id: string) =>
        r<{ data: Array<{ viewerJid: string; viewedAt: string }> }>(
          'GET',
          `/v1/status/${encodeURIComponent(id)}/views`,
        ),
      recordView: (id: string, viewerJid: string) =>
        r<{ recorded: boolean }>('POST', `/v1/status/${encodeURIComponent(id)}/views`, {
          viewerJid,
        }),
    };
  }

  get settings() {
    const r = this.request.bind(this);
    return {
      get: () => r<Settings>('GET', '/v1/settings'),
      update: (data: Partial<Omit<Settings, 'tenantId'>>) =>
        r<Settings>('PATCH', '/v1/settings', data),
    };
  }

  get plugins() {
    const r = this.request.bind(this);
    return {
      list: () => r<{ data: PluginInstallation[] }>('GET', '/v1/plugins'),
      install: (data: {
        pluginId: string;
        enabled?: boolean;
        config?: Record<string, unknown>;
      }) => r<{ id: string }>('POST', '/v1/plugins', data),
      update: (
        id: string,
        data: { enabled?: boolean; config?: Record<string, unknown> | null },
      ) =>
        r<{ id: string; updated: true }>('PATCH', `/v1/plugins/${encodeURIComponent(id)}`, data),
      uninstall: (id: string) => r<void>('DELETE', `/v1/plugins/${encodeURIComponent(id)}`),
    };
  }

  get webhooks() {
    const r = this.request.bind(this);
    return {
      list: () => r<{ data: unknown[] }>('GET', '/v1/webhooks'),
      create: (data: { url: string; events: string[]; secret?: string }) =>
        r<{ id: string }>('POST', '/v1/webhooks', data),
      delete: (id: string) => r<void>('DELETE', `/v1/webhooks/${encodeURIComponent(id)}`),
    };
  }

  // ────────────────── transport ──────────────────

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.cfg.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'X-API-Key': this.cfg.apiKey,
      ...this.cfg.defaultHeaders,
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const init: RequestInit = {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };
    if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
      init.signal = (AbortSignal as { timeout(ms: number): AbortSignal }).timeout(this.cfg.timeout);
    }
    const response = await this.cfg.fetch(url, init);
    const requestId = response.headers.get('x-request-id') ?? undefined;
    if (response.status === 204) return undefined as T;
    if (!response.ok) {
      let parsed: ApiErrorBody | undefined;
      try {
        parsed = (await response.json()) as ApiErrorBody;
      } catch {
        parsed = { error: { code: 'UNKNOWN_ERROR', message: response.statusText } };
      }
      throw classifyError(response, parsed, requestId);
    }
    return (await response.json()) as T;
  }
}

function appendQuery(path: string, q?: Record<string, unknown>): string {
  if (!q) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function classifyError(
  response: Response,
  body: ApiErrorBody,
  requestId?: string,
): OpenWAError {
  const e = body.error;
  switch (response.status) {
    case 400:
      return new ValidationError(e, requestId);
    case 401:
    case 403:
      return new AuthError(response.status, e, requestId);
    case 404:
      return new NotFoundError(e, requestId);
    case 409:
      return new ConflictError(e, requestId);
    case 429: {
      const ra = Number(response.headers.get('retry-after') ?? '');
      return new RateLimitError(e, Number.isFinite(ra) ? ra : undefined, requestId);
    }
    default:
      if (response.status >= 500) return new ServerError(response.status, e, requestId);
      return new OpenWAError(response.status, e, requestId);
  }
}

export default OpenWAClient;
