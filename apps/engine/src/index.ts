/**
 * OpenWA Engine Worker — Durable Object host for WhatsApp sessions.
 *
 * Sprint 2: the {@link WhatsAppSessionDO} DO from `@openwa/engine/cloudflare`
 * is exported and routed via this Worker. The Worker translates
 * `/sessions/:id/*` HTTP calls into DO RPC calls.
 *
 * Bridge mode (this sprint): when `env.BRIDGE_URL` is set, the Worker
 * transparently proxies `/sessions/:id/*` to a Node sidecar running
 * `@openwa/wa-bridge`. The sidecar hosts Baileys (which can't run inside
 * Workers because of native `ws` and filesystem deps) and gives us real
 * WhatsApp connectivity today. When the Workers-native protocol lands,
 * unset `BRIDGE_URL` to fall back to the DO.
 */

import { WhatsAppSessionDO } from '@openwa/engine/cloudflare';

export { WhatsAppSessionDO };

export interface Env {
  SESSION_HOST: DurableObjectNamespace;
  /** Optional Node sidecar URL (e.g. https://wa-bridge.fly.dev). */
  BRIDGE_URL?: string;
  /** Bearer token shared with the bridge. */
  BRIDGE_TOKEN?: string;
}

const ROUTE = /^\/sessions\/([A-Za-z0-9_:.-]+)(\/.*)?$/;

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({
        ok: true,
        service: 'engine-worker',
        bridge: env.BRIDGE_URL ? 'configured' : 'absent',
      });
    }

    const match = ROUTE.exec(url.pathname);
    if (!match) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: `Unknown route: ${url.pathname}` } },
        { status: 404 },
      );
    }

    const sessionId = match[1];
    const subPath = match[2] ?? '/status';
    if (!sessionId) {
      return Response.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing sessionId' } },
        { status: 400 },
      );
    }

    // Bridge mode — proxy directly to the Node sidecar.
    if (env.BRIDGE_URL) {
      if (!env.BRIDGE_TOKEN) {
        return Response.json(
          {
            error: {
              code: 'BRIDGE_MISCONFIGURED',
              message: 'BRIDGE_URL set without BRIDGE_TOKEN',
            },
          },
          { status: 500 },
        );
      }
      const target = new URL(
        `/sessions/${encodeURIComponent(sessionId)}${subPath}`,
        env.BRIDGE_URL,
      );
      // Forward query params (search) from the original request.
      target.search = url.search;
      const proxied = new Request(target, {
        method: request.method,
        headers: new Headers({
          ...Object.fromEntries(request.headers),
          authorization: `Bearer ${env.BRIDGE_TOKEN}`,
        }),
        body:
          request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      });
      return fetch(proxied);
    }

    // Fallback — talk to the DO (Workers-native protocol path).
    const stub = env.SESSION_HOST.get(env.SESSION_HOST.idFromName(sessionId));
    const doUrl = new URL(subPath, 'https://do.internal');
    return stub.fetch(new Request(doUrl, request));
  },
};
