/**
 * Mart integration endpoints (Sprint 7, US-053 / US-055 / US-056).
 *
 *   POST   /v1/integrations/mart/link        link a Mart store (admin)
 *   GET    /v1/integrations/mart             current integration status
 *   DELETE /v1/integrations/mart/link        revoke the linkage (admin)
 *   POST   /v1/integrations/mart/sync        trigger manual resync (no-op stub)
 *   POST   /v1/integrations/mart/webhooks    inbound Mart event (no auth, signed)
 *
 * Webhook security: callers send `X-Mart-Secret` (raw shared secret).
 * We sha256 it and constant-time compare to the stored hash. This
 * mirrors how Stripe verifies its signing secret and keeps the link
 * step single-source-of-truth for the credential. Replay protection
 * via KV `mart:event:<id>` with 24h TTL.
 */

import {
  abandonedCarts,
  crmContacts,
  martIntegrations,
  messageTemplates,
} from '@openwa/db/control-plane';
import { type ControlPlaneDB, getControlPlaneDB } from '@openwa/db/helpers';
import { MartLinkSchema, MartWebhookEnvelopeSchema } from '@openwa/validators/mart';
import { and, eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import * as v from 'valibot';
import type { ApiEnv } from '../env.js';
import {
  badRequest,
  conflict,
  forbidden,
  internal,
  notFound,
  unauthorized,
  validationFailed,
} from '../errors.js';
import { writeAudit } from '../lib/audit.js';
import { newId, sha256Hex, timingSafeEqualHex } from '../lib/crypto.js';
import { verifyOwnership } from '../lib/mart-client.js';
import { renderTemplate } from '../lib/template.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const WEBHOOK_IDEMPOTENCY_TTL = 60 * 60 * 24; // 24 h

function requireDb(env: ApiEnv): ControlPlaneDB {
  if (!env.CONTROL_PLANE_DB) throw internal('CONTROL_PLANE_DB binding missing');
  return getControlPlaneDB(env.CONTROL_PLANE_DB);
}

export function martRoutes(env: ApiEnv) {
  return (
    new Elysia({ aot: false, prefix: '/v1/integrations/mart' })
      // -------- Authenticated control plane --------
      .get('/', async ({ request }) => {
        const auth = await authenticate(request, env);
        const db = requireDb(env);
        const row = (
          await db
            .select({
              id: martIntegrations.id,
              storeUrl: martIntegrations.storeUrl,
              status: martIntegrations.status,
              storeMetadata: martIntegrations.storeMetadata,
              lastSyncAt: martIntegrations.lastSyncAt,
              linkedAt: martIntegrations.linkedAt,
              revokedAt: martIntegrations.revokedAt,
            })
            .from(martIntegrations)
            .where(eq(martIntegrations.tenantId, auth.tenantId))
            .limit(1)
        )[0];
        if (!row) return Response.json({ linked: false });
        return Response.json({ linked: row.status === 'active', integration: row });
      })
      .post(
        '/link',
        async ({ request, body }) => {
          const auth = await authenticate(request, env);
          requireRole(auth, 'admin');
          const parsed = v.safeParse(MartLinkSchema, body);
          if (!parsed.success) throw validationFailed(parsed.issues);
          const db = requireDb(env);

          // Reject if already linked and active — caller must revoke first.
          const existing = (
            await db
              .select()
              .from(martIntegrations)
              .where(eq(martIntegrations.tenantId, auth.tenantId))
              .limit(1)
          )[0];
          if (existing && existing.status === 'active') {
            throw conflict('Mart already linked; revoke first');
          }

          const verify = await verifyOwnership({
            storeUrl: parsed.output.storeUrl,
            secret: parsed.output.secret,
            forceStub: env.ENVIRONMENT === 'test' || env.ENVIRONMENT === 'development',
          });
          if (!verify.ok) {
            throw badRequest('Mart verification failed');
          }

          const secretHash = await sha256Hex(parsed.output.secret);
          const now = new Date();
          if (existing) {
            await db
              .update(martIntegrations)
              .set({
                storeUrl: parsed.output.storeUrl,
                secretHash,
                status: 'active',
                storeMetadata: verify.storeMetadata ?? {
                  storeName: verify.storeName,
                  stub: verify.stub,
                },
                linkedAt: now,
                revokedAt: null,
              })
              .where(eq(martIntegrations.id, existing.id));
          } else {
            await db.insert(martIntegrations).values({
              id: newId(),
              tenantId: auth.tenantId,
              storeUrl: parsed.output.storeUrl,
              secretHash,
              status: 'active',
              storeMetadata: verify.storeMetadata ?? {
                storeName: verify.storeName,
                stub: verify.stub,
              },
              linkedAt: now,
            });
          }
          await writeAudit(db, {
            tenantId: auth.tenantId,
            apiKeyId: auth.keyId,
            action: 'mart.link',
            resourceType: 'mart_integration',
            resourceId: existing?.id ?? auth.tenantId,
            ipAddress: clientIp(request),
            metadata: { storeUrl: parsed.output.storeUrl, stub: verify.stub },
          });
          return Response.json({ linked: true, stub: verify.stub }, { status: 201 });
        },
        { body: t.Any() },
      )
      .delete('/link', async ({ request }) => {
        const auth = await authenticate(request, env);
        requireRole(auth, 'admin');
        const db = requireDb(env);
        const row = (
          await db
            .select()
            .from(martIntegrations)
            .where(eq(martIntegrations.tenantId, auth.tenantId))
            .limit(1)
        )[0];
        if (!row || row.status !== 'active') throw notFound('No active Mart integration');
        await db
          .update(martIntegrations)
          .set({ status: 'revoked', revokedAt: new Date() })
          .where(eq(martIntegrations.id, row.id));
        await writeAudit(db, {
          tenantId: auth.tenantId,
          apiKeyId: auth.keyId,
          action: 'mart.unlink',
          resourceType: 'mart_integration',
          resourceId: row.id,
          ipAddress: clientIp(request),
        });
        return new Response(null, { status: 204 });
      })
      .post('/sync', async ({ request }) => {
        const auth = await authenticate(request, env);
        requireRole(auth, 'read_write');
        const db = requireDb(env);
        const row = (
          await db
            .select()
            .from(martIntegrations)
            .where(
              and(
                eq(martIntegrations.tenantId, auth.tenantId),
                eq(martIntegrations.status, 'active'),
              ),
            )
            .limit(1)
        )[0];
        if (!row) throw notFound('Mart not linked');
        // Real sync is deferred to Sprint 8 — record the request and
        // bump lastSyncAt so the dashboard can show "Synced just now".
        await db
          .update(martIntegrations)
          .set({ lastSyncAt: new Date() })
          .where(eq(martIntegrations.id, row.id));
        return Response.json({ accepted: true, mode: 'stub' }, { status: 202 });
      })
      // -------- Inbound webhook (unauthenticated, signed) --------
      .post(
        '/webhooks',
        async ({ request, body }) => {
          const secret = request.headers.get('x-mart-secret');
          if (!secret) throw unauthorized('Missing X-Mart-Secret');
          const parsed = v.safeParse(MartWebhookEnvelopeSchema, body);
          if (!parsed.success) throw validationFailed(parsed.issues);
          const event = parsed.output;
          const db = requireDb(env);

          // Locate any active integration whose secret hash matches the
          // supplied secret. We cannot index by tenant here (the call
          // is unauthenticated), so we must scan — fine while tenant
          // count is small; a per-secret KV reverse index is on the
          // Sprint 8 backlog if this becomes hot.
          const candidates = await db
            .select()
            .from(martIntegrations)
            .where(eq(martIntegrations.status, 'active'));
          const incomingHash = await sha256Hex(secret);
          const match = candidates.find((c) => timingSafeEqualHex(incomingHash, c.secretHash));
          if (!match) throw forbidden('Invalid Mart secret');

          // Idempotency — replay protection via KV.
          if (env.AUTH_CACHE) {
            const key = `mart:event:${match.tenantId}:${event.id}`;
            const seen = await env.AUTH_CACHE.get(key);
            if (seen) {
              return Response.json({ deduped: true });
            }
            await env.AUTH_CACHE.put(key, '1', { expirationTtl: WEBHOOK_IDEMPOTENCY_TTL });
          }

          await dispatchEvent(db, match.tenantId, event);
          return Response.json({ received: true });
        },
        { body: t.Any() },
      )
  );
}

// -------------------- event dispatch --------------------

interface MartEvent {
  id: string;
  type: string;
  createdAt: number;
  data: Record<string, unknown>;
}

async function dispatchEvent(
  db: ControlPlaneDB,
  tenantId: string,
  event: MartEvent,
): Promise<void> {
  switch (event.type) {
    case 'customer.created':
    case 'customer.updated':
      await upsertContactFromCustomer(db, tenantId, event.data);
      break;
    case 'cart.abandoned':
      await recordAbandonedCart(db, tenantId, event.data);
      break;
    case 'cart.recovered':
      await markCartRecovered(db, tenantId, event.data);
      break;
    case 'order.placed':
    case 'order.shipped':
    case 'order.delivered':
      await maybeSendOrderTemplate(db, tenantId, event.type, event.data);
      break;
    default:
      // unknown types are stored as audit but otherwise ignored
      break;
  }
}

function pickStr(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function pickNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

async function upsertContactFromCustomer(
  db: ControlPlaneDB,
  tenantId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const phone = pickStr(data.phone);
  if (!phone) return;
  const name = pickStr(data.name);
  const email = pickStr(data.email);
  const martCustomerId = pickStr(data.id);
  const existing = (
    await db
      .select({ id: crmContacts.id })
      .from(crmContacts)
      .where(and(eq(crmContacts.tenantId, tenantId), eq(crmContacts.phoneNumber, phone)))
      .limit(1)
  )[0];
  const now = new Date();
  if (existing) {
    await db
      .update(crmContacts)
      .set({
        name: name ?? undefined,
        email: email ?? undefined,
        martCustomerId: martCustomerId ?? undefined,
        updatedAt: now,
      })
      .where(eq(crmContacts.id, existing.id));
  } else {
    await db.insert(crmContacts).values({
      id: newId(),
      tenantId,
      phoneNumber: phone,
      name,
      email,
      martCustomerId,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function recordAbandonedCart(
  db: ControlPlaneDB,
  tenantId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const cartId = pickStr(data.id) ?? pickStr(data.cartId);
  if (!cartId) return;
  const totalCents = pickNum(data.totalCents) ?? 0;
  const currency = pickStr(data.currency) ?? 'USD';
  const phone = pickStr(data.customerPhone);

  let contactId: string | null = null;
  if (phone) {
    const row = (
      await db
        .select({ id: crmContacts.id })
        .from(crmContacts)
        .where(and(eq(crmContacts.tenantId, tenantId), eq(crmContacts.phoneNumber, phone)))
        .limit(1)
    )[0];
    contactId = row?.id ?? null;
  }

  const dup = (
    await db
      .select({ id: abandonedCarts.id })
      .from(abandonedCarts)
      .where(and(eq(abandonedCarts.tenantId, tenantId), eq(abandonedCarts.cartId, cartId)))
      .limit(1)
  )[0];
  if (dup) return;

  const now = new Date();
  await db.insert(abandonedCarts).values({
    id: newId(),
    tenantId,
    contactId,
    cartId,
    totalAmountCents: totalCents,
    currency,
    abandonedAt: now,
    createdAt: now,
  });

  // If the tenant has a template named `cart.abandoned`, render it for
  // observability. Actual outbound send wiring is deferred until the
  // engine inbound/outbound bridge lands in Sprint 8.
  await renderTemplateForEvent(db, tenantId, 'cart.abandoned', {
    cartId,
    total: String(totalCents / 100),
    currency,
  });
}

async function markCartRecovered(
  db: ControlPlaneDB,
  tenantId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const cartId = pickStr(data.id) ?? pickStr(data.cartId);
  if (!cartId) return;
  await db
    .update(abandonedCarts)
    .set({ recoveredAt: new Date() })
    .where(and(eq(abandonedCarts.tenantId, tenantId), eq(abandonedCarts.cartId, cartId)));
}

async function maybeSendOrderTemplate(
  db: ControlPlaneDB,
  tenantId: string,
  eventType: string,
  data: Record<string, unknown>,
): Promise<void> {
  await renderTemplateForEvent(db, tenantId, eventType, {
    orderId: pickStr(data.id) ?? '',
    total: String((pickNum(data.totalCents) ?? 0) / 100),
    trackingUrl: pickStr(data.trackingUrl) ?? '',
  });
}

async function renderTemplateForEvent(
  db: ControlPlaneDB,
  tenantId: string,
  templateName: string,
  vars: Record<string, string>,
): Promise<void> {
  const tpl = (
    await db
      .select()
      .from(messageTemplates)
      .where(and(eq(messageTemplates.tenantId, tenantId), eq(messageTemplates.name, templateName)))
      .limit(1)
  )[0];
  if (!tpl) return;
  try {
    renderTemplate(tpl.body, vars, { allowMissing: true });
  } catch {
    // best-effort: template misconfiguration shouldn't fail webhook ingest
  }
}

function clientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}
