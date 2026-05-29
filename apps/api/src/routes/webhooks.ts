/**
 * Webhook CRUD (US-030) and test delivery (queues to webhook-consumer).
 *
 *  - POST   /v1/webhooks         create
 *  - GET    /v1/webhooks         list (?sessionId=…)
 *  - GET    /v1/webhooks/:id     details
 *  - PATCH  /v1/webhooks/:id     update
 *  - DELETE /v1/webhooks/:id     delete
 *  - POST   /v1/webhooks/:id/test   queue a synthetic delivery
 */

import { webhooks } from '@openwa/db/control-plane';
import { getControlPlaneDB } from '@openwa/db/helpers';
import { ERROR_CODES } from '@openwa/shared/errors';
import { WebhookConfigSchema } from '@openwa/validators/webhook';
import { and, eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import * as v from 'valibot';
import type { ApiEnv, WebhookQueueMessage } from '../env.js';
import { badRequest, conflict, internal, notFound, validationFailed } from '../errors.js';
import { writeAudit } from '../lib/audit.js';
import { generateWebhookSecret, newId } from '../lib/crypto.js';
import { type AuthContext, authenticate, requireRole } from '../middleware/auth.js';

const UpdateWebhookSchema = v.partial(WebhookConfigSchema);

export function webhookRoutes(env: ApiEnv) {
  return new Elysia({ aot: false, prefix: '/v1/webhooks' })
    .derive(async ({ request }) => ({ auth: await authenticate(request, env) }))
    .post(
      '/',
      async ({ body, auth, request }) => {
        requireRole(auth, 'read_write');
        const parsed = v.safeParse(WebhookConfigSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        assertWebhookUrl(parsed.output.url);
        if (!env.CONTROL_PLANE_DB) throw internal('CONTROL_PLANE_DB missing');
        const db = getControlPlaneDB(env.CONTROL_PLANE_DB);

        const id = newId();
        const secret = parsed.output.secret ?? generateWebhookSecret();
        const now = new Date();
        await db.insert(webhooks).values({
          id,
          tenantId: auth.tenantId,
          sessionId: parsed.output.sessionId ?? null,
          url: parsed.output.url,
          events: parsed.output.events,
          secret,
          active: parsed.output.active ?? true,
          description: parsed.output.description ?? null,
          createdAt: now,
          updatedAt: now,
        });

        await writeAudit(db, {
          tenantId: auth.tenantId,
          apiKeyId: auth.keyId,
          action: 'webhook.create',
          resourceType: 'webhook',
          resourceId: id,
          ipAddress: clientIp(request),
          userAgent: request.headers.get('user-agent') ?? undefined,
          metadata: { url: parsed.output.url, events: parsed.output.events },
        });

        return Response.json(
          {
            id,
            secret,
            url: parsed.output.url,
            events: parsed.output.events,
            active: parsed.output.active ?? true,
          },
          { status: 201 },
        );
      },
      { body: t.Any() },
    )
    .get('/', async ({ query, auth }) => {
      if (!env.CONTROL_PLANE_DB) throw internal('CONTROL_PLANE_DB missing');
      const db = getControlPlaneDB(env.CONTROL_PLANE_DB);
      const sessionFilter = (query as { sessionId?: string }).sessionId;
      const where = sessionFilter
        ? and(eq(webhooks.tenantId, auth.tenantId), eq(webhooks.sessionId, sessionFilter))
        : eq(webhooks.tenantId, auth.tenantId);
      const rows = await db.select().from(webhooks).where(where);
      return Response.json({ data: rows.map(serialize) });
    })
    .get('/:id', async ({ params, auth }) => {
      const row = await load(env, auth, params.id);
      return Response.json(serialize(row));
    })
    .patch(
      '/:id',
      async ({ params, body, auth, request }) => {
        requireRole(auth, 'read_write');
        const row = await load(env, auth, params.id);
        const parsed = v.safeParse(UpdateWebhookSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        if (parsed.output.url) assertWebhookUrl(parsed.output.url);
        if (!env.CONTROL_PLANE_DB) throw internal('CONTROL_PLANE_DB missing');
        const db = getControlPlaneDB(env.CONTROL_PLANE_DB);

        const patch: Partial<typeof webhooks.$inferInsert> = { updatedAt: new Date() };
        if (parsed.output.url !== undefined) patch.url = parsed.output.url;
        if (parsed.output.events !== undefined) patch.events = parsed.output.events;
        if (parsed.output.active !== undefined) patch.active = parsed.output.active;
        if (parsed.output.description !== undefined)
          patch.description = parsed.output.description ?? null;
        if (parsed.output.sessionId !== undefined)
          patch.sessionId = parsed.output.sessionId ?? null;
        if (parsed.output.secret !== undefined) patch.secret = parsed.output.secret;

        await db.update(webhooks).set(patch).where(eq(webhooks.id, row.id));
        await writeAudit(db, {
          tenantId: auth.tenantId,
          apiKeyId: auth.keyId,
          action: 'webhook.update',
          resourceType: 'webhook',
          resourceId: row.id,
          ipAddress: clientIp(request),
          userAgent: request.headers.get('user-agent') ?? undefined,
        });
        return Response.json({ id: row.id, ...patch });
      },
      { body: t.Any() },
    )
    .delete('/:id', async ({ params, auth, request }) => {
      requireRole(auth, 'read_write');
      const row = await load(env, auth, params.id);
      if (!env.CONTROL_PLANE_DB) throw internal('CONTROL_PLANE_DB missing');
      const db = getControlPlaneDB(env.CONTROL_PLANE_DB);
      await db.delete(webhooks).where(eq(webhooks.id, row.id));
      await writeAudit(db, {
        tenantId: auth.tenantId,
        apiKeyId: auth.keyId,
        action: 'webhook.delete',
        resourceType: 'webhook',
        resourceId: row.id,
        ipAddress: clientIp(request),
        userAgent: request.headers.get('user-agent') ?? undefined,
      });
      return new Response(null, { status: 204 });
    })
    .post('/:id/test', async ({ params, auth }) => {
      requireRole(auth, 'read_write');
      const row = await load(env, auth, params.id);
      if (!env.WEBHOOK_QUEUE) throw internal('WEBHOOK_QUEUE binding missing');
      const deliveryId = newId();
      const message: WebhookQueueMessage = {
        webhookId: row.id,
        tenantId: row.tenantId,
        deliveryId,
        event: 'test.ping',
        url: row.url,
        secret: row.secret,
        body: JSON.stringify({
          webhookId: row.id,
          deliveryId,
          event: 'test.ping',
          data: { message: 'OpenWA webhook test event' },
          signedAt: new Date().toISOString(),
        }),
        attempt: 1,
      };
      await env.WEBHOOK_QUEUE.send(message);
      return Response.json({ deliveryId, queued: true }, { status: 202 });
    });
}

// -------------------- helpers --------------------

async function load(env: ApiEnv, auth: AuthContext, id: string) {
  if (!env.CONTROL_PLANE_DB) throw internal('CONTROL_PLANE_DB missing');
  const db = getControlPlaneDB(env.CONTROL_PLANE_DB);
  const rows = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.tenantId, auth.tenantId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound('Webhook not found');
  return row;
}

function assertWebhookUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw badRequest('Invalid webhook URL', { code: ERROR_CODES.WEBHOOK_URL_INVALID });
  }
  if (parsed.protocol !== 'https:') {
    throw conflict('Webhook URL must use https://', ERROR_CODES.WEBHOOK_URL_INVALID);
  }
  const host = parsed.hostname;
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.localhost') ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith('.internal')
  ) {
    throw conflict('Webhook URL host not allowed', ERROR_CODES.WEBHOOK_URL_INVALID);
  }
}

function clientIp(req: Request): string | undefined {
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? undefined;
}

function serialize(row: typeof webhooks.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    sessionId: row.sessionId,
    url: row.url,
    events: row.events,
    active: row.active,
    description: row.description,
    lastDeliveryAt: row.lastDeliveryAt?.toISOString() ?? null,
    lastDeliveryStatus: row.lastDeliveryStatus,
    failureCount: row.failureCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
