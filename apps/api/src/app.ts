/**
 * Elysia app factory. Per-request app instance bound to the supplied env
 * via closure. This sidesteps Elysia's `.state()` semantics and gives
 * each route module clean access to bindings.
 */

import { Elysia } from 'elysia';
import type { ApiEnv } from './env.js';
import { ApiError, internal, notFound, unauthorized } from './errors.js';
import { healthRoutes } from './routes/health.js';
import { sessionRoutes } from './routes/sessions.js';
import { webhookRoutes } from './routes/webhooks.js';

export function buildApp(env: ApiEnv) {
  return new Elysia({ aot: false })
    .onError(({ error, set }) => {
      if (error instanceof ApiError) {
        set.status = error.status;
        return error.toResponse();
      }
      const code = (error as { code?: string }).code;
      if (code === 'NOT_FOUND') {
        const e = notFound();
        set.status = e.status;
        return e.toResponse();
      }
      console.error('[api] unhandled error', error);
      const e = internal('Internal server error');
      set.status = e.status;
      return e.toResponse();
    })
    .use(healthRoutes(env))
    .use(sessionRoutes(env))
    .use(webhookRoutes(env))
    .all('*', () => {
      throw unauthorized('Unknown route', 'NOT_FOUND');
    });
}

export type App = ReturnType<typeof buildApp>;
