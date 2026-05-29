/**
 * OpenWA Engine Worker — Durable Object host for WhatsApp sessions.
 *
 * Sprint 2: the {@link WhatsAppSessionDO} DO from `@openwa/engine/cloudflare`
 * is exported and routed via this Worker. The Worker translates
 * `/sessions/:id/*` HTTP calls into DO RPC calls.
 *
 * Sprint 2b/3: full WhatsApp connection inside the DO (currently the DO holds
 * state and exposes lifecycle endpoints; protocol I/O wiring lands next).
 */

import { WhatsAppSessionDO } from '@openwa/engine/cloudflare';

export { WhatsAppSessionDO };

export interface Env {
  SESSION_HOST: DurableObjectNamespace;
}

const ROUTE = /^\/sessions\/([A-Za-z0-9_:.-]+)(\/.*)?$/;

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'engine-worker' });
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
    const stub = env.SESSION_HOST.get(env.SESSION_HOST.idFromName(sessionId));
    const doUrl = new URL(subPath, 'https://do.internal');
    return stub.fetch(new Request(doUrl, request));
  },
};
