/**
 * OpenWA API — Cloudflare Worker entrypoint.
 *
 * Exposes:
 *  - `fetch`: the Elysia REST API
 *  - `queue`: the webhook delivery consumer
 *
 * Built on Sprint 3 deliverables (US-021/022/023/026/029/030/031/032).
 */

import { buildApp } from './app.js';
import type { ApiEnv, WebhookQueueMessage } from './env.js';
import { ApiError } from './errors.js';
import { authenticate } from './middleware/auth.js';
import { handleQueueBatch } from './webhook-consumer.js';

export type { ApiEnv, WebhookQueueMessage };

/**
 * Lightweight short-circuit for `/v1/auth/validate`. The dashboard
 * POSTs with `Content-Type: application/json` and an empty body, which
 * Elysia's JSON parser rejects with a 500. We answer the request
 * directly to keep the SPA login flow working without touching the
 * shared parser config.
 */
async function handleValidate(request: Request, env: ApiEnv): Promise<Response> {
  try {
    const auth = await authenticate(request, env);
    const role =
      auth.role === 'admin' ? 'admin' : auth.role === 'read_write' ? 'operator' : 'viewer';
    return Response.json({
      valid: true,
      role,
      tenantId: auth.tenantId,
      keyId: auth.keyId,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status },
      );
    }
    return Response.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}

export default {
  async fetch(request: Request, env: ApiEnv, ctx: ExecutionContext): Promise<Response> {
    void ctx;
    const url = new URL(request.url);
    if (
      url.pathname === '/v1/auth/validate' &&
      (request.method === 'POST' || request.method === 'GET')
    ) {
      return handleValidate(request, env);
    }
    const app = buildApp(env);
    try {
      return await app.handle(request);
    } catch (err) {
      console.error('[api] fatal', err);
      return Response.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
        { status: 500 },
      );
    }
  },

  async queue(batch: MessageBatch<WebhookQueueMessage>, env: ApiEnv): Promise<void> {
    await handleQueueBatch(batch, env);
  },
};
