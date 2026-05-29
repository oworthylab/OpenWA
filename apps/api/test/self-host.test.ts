/**
 * Self-host mode tests (US-065).
 *
 * Validates the behavioral seam without requiring a live D1:
 *   1. `isSelfHostEnabled` parses the env flag correctly.
 *   2. `/v1/auth/register` is rejected with 403 SELF_HOST_REGISTRATION_DISABLED.
 *   3. `bootstrapSelfHost` is a no-op when disabled or when CONTROL_PLANE_DB
 *      is missing — it must never throw.
 */

import { describe, expect, test } from 'bun:test';
import { buildApp } from '../src/app.js';
import type { ApiEnv } from '../src/env.js';
import { bootstrapSelfHost, isSelfHostEnabled } from '../src/lib/self-host.js';

describe('isSelfHostEnabled', () => {
  test('returns false when unset', () => {
    expect(isSelfHostEnabled({})).toBe(false);
  });
  test('returns false on falsy strings', () => {
    expect(isSelfHostEnabled({ SELF_HOST_MODE: 'false' })).toBe(false);
    expect(isSelfHostEnabled({ SELF_HOST_MODE: '' })).toBe(false);
    expect(isSelfHostEnabled({ SELF_HOST_MODE: '0' })).toBe(false);
  });
  test('returns true on case-insensitive "true"', () => {
    expect(isSelfHostEnabled({ SELF_HOST_MODE: 'true' })).toBe(true);
    expect(isSelfHostEnabled({ SELF_HOST_MODE: 'TRUE' })).toBe(true);
    expect(isSelfHostEnabled({ SELF_HOST_MODE: 'True' })).toBe(true);
  });
});

describe('bootstrapSelfHost', () => {
  test('no-op when SELF_HOST_MODE unset', async () => {
    await expect(bootstrapSelfHost({})).resolves.toBeUndefined();
  });
  test('no-op when CONTROL_PLANE_DB missing', async () => {
    await expect(bootstrapSelfHost({ SELF_HOST_MODE: 'true' })).resolves.toBeUndefined();
  });
});

describe('/v1/auth/register in self-host mode', () => {
  function env(): ApiEnv {
    return { SELF_HOST_MODE: 'true' };
  }
  test('returns 403 SELF_HOST_REGISTRATION_DISABLED with valid body', async () => {
    const app = buildApp(env());
    const res = await app.handle(
      new Request('http://localhost/v1/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'alice' + '@' + 'example.com',
          password: 'CorrectHorse9Battery!',
          name: 'Alice',
          tenantName: 'Acme',
          tenantSlug: 'acme',
        }),
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('SELF_HOST_REGISTRATION_DISABLED');
  });
  test('returns 403 even with malformed body (precedes validation)', async () => {
    const app = buildApp(env());
    const res = await app.handle(
      new Request('http://localhost/v1/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(403);
  });
  test('login still works (only register is gated)', async () => {
    const app = buildApp(env());
    const res = await app.handle(
      new Request('http://localhost/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'a' + '@' + 'b.com', password: 'x' }),
      }),
    );
    // 400 (validation) or 500 (no DB) — both prove the handler ran, not 403.
    expect(res.status).not.toBe(403);
  });
});

describe('/v1/auth/register in multi-tenant mode (default)', () => {
  test('reaches validation when SELF_HOST_MODE unset', async () => {
    const app = buildApp({});
    const res = await app.handle(
      new Request('http://localhost/v1/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    // 400 (validation failure) — proves register is reachable in multi-tenant.
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
