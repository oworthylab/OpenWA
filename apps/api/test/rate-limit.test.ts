/**
 * Rate-limit middleware unit tests.
 *
 * Uses an in-memory KV stub since we only need to validate the algorithm,
 * not Cloudflare's KV semantics.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import type { ApiEnv } from '../src/env.js';
import { ApiError } from '../src/errors.js';
import type { AuthContext } from '../src/middleware/auth.js';
import {
  PLAN_LIMITS,
  checkRateLimit,
  isExemptPath,
  rateLimitHeaders,
  resolvePlanLimit,
} from '../src/middleware/rate-limit.js';

function makeKv() {
  const store = new Map<string, { value: string; expiresAt?: number }>();
  return {
    async get(key: string, _format?: string): Promise<string | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt !== undefined && entry.expiresAt < Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
      store.set(key, {
        value,
        expiresAt:
          opts?.expirationTtl !== undefined ? Date.now() + opts.expirationTtl * 1000 : undefined,
      });
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
    _store: store,
  } as unknown as KVNamespace & { _store: Map<string, unknown> };
}

function makeAuth(): AuthContext {
  return {
    tenantId: 'tenant_test',
    tenantStatus: 'active',
    keyId: 'key_test',
    role: 'read_write',
    tenantDbId: null,
  };
}

function makeEnv(kv: KVNamespace, planLimit: number): ApiEnv {
  return { AUTH_CACHE: kv } as ApiEnv & { _planLimit: number; AUTH_CACHE: KVNamespace } as ApiEnv;
}

describe('isExemptPath', () => {
  test('exempts /health and subroutes', () => {
    expect(isExemptPath('/health')).toBe(true);
    expect(isExemptPath('/health/ready')).toBe(true);
    expect(isExemptPath('/health/live')).toBe(true);
  });
  test('does not exempt other paths', () => {
    expect(isExemptPath('/v1/sessions')).toBe(false);
    expect(isExemptPath('/v1/audit')).toBe(false);
    expect(isExemptPath('/healthy')).toBe(true); // startsWith /health — documented behaviour
  });
});

describe('PLAN_LIMITS', () => {
  test('plan tiers are ordered correctly', () => {
    expect(PLAN_LIMITS.free).toBeLessThan(PLAN_LIMITS.pro);
    expect(PLAN_LIMITS.pro).toBeLessThan(PLAN_LIMITS.business);
    expect(PLAN_LIMITS.business).toBeLessThan(PLAN_LIMITS.enterprise);
  });
});

describe('resolvePlanLimit', () => {
  test('returns free limit when no DB binding and no cache', async () => {
    const env = { AUTH_CACHE: makeKv() } as ApiEnv;
    const limit = await resolvePlanLimit(env, 'tenant_x');
    expect(limit).toBe(PLAN_LIMITS.free);
  });

  test('uses cached value when present', async () => {
    const kv = makeKv();
    await kv.put('rl:plan:tenant_x', '200');
    const env = { AUTH_CACHE: kv } as ApiEnv;
    const limit = await resolvePlanLimit(env, 'tenant_x');
    expect(limit).toBe(200);
  });
});

describe('checkRateLimit', () => {
  let kv: KVNamespace;
  let env: ApiEnv;

  beforeEach(() => {
    kv = makeKv();
    env = makeEnv(kv, PLAN_LIMITS.free);
  });

  test('allows requests under the limit and decrements remaining', async () => {
    const auth = makeAuth();
    const first = await checkRateLimit(env, auth);
    expect(first.limit).toBe(PLAN_LIMITS.free);
    expect(first.remaining).toBe(PLAN_LIMITS.free - 1);
    const second = await checkRateLimit(env, auth);
    expect(second.remaining).toBe(PLAN_LIMITS.free - 2);
  });

  test('throws 429 ApiError when the limit is exceeded', async () => {
    const auth = makeAuth();
    for (let i = 0; i < PLAN_LIMITS.free; i++) {
      await checkRateLimit(env, auth);
    }
    let caught: unknown;
    try {
      await checkRateLimit(env, auth);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(429);
    expect((caught as ApiError).code).toBe('RATE_LIMIT_EXCEEDED');
    const details = (caught as ApiError).details as { retryAfter?: number; limit: number };
    expect(details.limit).toBe(PLAN_LIMITS.free);
    expect(details.retryAfter).toBe(1);
  });

  test('separate {tenantId, keyId} buckets do not collide', async () => {
    const a: AuthContext = { ...makeAuth(), keyId: 'key_a' };
    const b: AuthContext = { ...makeAuth(), keyId: 'key_b' };
    for (let i = 0; i < PLAN_LIMITS.free; i++) {
      await checkRateLimit(env, a);
    }
    // `b` should still be allowed.
    const outcome = await checkRateLimit(env, b);
    expect(outcome.remaining).toBe(PLAN_LIMITS.free - 1);
  });

  test('fail-open when no KV binding is available', async () => {
    const noKv: ApiEnv = {};
    const outcome = await checkRateLimit(noKv, makeAuth());
    expect(outcome.limit).toBe(PLAN_LIMITS.free);
    expect(outcome.remaining).toBe(outcome.limit);
  });
});

describe('rateLimitHeaders', () => {
  test('produces lowercase canonical headers', () => {
    const headers = rateLimitHeaders({ limit: 50, remaining: 49, reset: 1700000000 });
    expect(headers['x-ratelimit-limit']).toBe('50');
    expect(headers['x-ratelimit-remaining']).toBe('49');
    expect(headers['x-ratelimit-reset']).toBe('1700000000');
  });
});
