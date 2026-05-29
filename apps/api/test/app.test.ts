/**
 * Smoke tests for the Elysia app surface. Routes that need bindings are
 * not exercised here — those are covered by integration/e2e suites that
 * run against `wrangler dev` with real D1/KV/Queue.
 */

import { describe, expect, test } from 'bun:test';
import { buildApp } from '../src/app.js';
import type { ApiEnv } from '../src/env.js';

function emptyEnv(): ApiEnv {
  return {};
}

describe('health endpoints', () => {
  test('GET /health → 200', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('openwa-api');
  });

  test('GET /health/live → 200', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(new Request('http://localhost/health/live'));
    expect(res.status).toBe(200);
  });

  test('GET /health/ready → 503 without bindings', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(new Request('http://localhost/health/ready'));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; checks: Record<string, { ok: boolean }> };
    expect(body.status).toBe('degraded');
    expect(body.checks.controlPlaneDb?.ok).toBe(false);
    expect(body.checks.authCache?.ok).toBe(false);
  });
});

describe('auth gating', () => {
  test('protected route without key → 401 with INVALID_API_KEY-class code', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(new Request('http://localhost/v1/sessions'));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  test('protected route with malformed key → 401 INVALID_API_KEY', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(
      new Request('http://localhost/v1/sessions', {
        headers: { 'x-api-key': 'not-a-real-key' },
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_API_KEY');
  });
});
