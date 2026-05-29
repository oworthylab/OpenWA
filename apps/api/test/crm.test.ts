/** Smoke tests for /v1/crm/* routes. */

import { describe, expect, test } from 'bun:test';
import { buildApp } from '../src/app.js';
import type { ApiEnv } from '../src/env.js';

function emptyEnv(): ApiEnv {
  return {};
}

describe('CRM routes — unauthenticated', () => {
  test('GET /v1/crm/contacts → 401 without API key', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(new Request('http://localhost/v1/crm/contacts'));
    expect(res.status).toBe(401);
  });

  test('POST /v1/crm/tags → 401 without API key', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(
      new Request('http://localhost/v1/crm/tags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'vip' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test('GET /v1/crm/conversations → 401 without API key', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(new Request('http://localhost/v1/crm/conversations'));
    expect(res.status).toBe(401);
  });

  test('POST /v1/crm/templates → 401 without API key', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(
      new Request('http://localhost/v1/crm/templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'welcome', body: 'Hello {{name}}' }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
