/** Smoke tests for /v1/auth and /v1/billing routes. */

import { describe, expect, test } from 'bun:test';
import { buildApp } from '../src/app.js';
import type { ApiEnv } from '../src/env.js';

function emptyEnv(): ApiEnv {
  return {};
}

describe('GET /v1/billing/plans (public)', () => {
  test('returns plan catalogue', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(new Request('http://localhost/v1/billing/plans'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plans: Record<string, { label: string }> };
    expect(body.plans.free?.label).toBe('Free');
    expect(body.plans.enterprise?.label).toBe('Enterprise');
  });
});

describe('POST /v1/auth/register validation', () => {
  test('rejects malformed body with 400', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(
      new Request('http://localhost/v1/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('returns 500 when DB binding missing on valid body', async () => {
    const app = buildApp(emptyEnv());
    const validBody = {
      email: 'alice' + '@' + 'example.com',
      password: 'CorrectHorse9Battery!',
      name: 'Alice',
      tenantName: 'Acme',
      tenantSlug: 'acme',
    };
    const res = await app.handle(
      new Request('http://localhost/v1/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      }),
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});

describe('POST /v1/auth/verify-email validation', () => {
  test('rejects empty body with 400', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(
      new Request('http://localhost/v1/auth/verify-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /v1/billing/webhooks', () => {
  test('503 when STRIPE_WEBHOOK_SECRET not configured', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(
      new Request('http://localhost/v1/billing/webhooks', {
        method: 'POST',
        body: '{}',
        headers: { 'stripe-signature': 't=1,v1=abc' },
      }),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('BILLING_NOT_CONFIGURED');
  });

  test('400 on invalid signature when configured', async () => {
    const env: ApiEnv = { STRIPE_WEBHOOK_SECRET: 'whsec_test' };
    const app = buildApp(env);
    const res = await app.handle(
      new Request('http://localhost/v1/billing/webhooks', {
        method: 'POST',
        body: '{}',
        headers: { 'stripe-signature': 't=1,v1=deadbeef' },
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('STRIPE_SIGNATURE_INVALID');
  });
});

describe('GET /v1/billing/usage', () => {
  test('401 without auth', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(new Request('http://localhost/v1/billing/usage'));
    expect(res.status).toBe(401);
  });
});
