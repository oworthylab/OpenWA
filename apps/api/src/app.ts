/**
 * Elysia app factory. Per-request app instance bound to the supplied env
 * via closure. This sidesteps Elysia's `.state()` semantics and gives
 * each route module clean access to bindings.
 */

import { Elysia } from 'elysia';
import type { ApiEnv } from './env.js';
import { ApiError, internal, notFound, unauthorized } from './errors.js';
import { authenticate } from './middleware/auth.js';
import { checkRateLimit, isExemptPath, rateLimitHeaders } from './middleware/rate-limit.js';
import { auditRoutes } from './routes/audit.js';
import { authRoutes } from './routes/auth.js';
import { billingRoutes } from './routes/billing.js';
import { contactRoutes } from './routes/contacts.js';
import { groupRoutes } from './routes/groups.js';
import { healthRoutes } from './routes/health.js';
import { sessionRoutes } from './routes/sessions.js';
import { webhookRoutes } from './routes/webhooks.js';

export function buildApp(env: ApiEnv) {
  return new Elysia({ aot: false })
    .onError(({ error, set }) => {
      if (error instanceof ApiError) {
        set.status = error.status;
        const res = error.toResponse();
        // Surface rate-limit headers on 429 responses.
        if (error.status === 429 && typeof error.details === 'object' && error.details) {
          const d = error.details as {
            retryAfter?: number;
            limit?: number;
            remaining?: number;
            reset?: number;
          };
          const h = new Headers(res.headers);
          if (d.retryAfter !== undefined) h.set('retry-after', String(d.retryAfter));
          if (d.limit !== undefined) h.set('x-ratelimit-limit', String(d.limit));
          if (d.remaining !== undefined) h.set('x-ratelimit-remaining', String(d.remaining));
          if (d.reset !== undefined) h.set('x-ratelimit-reset', String(d.reset));
          return new Response(res.body, { status: res.status, headers: h });
        }
        return res;
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
    .onBeforeHandle(async ({ request, set }) => {
      const url = new URL(request.url);
      if (isExemptPath(url.pathname)) return;
      // Skip rate limiting on unauthenticated requests — auth will fail later
      // with a clearer error than a 429.
      const header = request.headers.get('x-api-key') ?? request.headers.get('authorization');
      if (!header) return;
      const auth = await authenticate(request, env);
      const outcome = await checkRateLimit(env, auth);
      for (const [k, v] of Object.entries(rateLimitHeaders(outcome))) {
        set.headers[k] = v;
      }
    })
    .use(healthRoutes(env))
    .use(authRoutes(env))
    .use(billingRoutes(env))
    .use(sessionRoutes(env))
    .use(webhookRoutes(env))
    .use(contactRoutes(env))
    .use(groupRoutes(env))
    .use(auditRoutes(env))
    .all('*', () => {
      throw unauthorized('Unknown route', 'NOT_FOUND');
    });
}

export type App = ReturnType<typeof buildApp>;
