/**
 * Thin client for the engine Worker (which fronts the WhatsApp session
 * Durable Objects). Uses a Cloudflare service binding (`env.ENGINE`)
 * so the request stays inside the Worker network without DNS or TLS.
 */

import { ApiError, internal } from '../errors.js';

export interface EngineCallOptions {
  method?: string;
  body?: unknown;
}

export interface EngineSessionStatus {
  state: string;
  authenticated: boolean;
  qr?: string;
  pairingCode?: string;
  lastError?: { code: string; message: string };
  uptimeMs?: number;
}

export class EngineClient {
  constructor(private readonly engine: Fetcher | undefined) {}

  /**
   * Engine binding is optional in dev. Routes that need a live engine should
   * call `requireEngine()` first.
   */
  isAvailable(): boolean {
    return Boolean(this.engine);
  }

  async call<T = unknown>(
    sessionId: string,
    path: string,
    opts: EngineCallOptions = {},
  ): Promise<T> {
    if (!this.engine) {
      throw internal('Engine binding not configured');
    }
    const method = opts.method ?? 'GET';
    const init: RequestInit = { method };
    if (opts.body !== undefined) {
      init.body = JSON.stringify(opts.body);
      init.headers = { 'content-type': 'application/json' };
    }
    // The engine Worker exposes /sessions/:id/<subpath>.
    const url = `https://engine.internal/sessions/${encodeURIComponent(sessionId)}${path}`;
    const res = await this.engine.fetch(url, init);
    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = await res.text().catch(() => undefined);
      }
      throw new ApiError({
        status: res.status,
        code: 'ENGINE_ERROR',
        message: `Engine call ${method} ${path} failed (${res.status})`,
        details: body,
      });
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  status(sessionId: string): Promise<EngineSessionStatus> {
    return this.call<EngineSessionStatus>(sessionId, '/status');
  }

  start(sessionId: string, opts?: { phoneNumber?: string }): Promise<EngineSessionStatus> {
    return this.call<EngineSessionStatus>(sessionId, '/connect', {
      method: 'POST',
      body: opts ?? {},
    });
  }

  stop(sessionId: string): Promise<void> {
    return this.call<void>(sessionId, '/disconnect', { method: 'POST' });
  }

  logout(sessionId: string): Promise<void> {
    return this.call<void>(sessionId, '/logout', { method: 'POST' });
  }

  qr(sessionId: string): Promise<{ qr: string | null }> {
    return this.call<{ qr: string | null }>(sessionId, '/qr');
  }

  sendText(
    sessionId: string,
    body: unknown,
  ): Promise<{ id: string; to: string; timestamp: number }> {
    return this.call(sessionId, '/messages/text', { method: 'POST', body });
  }

  sendMedia(
    sessionId: string,
    body: unknown,
  ): Promise<{ id: string; to: string; timestamp: number }> {
    return this.call(sessionId, '/messages/media', { method: 'POST', body });
  }

  health(sessionId: string): Promise<{ state: string; uptimeMs: number }> {
    return this.call(sessionId, '/health');
  }
}
