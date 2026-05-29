/**
 * `@openwa/wa-bridge` — Node sidecar that hosts Baileys WhatsApp
 * sessions and exposes a tiny HTTP API the Cloudflare engine
 * Durable Object proxies to.
 *
 * Why this exists: Baileys depends on `ws`, `node:crypto`, native
 * Curve25519 bindings, and a writable filesystem (auth state). None
 * of that runs in the Workers runtime. Implementing the WhatsApp
 * Web protocol natively for Workers is a multi-month project
 * (see {@link ../../docs/TECHNICAL-DISCOVERY.md TECHNICAL-DISCOVERY.md},
 * section 2 "WhatsApp Protocol Engineer"). Until that lands, the
 * pragmatic path is to run Baileys in a small Node process and
 * proxy from the DO.
 *
 * The bridge:
 *  - Maintains a `Map<sessionId, NodeEngine>` of live engines.
 *  - Persists auth state to `AUTH_DIR/<sessionId>` (Baileys
 *    `useMultiFileAuthState`).
 *  - Speaks an internal HTTP API mirroring the DO surface
 *    (`/sessions/:id/start`, `/qr`, `/messages/text`, …).
 *  - POSTs every engine event to `WEBHOOK_URL` (the API worker's
 *    `/v1/internal/engine-events` endpoint) with an HMAC signature.
 *
 * Auth: every request must carry `Authorization: Bearer $BRIDGE_TOKEN`.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { qrToDataUrl } from '@openwa/engine';
import { NodeEngine } from '@openwa/engine/node';
import type { EngineEvent } from '@openwa/engine/events';
import { pino } from 'pino';

import { router } from './router.js';
import { config } from './config.js';

const log = pino({ level: config.logLevel, name: 'wa-bridge' });

interface SessionEntry {
  engine: NodeEngine;
  lastQrDataUrl: string | null;
  lastQrAt: number;
  unsubscribe: () => void;
}

const sessions = new Map<string, SessionEntry>();

async function ensureSession(sessionId: string): Promise<SessionEntry> {
  const existing = sessions.get(sessionId);
  if (existing) return existing;

  const authDir = join(config.authDir, sanitizeId(sessionId));
  await mkdir(authDir, { recursive: true });

  const engine = new NodeEngine({
    authDir,
    config: {
      sessionId,
      auth: { type: 'qr' },
      logLevel: config.logLevel,
    },
  });

  const entry: SessionEntry = {
    engine,
    lastQrDataUrl: null,
    lastQrAt: 0,
    unsubscribe: () => {},
  };

  entry.unsubscribe = engine.onAny(async (event) => {
    try {
      if (event.type === 'auth.qr') {
        entry.lastQrDataUrl = await qrToDataUrl(event.qr);
        entry.lastQrAt = Date.now();
      } else if (event.type === 'auth.ready' || event.type === 'auth.logged_out') {
        entry.lastQrDataUrl = null;
      }
      await dispatchEvent(sessionId, event);
    } catch (err) {
      log.error({ err, sessionId, type: event.type }, 'event dispatch failed');
    }
  });

  sessions.set(sessionId, entry);
  return entry;
}

async function dispatchEvent(sessionId: string, event: EngineEvent): Promise<void> {
  if (!config.webhookUrl) return;
  const body = JSON.stringify({ sessionId, event, ts: Date.now(), id: randomUUID() });
  const signature = createHmac('sha256', config.webhookSecret).update(body).digest('hex');
  try {
    const res = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-openwa-bridge-signature': signature,
      },
      body,
    });
    if (!res.ok) {
      log.warn(
        { sessionId, type: event.type, status: res.status },
        'webhook responded non-200',
      );
    }
  } catch (err) {
    log.warn({ err, sessionId, type: event.type }, 'webhook delivery failed');
  }
}

function sanitizeId(id: string): string {
  // sessionIds are UUIDs in production but defend against directory traversal.
  return id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
}

function checkAuth(req: IncomingMessage): boolean {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return false;
  const provided = Buffer.from(header.slice(7));
  const expected = Buffer.from(config.bridgeToken);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {} as T;
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {} as T;
  return JSON.parse(raw) as T;
}

function respond(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  // Public health check (no auth) so orchestrators can probe liveness.
  if (url.pathname === '/health' && req.method === 'GET') {
    respond(res, 200, {
      ok: true,
      service: 'wa-bridge',
      sessions: sessions.size,
      uptime: process.uptime(),
    });
    return;
  }

  if (!checkAuth(req)) {
    respond(res, 401, { error: { code: 'UNAUTHORIZED', message: 'bad bridge token' } });
    return;
  }

  try {
    await router({
      url,
      method: req.method ?? 'GET',
      readJson: () => readJson(req),
      respond: (status, body) => respond(res, status, body),
      ensureSession,
      sessions,
      removeSession: async (id) => {
        const entry = sessions.get(id);
        if (!entry) return;
        entry.unsubscribe();
        try {
          await entry.engine.disconnect();
        } catch {
          /* ignore */
        }
        sessions.delete(id);
      },
    });
  } catch (err) {
    log.error({ err, url: url.pathname }, 'request failed');
    const message = err instanceof Error ? err.message : String(err);
    respond(res, 500, { error: { code: 'INTERNAL_ERROR', message } });
  }
});

server.listen(config.port, config.host, () => {
  log.info(
    { host: config.host, port: config.port, authDir: config.authDir },
    'wa-bridge listening',
  );
  if (config.generated.bridgeToken || config.generated.webhookSecret) {
    // First run — print copy/paste-ready secrets so the operator can wire
    // up the Cloudflare workers without hunting through files.
    const lines = [
      '',
      '────────────────────────────────────────────────────────────────',
      '  wa-bridge first run — generated credentials (saved to disk):',
      '',
      `  BRIDGE_TOKEN          = ${config.bridgeToken}`,
      `  BRIDGE_WEBHOOK_SECRET = ${config.webhookSecret}`,
      '',
      '  Wire these into Cloudflare:',
      '    cd apps/engine && wrangler secret put BRIDGE_TOKEN --env self-host',
      '    cd apps/engine && wrangler secret put BRIDGE_URL   --env self-host',
      '    cd apps/api    && wrangler secret put BRIDGE_WEBHOOK_SECRET --env self-host',
      '',
      `  Stored at: ${config.authDir}/.bridge-config.json`,
      '────────────────────────────────────────────────────────────────',
      '',
    ];
    console.log(lines.join('\n'));
  }
});

const shutdown = async (signal: string) => {
  log.info({ signal }, 'shutting down');
  for (const [id, entry] of sessions) {
    entry.unsubscribe();
    try {
      await entry.engine.disconnect();
    } catch (err) {
      log.warn({ err, id }, 'disconnect on shutdown failed');
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
