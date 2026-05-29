/**
 * Health endpoints (US-032). All public — no auth required.
 *
 *  - GET /health        — minimal liveness + version
 *  - GET /health/live   — alias of /health, returns 200 always
 *  - GET /health/ready  — checks D1 + KV bindings, returns 503 if unhealthy
 */

import { Elysia } from 'elysia';
import type { ApiEnv } from '../env.js';

const VERSION = '0.0.1';
const SERVICE = 'openwa-api';

export function healthRoutes(env: ApiEnv) {
  return new Elysia({ aot: false })
    .get('/health', () => baseHealth())
    .get('/health/live', () => baseHealth())
    .get('/health/ready', async () => {
      const checks: Record<string, { ok: boolean; error?: string }> = {};
      const cpDb = env.CONTROL_PLANE_DB;
      if (cpDb) {
        checks.controlPlaneDb = await ping(() => cpDb.prepare('SELECT 1').first());
      } else {
        checks.controlPlaneDb = { ok: false, error: 'binding missing' };
      }
      const kv = env.AUTH_CACHE;
      if (kv) {
        checks.authCache = await ping(() => kv.get('__healthcheck__'));
      } else {
        checks.authCache = { ok: false, error: 'binding missing' };
      }
      checks.engine = {
        ok: Boolean(env.ENGINE),
        error: env.ENGINE ? undefined : 'binding missing',
      };
      checks.webhookQueue = {
        ok: Boolean(env.WEBHOOK_QUEUE),
        error: env.WEBHOOK_QUEUE ? undefined : 'binding missing',
      };

      const required = ['controlPlaneDb', 'authCache'] as const;
      const ready = required.every((k) => checks[k]?.ok);
      return Response.json(
        { status: ready ? 'ready' : 'degraded', service: SERVICE, version: VERSION, checks },
        { status: ready ? 200 : 503 },
      );
    });
}

function baseHealth() {
  return Response.json({
    status: 'ok',
    service: SERVICE,
    version: VERSION,
    timestamp: new Date().toISOString(),
  });
}

async function ping(fn: () => Promise<unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
