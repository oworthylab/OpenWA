/**
 * Public API documentation (Sprint 8, US-062).
 *
 *   GET /docs              — Scalar HTML viewer (no auth)
 *   GET /docs/openapi.json — OpenAPI 3.0 spec (no auth)
 *
 * Both endpoints are intentionally unauthenticated so partners can
 * load the docs into their tooling without provisioning a key first.
 */

import { Elysia } from 'elysia';
import type { ApiEnv } from '../env.js';
import { buildDocsHtml, buildOpenApiSpec } from '../lib/openapi.js';

export function docsRoutes(env: ApiEnv) {
  const release = env.SENTRY_RELEASE ?? '1.0.0';
  return new Elysia({ aot: false, prefix: '/docs' })
    .get('/openapi.json', () => {
      const spec = buildOpenApiSpec({ version: release });
      return Response.json(spec);
    })
    .get('/', () => {
      return new Response(buildDocsHtml('/docs/openapi.json'), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    });
}
