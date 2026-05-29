/** Smoke tests for Sprint 8 routes — verify auth gating + docs. */

import { describe, expect, test } from 'bun:test';
import { buildApp } from '../src/app.js';
import type { ApiEnv } from '../src/env.js';
import { buildOpenApiSpec } from '../src/lib/openapi.js';

const emptyEnv = (): ApiEnv => ({});

describe('Sprint 8 routes — auth gating', () => {
  for (const path of [
    '/v1/labels',
    '/v1/status',
    '/v1/settings',
    '/v1/plugins',
  ]) {
    test(`GET ${path} → 401 without API key`, async () => {
      const app = buildApp(emptyEnv());
      const res = await app.handle(new Request(`http://localhost${path}`));
      expect(res.status).toBe(401);
    });
  }

  test('POST /v1/labels → 401 without API key', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(
      new Request('http://localhost/v1/labels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'urgent' }),
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe('Sprint 8 routes — docs are public', () => {
  test('GET /docs/openapi.json → 200 without auth', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(new Request('http://localhost/docs/openapi.json'));
    expect(res.status).toBe(200);
    const spec = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(spec.openapi.startsWith('3.')).toBe(true);
    expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
  });

  test('GET /docs → returns HTML viewer', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(new Request('http://localhost/docs/'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    expect(body).toContain('api-reference');
  });
});

describe('OpenAPI spec', () => {
  test('every path starts with /v1 or /health', () => {
    const spec = buildOpenApiSpec();
    const paths = Object.keys(spec.paths as Record<string, unknown>);
    for (const p of paths) {
      expect(p.startsWith('/v1') || p.startsWith('/health')).toBe(true);
    }
  });

  test('every operationId is unique', () => {
    const spec = buildOpenApiSpec();
    const seen = new Set<string>();
    for (const ops of Object.values(spec.paths as Record<string, Record<string, unknown>>)) {
      for (const op of Object.values(ops)) {
        const id = (op as { operationId?: string }).operationId;
        if (id) {
          expect(seen.has(id)).toBe(false);
          seen.add(id);
        }
      }
    }
    expect(seen.size).toBeGreaterThan(10);
  });
});

describe('Sprint 8 response headers', () => {
  test('error responses carry x-request-id', async () => {
    const app = buildApp(emptyEnv());
    const res = await app.handle(
      new Request('http://localhost/v1/labels', {
        headers: { 'x-request-id': 'rq-test-1' },
      }),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get('x-request-id')).toBe('rq-test-1');
  });
});
