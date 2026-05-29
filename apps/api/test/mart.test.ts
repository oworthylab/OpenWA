/** Tests for Mart integration routes + helpers. */

import { describe, expect, test } from 'bun:test';
import { buildApp } from '../src/app.js';
import type { ApiEnv } from '../src/env.js';
import { verifyOwnership, verifyStoredSecret } from '../src/lib/mart-client.js';

function emptyEnv(): ApiEnv {
  return {};
}

describe('Mart routes — unauthenticated paths', () => {
  test('GET /v1/integrations/mart → 401 without API key', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(new Request('http://localhost/v1/integrations/mart'));
    expect(res.status).toBe(401);
  });

  test('POST /v1/integrations/mart/link → 401 without API key', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(
      new Request('http://localhost/v1/integrations/mart/link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storeUrl: 'https://shop.example', secret: 'x'.repeat(40) }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test('POST /v1/integrations/mart/webhooks → 401 without X-Mart-Secret', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(
      new Request('http://localhost/v1/integrations/mart/webhooks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(401);
  });

  test('POST /v1/integrations/mart/webhooks → 400 on malformed envelope', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(
      new Request('http://localhost/v1/integrations/mart/webhooks', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-mart-secret': 'whatever',
        },
        body: JSON.stringify({ not: 'an envelope' }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('verifyOwnership (stub mode)', () => {
  test('returns stub success when forceStub is set', async () => {
    const r = await verifyOwnership({
      storeUrl: 'https://shop.example',
      secret: 's'.repeat(40),
      forceStub: true,
    });
    expect(r.ok).toBe(true);
    expect(r.stub).toBe(true);
    expect(r.storeName).toBe('Stub Store');
  });

  test('returns stub when URL not https', async () => {
    const r = await verifyOwnership({
      storeUrl: 'http://insecure.example',
      secret: 's'.repeat(40),
    });
    expect(r.stub).toBe(true);
  });

  test('falls back when fetch rejects', async () => {
    const r = await verifyOwnership({
      storeUrl: 'https://shop.example',
      secret: 's'.repeat(40),
      fetchImpl: () => Promise.reject(new Error('network')) as ReturnType<typeof fetch>,
    });
    expect(r.ok).toBe(false);
    expect(r.stub).toBe(false);
  });
});

describe('verifyStoredSecret', () => {
  test('matches when hash equals sha256(plaintext)', async () => {
    // sha256('hello world')
    const hash = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';
    expect(await verifyStoredSecret('hello world', hash)).toBe(true);
  });

  test('rejects mismatched plaintext', async () => {
    const hash = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';
    expect(await verifyStoredSecret('not the secret', hash)).toBe(false);
  });
});
