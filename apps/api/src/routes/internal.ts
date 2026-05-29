/**
 * Internal HMAC-signed ingress for engine events emitted by the
 * Node-side `@openwa/wa-bridge` sidecar.
 *
 *  POST /v1/internal/engine-events
 *  Headers: x-openwa-bridge-signature: <hex hmac-sha256 of raw body>
 *  Body: { sessionId, event, ts, id }
 *
 * Responsibilities:
 *   1. Verify HMAC signature against `BRIDGE_WEBHOOK_SECRET`.
 *   2. Update `sessions.status` / phoneNumber / pushName on
 *      `auth.ready`, `auth.logged_out`, `connection.state`.
 *   3. Fan-out to every webhook subscribed to the matching event
 *      via `WEBHOOK_QUEUE`.
 *
 * This route is exempt from API-key auth (see middleware/rate-limit.ts
 * `isExemptPath`) — the HMAC is the trust boundary.
 */

import { sessions, webhooks } from '@openwa/db/control-plane';
import { getControlPlaneDB } from '@openwa/db/helpers';
import { and, eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { ApiEnv, WebhookQueueMessage } from '../env.js';
import { internal, unauthorized } from '../errors.js';
import { newId } from '../lib/crypto.js';

interface BridgeEnvelope {
  sessionId: string;
  ts: number;
  id: string;
  event: {
    type: string;
    [key: string]: unknown;
  };
}

/**
 * Maps an engine event type to the public webhook event name that
 * customers subscribe to. Kept in one place so the bridge stays the
 * single source of truth for what's emitted.
 */
const EVENT_MAP: Record<string, string> = {
  'auth.qr': 'session.qr',
  'auth.pairing_code': 'session.pairing_code',
  'auth.ready': 'session.ready',
  'auth.logged_out': 'session.logged_out',
  'connection.state': 'session.state',
  'connection.error': 'session.error',
  'message.received': 'message.received',
  'message.status': 'message.status',
};

async function verifySignature(
  raw: string,
  signatureHex: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHex) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const computed = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(raw)));
  const provided = hexToBytes(signatureHex);
  if (!provided || provided.length !== computed.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed[i]! ^ provided[i]!;
  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

async function updateSessionFromEvent(
  env: ApiEnv,
  sessionId: string,
  event: BridgeEnvelope['event'],
): Promise<void> {
  if (!env.CONTROL_PLANE_DB) return;
  const db = getControlPlaneDB(env.CONTROL_PLANE_DB);
  const now = new Date();

  if (event.type === 'auth.ready') {
    const user = (event as { user?: { id?: string; pushName?: string } }).user;
    await db
      .update(sessions)
      .set({
        status: 'connected',
        phoneNumber: user?.id?.split('@')[0] ?? undefined,
        pushName: user?.pushName,
        lastConnectedAt: now,
        updatedAt: now,
      })
      .where(eq(sessions.id, sessionId));
    return;
  }

  if (event.type === 'auth.logged_out') {
    await db
      .update(sessions)
      .set({
        status: 'logged_out',
        lastDisconnectedAt: now,
        updatedAt: now,
      })
      .where(eq(sessions.id, sessionId));
    return;
  }

  if (event.type === 'auth.qr') {
    await db
      .update(sessions)
      .set({ status: 'qr_required', updatedAt: now })
      .where(eq(sessions.id, sessionId));
    return;
  }

  if (event.type === 'connection.state') {
    const state = (event as { state?: string }).state;
    const mapped =
      state === 'open'
        ? 'connected'
        : state === 'connecting'
          ? 'connecting'
          : state === 'closing' || state === 'closed'
            ? 'disconnected'
            : undefined;
    if (mapped) {
      await db
        .update(sessions)
        .set({
          status: mapped,
          ...(mapped === 'disconnected' ? { lastDisconnectedAt: now } : {}),
          updatedAt: now,
        })
        .where(eq(sessions.id, sessionId));
    }
  }
}

async function fanoutWebhooks(
  env: ApiEnv,
  sessionId: string,
  publicEventName: string,
  envelope: BridgeEnvelope,
): Promise<number> {
  if (!env.CONTROL_PLANE_DB || !env.WEBHOOK_QUEUE) return 0;
  const db = getControlPlaneDB(env.CONTROL_PLANE_DB);
  const session = await db
    .select({ tenantId: sessions.tenantId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const tenantId = session[0]?.tenantId;
  if (!tenantId) return 0;

  const subs = await db
    .select({
      id: webhooks.id,
      url: webhooks.url,
      secret: webhooks.secret,
      events: webhooks.events,
      enabled: webhooks.active,
      sessionId: webhooks.sessionId,
    })
    .from(webhooks)
    .where(and(eq(webhooks.tenantId, tenantId), eq(webhooks.active, true)));

  let queued = 0;
  for (const sub of subs) {
    if (sub.sessionId && sub.sessionId !== sessionId) continue;
    const events = Array.isArray(sub.events) ? sub.events : [];
    const matches =
      events.includes('*') ||
      events.includes(publicEventName) ||
      events.includes(publicEventName.split('.')[0] + '.*');
    if (!matches) continue;
    const deliveryId = newId();
    const message: WebhookQueueMessage = {
      webhookId: sub.id,
      tenantId,
      deliveryId,
      event: publicEventName,
      url: sub.url,
      secret: sub.secret,
      body: JSON.stringify({
        webhookId: sub.id,
        deliveryId,
        event: publicEventName,
        sessionId,
        data: envelope.event,
        signedAt: new Date(envelope.ts).toISOString(),
      }),
      attempt: 1,
    };
    await env.WEBHOOK_QUEUE.send(message);
    queued++;
  }
  return queued;
}

export function internalRoutes(env: ApiEnv) {
  return new Elysia({ prefix: '/v1/internal' }).post(
    '/engine-events',
    async ({ request }) => {
      const secret = env.BRIDGE_WEBHOOK_SECRET;
      if (!secret) throw internal('BRIDGE_WEBHOOK_SECRET not configured');
      const raw = await request.text();
      const sig = request.headers.get('x-openwa-bridge-signature');
      const ok = await verifySignature(raw, sig, secret);
      if (!ok) throw unauthorized('Invalid bridge signature', 'INVALID_SIGNATURE');

      let envelope: BridgeEnvelope;
      try {
        envelope = JSON.parse(raw) as BridgeEnvelope;
      } catch {
        throw unauthorized('Malformed envelope', 'BAD_REQUEST');
      }
      if (!envelope.sessionId || !envelope.event?.type) {
        throw unauthorized('Missing fields', 'BAD_REQUEST');
      }

      await updateSessionFromEvent(env, envelope.sessionId, envelope.event);

      const publicName = EVENT_MAP[envelope.event.type];
      const queued = publicName
        ? await fanoutWebhooks(env, envelope.sessionId, publicName, envelope)
        : 0;

      return { ok: true, queued, mapped: publicName ?? null };
    },
    {
      // Elysia would otherwise parse JSON and double-consume the body.
      parse: 'none',
    },
  );
}
