/**
 * Elysia app factory. Per-request app instance bound to the supplied env
 * via closure. This sidesteps Elysia's `.state()` semantics and gives
 * each route module clean access to bindings.
 */

import { Elysia } from 'elysia';
import type { ApiEnv } from './env.js';
import { ApiError, internal, notFound, unauthorized } from './errors.js';
import { bootstrapSelfHost, isSelfHostEnabled } from './lib/self-host.js';
import { SentryReporter } from './lib/sentry.js';
import { authenticate } from './middleware/auth.js';
import { beginRequest, completeRequest, getLogger } from './middleware/logging.js';
import { checkRateLimit, isExemptPath, rateLimitHeaders } from './middleware/rate-limit.js';
import { auditRoutes } from './routes/audit.js';
import { authRoutes } from './routes/auth.js';
import { billingRoutes } from './routes/billing.js';
import { contactRoutes } from './routes/contacts.js';
import { crmRoutes } from './routes/crm.js';
import { docsRoutes } from './routes/docs.js';
import { groupRoutes } from './routes/groups.js';
import { healthRoutes } from './routes/health.js';
import { labelRoutes } from './routes/labels.js';
import { martRoutes } from './routes/mart.js';
import { pluginRoutes } from './routes/plugins.js';
import { sessionRoutes } from './routes/sessions.js';
import { settingsRoutes } from './routes/settings.js';
import { statusRoutes } from './routes/statuses.js';
import { webhookRoutes } from './routes/webhooks.js';

export function buildApp(env: ApiEnv) {
  const sentry = new SentryReporter({
    dsn: env.SENTRY_DSN,
    environment: env.ENVIRONMENT,
    release: env.SENTRY_RELEASE,
  });
  const reqLog = new WeakMap<Request, { requestId: string; startedAt: number }>();
  return new Elysia({ aot: false })
    .onRequest(({ request, set }) => {
      const ctx = beginRequest(request);
      reqLog.set(request, ctx);
      set.headers['x-request-id'] = ctx.requestId;
    })
    .onAfterHandle(({ request, set }) => {
      const ctx = reqLog.get(request);
      if (!ctx) return;
      set.headers['x-request-id'] = ctx.requestId;
      const status = typeof set.status === 'number' ? set.status : 200;
      completeRequest(env, ctx, request, status);
    })
    .onError(({ error, set, request }) => {
      const ctx = reqLog.get(request);
      const requestId = ctx?.requestId ?? (set.headers['x-request-id'] as string | undefined) ?? '';
      if (requestId) set.headers['x-request-id'] = requestId;
      const withRequestId = (res: Response): Response => {
        if (!requestId) return res;
        const h = new Headers(res.headers);
        h.set('x-request-id', requestId);
        return new Response(res.body, { status: res.status, headers: h });
      };
      if (error instanceof ApiError) {
        set.status = error.status;
        const res = error.toResponse();
        if (ctx) {
          completeRequest(env, ctx, request, error.status, { code: error.code });
        }
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
          if (ctx) h.set('x-request-id', ctx.requestId);
          return new Response(res.body, { status: res.status, headers: h });
        }
        return withRequestId(res);
      }
      const code = (error as { code?: string }).code;
      if (code === 'NOT_FOUND') {
        const e = notFound();
        set.status = e.status;
        if (ctx) completeRequest(env, ctx, request, e.status, { code: 'NOT_FOUND' });
        return withRequestId(e.toResponse());
      }
      getLogger(env).error('request.unhandled', {
        requestId: ctx?.requestId,
        err: (error as Error).message,
      });
      void sentry.report(error, {
        requestId: ctx?.requestId,
        path: new URL(request.url).pathname,
        method: request.method,
      });
      const e = internal('Internal server error');
      set.status = e.status;
      if (ctx) completeRequest(env, ctx, request, e.status, { code: 'INTERNAL_ERROR' });
      return withRequestId(e.toResponse());
    })
    .onBeforeHandle(async ({ request, set }) => {
      const url = new URL(request.url);
      if (isExemptPath(url.pathname)) return;
      // Self-host mode: ensure default tenant + admin key are present
      // before any auth lookup happens.
      if (isSelfHostEnabled(env)) {
        await bootstrapSelfHost(env);
      }
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
    .use(crmRoutes(env))
    .use(martRoutes(env))
    .use(auditRoutes(env))
    .use(labelRoutes(env))
    .use(statusRoutes(env))
    .use(settingsRoutes(env))
    .use(pluginRoutes(env))
    .use(docsRoutes(env))
    .all('*', () => {
      throw unauthorized('Unknown route', 'NOT_FOUND');
    });
}

export type App = ReturnType<typeof buildApp>;
