/**
 * Rate limiting (US-028).
 *
 * Sliding-window approximation backed by KV. We use a one-second precision
 * window — sufficient for human-facing rate limits and dramatically cheaper
 * than the strict sliding-log algorithm.
 *
 * Per-second budget is derived from the tenant plan:
 *  - free       → 10 req/s
 *  - pro        → 50 req/s
 *  - business   → 200 req/s
 *  - enterprise → 1000 req/s
 *
 * Health endpoints (`/health/*`) are always exempt.
 */

import { tenants } from '@openwa/db/control-plane';
import { getControlPlaneDB } from '@openwa/db/helpers';
import { ERROR_CODES } from '@openwa/shared/errors';
import { eq } from 'drizzle-orm';
import type { ApiEnv } from '../env.js';
import { ApiError } from '../errors.js';
import type { AuthContext } from './auth.js';

export type TenantPlan = 'free' | 'pro' | 'business' | 'enterprise';

export const PLAN_LIMITS: Record<TenantPlan, number> = {
  free: 10,
  pro: 50,
  business: 200,
  enterprise: 1000,
};

export interface RateLimitOutcome {
  /** Limit for this window (in req/s). */
  limit: number;
  /** Requests remaining in the current window. */
  remaining: number;
  /** Unix seconds when the current window resets. */
  reset: number;
  /** Suggested `Retry-After` value (in seconds) when blocked. */
  retryAfter?: number;
}

const KV_PREFIX = 'rl:';
const PLAN_CACHE_PREFIX = 'rl:plan:';
const PLAN_CACHE_TTL = 60; // seconds

/**
 * Returns true when the path is exempt from rate limiting.
 */
export function isExemptPath(pathname: string): boolean {
  return pathname.startsWith('/health') || pathname.startsWith('/docs');
}

/**
 * Resolves a tenant's per-second limit, caching the value briefly in KV so
 * repeated reads don't hammer the control-plane DB. Falls back to `free`
 * when the tenant lookup fails.
 */
export async function resolvePlanLimit(env: ApiEnv, tenantId: string): Promise<number> {
  if (env.AUTH_CACHE) {
    const cached = await env.AUTH_CACHE.get(PLAN_CACHE_PREFIX + tenantId);
    if (cached) {
      const limit = Number(cached);
      if (Number.isFinite(limit) && limit > 0) return limit;
    }
  }
  let plan: TenantPlan = 'free';
  if (env.CONTROL_PLANE_DB) {
    try {
      const db = getControlPlaneDB(env.CONTROL_PLANE_DB);
      const row = await db
        .select({ plan: tenants.plan })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (row[0]) plan = row[0].plan as TenantPlan;
    } catch {
      // fall through with free
    }
  }
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
  if (env.AUTH_CACHE) {
    await env.AUTH_CACHE.put(PLAN_CACHE_PREFIX + tenantId, String(limit), {
      expirationTtl: PLAN_CACHE_TTL,
    }).catch(() => undefined);
  }
  return limit;
}

/**
 * Increments the request counter for {tenant + key} in the current
 * 1-second window. Returns an outcome and throws {@link ApiError} 429
 * when the limit is exceeded.
 *
 * Approach:
 *  - Bucket key = `rl:<tenantId>:<keyId>:<unixSecond>`
 *  - KV doesn't support atomic INCR, so we read → compute → write. This
 *    is racy on bursts but errs on the side of *under-counting* (we'll
 *    occasionally allow one extra request), never over-counting.
 *  - Bucket TTL is 2s so the entry self-cleans.
 */
export async function checkRateLimit(env: ApiEnv, auth: AuthContext): Promise<RateLimitOutcome> {
  const limit = await resolvePlanLimit(env, auth.tenantId);
  const nowSec = Math.floor(Date.now() / 1000);
  const reset = nowSec + 1;

  if (!env.AUTH_CACHE) {
    // No KV → fail open with a soft cap.
    return { limit, remaining: limit, reset };
  }

  const bucket = `${KV_PREFIX}${auth.tenantId}:${auth.keyId}:${nowSec}`;
  const current = Number((await env.AUTH_CACHE.get(bucket)) ?? '0');
  const next = current + 1;

  if (next > limit) {
    const outcome: RateLimitOutcome = {
      limit,
      remaining: 0,
      reset,
      retryAfter: 1,
    };
    throw new ApiError({
      status: 429,
      code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
      message: `Rate limit exceeded (${limit} req/s)`,
      details: outcome,
    });
  }

  await env.AUTH_CACHE.put(bucket, String(next), { expirationTtl: 2 }).catch(() => undefined);
  return { limit, remaining: Math.max(0, limit - next), reset };
}

/**
 * Builds the `X-RateLimit-*` headers for a successful response.
 */
export function rateLimitHeaders(outcome: RateLimitOutcome): Record<string, string> {
  return {
    'x-ratelimit-limit': String(outcome.limit),
    'x-ratelimit-remaining': String(outcome.remaining),
    'x-ratelimit-reset': String(outcome.reset),
  };
}
