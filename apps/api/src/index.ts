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
import { handleQueueBatch } from './webhook-consumer.js';

export type { ApiEnv, WebhookQueueMessage };

export default {
  async fetch(request: Request, env: ApiEnv, ctx: ExecutionContext): Promise<Response> {
    void ctx;
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
