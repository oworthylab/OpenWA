/**
 * Tiny dispatcher mapping `(method, path)` → handler. Kept in a
 * separate module so `index.ts` stays focused on lifecycle and
 * `router.ts` can be unit-tested without a live HTTP server.
 *
 * Routes mirror the DO surface so the Cloudflare engine can
 * blindly proxy `/sessions/:id/*` here.
 */

import type { NodeEngine } from '@openwa/engine/node';

export interface SessionEntry {
  engine: NodeEngine;
  lastQrDataUrl: string | null;
  lastQrAt: number;
  unsubscribe: () => void;
}

export interface RouterCtx {
  url: URL;
  method: string;
  readJson: <T = unknown>() => Promise<T>;
  respond: (status: number, body: unknown) => void;
  ensureSession: (id: string) => Promise<SessionEntry>;
  removeSession: (id: string) => Promise<void>;
  sessions: Map<string, SessionEntry>;
}

const SESSION_RE = /^\/sessions\/([A-Za-z0-9_:.-]+)(\/.*)?$/;

export async function router(ctx: RouterCtx): Promise<void> {
  const { url, method, respond } = ctx;

  if (url.pathname === '/sessions' && method === 'GET') {
    const list = Array.from(ctx.sessions.entries()).map(([id, e]) => ({
      id,
      state: e.engine.state,
      hasQr: e.lastQrDataUrl !== null,
    }));
    respond(200, { data: list });
    return;
  }

  const match = SESSION_RE.exec(url.pathname);
  if (!match) {
    respond(404, { error: { code: 'NOT_FOUND', message: `unknown route ${url.pathname}` } });
    return;
  }
  const sessionId = match[1]!;
  const subPath = match[2] ?? '/status';

  // Routes that don't need a live engine.
  if (subPath === '/delete' && method === 'POST') {
    await ctx.removeSession(sessionId);
    respond(200, { ok: true });
    return;
  }

  const entry = await ctx.ensureSession(sessionId);

  switch (`${method} ${subPath}`) {
    case 'POST /start':
    case 'POST /connect': {
      // Fire-and-forget so the caller doesn't hang waiting for QR scan.
      void entry.engine.connect().catch(() => {
        /* errors surface via engine events */
      });
      respond(202, { ok: true, state: entry.engine.state });
      return;
    }

    case 'POST /stop':
    case 'POST /disconnect': {
      await entry.engine.disconnect();
      respond(200, { ok: true, state: entry.engine.state });
      return;
    }

    case 'POST /logout': {
      await entry.engine.logout();
      await ctx.removeSession(sessionId);
      respond(200, { ok: true });
      return;
    }

    case 'GET /status': {
      const auth = await entry.engine.getAuthState();
      respond(200, {
        state: entry.engine.state,
        health: entry.engine.getHealth(),
        auth,
        hasQr: entry.lastQrDataUrl !== null,
      });
      return;
    }

    case 'GET /health': {
      respond(200, { ok: true, ...entry.engine.getHealth() });
      return;
    }

    case 'GET /qr': {
      respond(200, {
        qr: entry.lastQrDataUrl,
        ts: entry.lastQrAt || null,
        state: entry.engine.state,
      });
      return;
    }

    case 'POST /messages/text': {
      const body = await ctx.readJson<{ to: string; text: string }>();
      if (!body.to || !body.text) {
        respond(400, { error: { code: 'BAD_REQUEST', message: 'to and text required' } });
        return;
      }
      const result = await entry.engine.sendText({ to: body.to, text: body.text });
      respond(200, result);
      return;
    }

    case 'POST /messages/media': {
      const body = await ctx.readJson<{
        to: string;
        kind: 'image' | 'video' | 'audio' | 'document' | 'sticker';
        url?: string;
        base64?: string;
        mimeType?: string;
        caption?: string;
        filename?: string;
        ptt?: boolean;
      }>();
      if (!body.to || !body.kind || (!body.url && !body.base64)) {
        respond(400, {
          error: {
            code: 'BAD_REQUEST',
            message: 'to, kind, and one of (url|base64) required',
          },
        });
        return;
      }
      const result = await entry.engine.sendMedia({
        to: body.to,
        kind: body.kind,
        url: body.url,
        base64: body.base64,
        mimeType: body.mimeType,
        caption: body.caption,
        filename: body.filename,
        ptt: body.ptt,
      });
      respond(200, result);
      return;
    }

    default:
      respond(404, {
        error: { code: 'NOT_FOUND', message: `unknown route ${method} ${subPath}` },
      });
  }
}
