/**
 * Sessions: CRUD + lifecycle (US-021, US-022) and message send (US-023).
 *
 *  - POST   /v1/sessions               create
 *  - GET    /v1/sessions               list
 *  - GET    /v1/sessions/:id           details
 *  - DELETE /v1/sessions/:id           delete (also stops DO)
 *  - POST   /v1/sessions/:id/start     boot engine inside DO
 *  - POST   /v1/sessions/:id/stop      disconnect
 *  - POST   /v1/sessions/:id/logout    log out from WhatsApp
 *  - GET    /v1/sessions/:id/qr        latest QR (when state = qr_required)
 *  - POST   /v1/sessions/:id/messages/text
 *  - POST   /v1/sessions/:id/messages/media
 */

import { sessions } from '@openwa/db/control-plane';
import { getControlPlaneDB } from '@openwa/db/helpers';
import { ERROR_CODES } from '@openwa/shared/errors';
import { SendMediaSchema, SendTextSchema } from '@openwa/validators/message';
import { CreateSessionSchema } from '@openwa/validators/session';
import { and, asc, count, eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import * as v from 'valibot';
import type { ApiEnv } from '../env.js';
import { ApiError, conflict, internal, notFound, validationFailed } from '../errors.js';
import { writeAudit } from '../lib/audit.js';
import { newId } from '../lib/crypto.js';
import { EngineClient } from '../lib/engine-client.js';
import { incrementUsage } from '../lib/usage.js';
import { type AuthContext, authenticate, requireRole } from '../middleware/auth.js';
import { enforceMessageLimit, enforceSessionLimit } from '../middleware/plan-limits.js';

export function sessionRoutes(env: ApiEnv) {
  return new Elysia({ aot: false, prefix: '/v1/sessions' })
    .derive(async ({ request }) => ({ auth: await authenticate(request, env) }))
    .post('/', async ({ body, auth, request }) => {
      requireRole(auth, 'read_write');
      const parsed = v.safeParse(CreateSessionSchema, body);
      if (!parsed.success) throw validationFailed(parsed.issues);
      if (!env.CONTROL_PLANE_DB) throw internal('CONTROL_PLANE_DB missing');
      const db = getControlPlaneDB(env.CONTROL_PLANE_DB);

      const existing = await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.tenantId, auth.tenantId), eq(sessions.name, parsed.output.name)))
        .limit(1);
      if (existing[0])
        throw conflict('Session name already in use', ERROR_CODES.SESSION_NAME_TAKEN);

      // Plan-based concurrent-session limit (US-048).
      const currentCount =
        (
          await db.select({ n: count() }).from(sessions).where(eq(sessions.tenantId, auth.tenantId))
        )[0]?.n ?? 0;
      await enforceSessionLimit({
        env,
        tenantId: auth.tenantId,
        currentCount: Number(currentCount),
      });

      const id = newId();
      const now = new Date();
      await db.insert(sessions).values({
        id,
        tenantId: auth.tenantId,
        name: parsed.output.name,
        status: 'pending',
        proxyUrl: parsed.output.proxyUrl ?? null,
        doInstanceId: id,
        createdAt: now,
        updatedAt: now,
      });

      await writeAudit(db, {
        tenantId: auth.tenantId,
        apiKeyId: auth.keyId,
        action: 'session.create',
        resourceType: 'session',
        resourceId: id,
        ipAddress: clientIp(request),
        userAgent: request.headers.get('user-agent') ?? undefined,
        metadata: { name: parsed.output.name },
      });

      return Response.json(
        { id, name: parsed.output.name, status: 'pending', createdAt: now.toISOString() },
        { status: 201 },
      );
    })
    .get('/', async ({ auth }) => {
      if (!env.CONTROL_PLANE_DB) throw internal('CONTROL_PLANE_DB missing');
      const db = getControlPlaneDB(env.CONTROL_PLANE_DB);
      const rows = await db
        .select()
        .from(sessions)
        .where(eq(sessions.tenantId, auth.tenantId))
        .orderBy(asc(sessions.createdAt));
      return Response.json({ data: rows.map(serializeSession) });
    })
    .get('/:id', async ({ params, auth }) => {
      const row = await loadSession(env, auth, params.id);
      const engine = new EngineClient(env.ENGINE);
      let liveStatus: unknown;
      if (engine.isAvailable()) {
        try {
          liveStatus = await engine.status(row.id);
        } catch {
          // engine call best-effort
        }
      }
      return Response.json({ ...serializeSession(row), engine: liveStatus });
    })
    .delete('/:id', async ({ params, auth, request }) => {
      requireRole(auth, 'read_write');
      const row = await loadSession(env, auth, params.id);
      const engine = new EngineClient(env.ENGINE);
      if (engine.isAvailable()) {
        try {
          await engine.stop(row.id);
        } catch {
          // continue; still delete the registry record
        }
      }
      if (!env.CONTROL_PLANE_DB) throw internal('CONTROL_PLANE_DB missing');
      const db = getControlPlaneDB(env.CONTROL_PLANE_DB);
      await db.delete(sessions).where(eq(sessions.id, row.id));
      await writeAudit(db, {
        tenantId: auth.tenantId,
        apiKeyId: auth.keyId,
        action: 'session.delete',
        resourceType: 'session',
        resourceId: row.id,
        ipAddress: clientIp(request),
        userAgent: request.headers.get('user-agent') ?? undefined,
      });
      return new Response(null, { status: 204 });
    })
    .post('/:id/start', async ({ params, body, auth }) => {
      requireRole(auth, 'read_write');
      const row = await loadSession(env, auth, params.id);
      const engine = requireEngine(env);
      const startBody = (body ?? {}) as { phoneNumber?: string };
      const result = await engine.start(
        row.id,
        startBody.phoneNumber ? { phoneNumber: startBody.phoneNumber } : {},
      );
      await updateSessionStatus(env, row.id, 'connecting');
      return Response.json({ status: 'starting', engine: result });
    })
    .post('/:id/stop', async ({ params, auth }) => {
      requireRole(auth, 'read_write');
      const row = await loadSession(env, auth, params.id);
      const engine = requireEngine(env);
      await engine.stop(row.id);
      await updateSessionStatus(env, row.id, 'disconnected');
      return Response.json({ status: 'stopped' });
    })
    .post('/:id/logout', async ({ params, auth }) => {
      requireRole(auth, 'admin');
      const row = await loadSession(env, auth, params.id);
      const engine = requireEngine(env);
      await engine.logout(row.id);
      await updateSessionStatus(env, row.id, 'logged_out');
      return Response.json({ status: 'logged_out' });
    })
    .get('/:id/qr', async ({ params, auth }) => {
      const row = await loadSession(env, auth, params.id);
      const engine = requireEngine(env);
      const qr = await engine.qr(row.id);
      if (!qr.qr) {
        throw new ApiError({
          status: 409,
          code: ERROR_CODES.SESSION_BAD_STATE,
          message: 'No QR available — session is not waiting to be paired',
        });
      }
      return Response.json(qr);
    })
    .post(
      '/:id/messages/text',
      async ({ params, body, auth }) => {
        requireRole(auth, 'read_write');
        const parsed = v.safeParse(SendTextSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        await enforceMessageLimit({ env, tenantId: auth.tenantId });
        const row = await loadSession(env, auth, params.id);
        const engine = requireEngine(env);
        const result = await engine.sendText(row.id, parsed.output);
        await incrementUsage(env, auth.tenantId, 'messages_sent');
        return Response.json(result, { status: 202 });
      },
      { body: t.Any() },
    )
    .post(
      '/:id/messages/media',
      async ({ params, body, auth }) => {
        requireRole(auth, 'read_write');
        const parsed = v.safeParse(SendMediaSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        await enforceMessageLimit({ env, tenantId: auth.tenantId });
        const row = await loadSession(env, auth, params.id);
        const engine = requireEngine(env);
        const result = await engine.sendMedia(row.id, parsed.output);
        await incrementUsage(env, auth.tenantId, 'messages_sent');
        return Response.json(result, { status: 202 });
      },
      { body: t.Any() },
    );
}

// -------------------- helpers --------------------

async function loadSession(env: ApiEnv, auth: AuthContext, id: string) {
  if (!env.CONTROL_PLANE_DB) throw internal('CONTROL_PLANE_DB missing');
  const db = getControlPlaneDB(env.CONTROL_PLANE_DB);
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.tenantId, auth.tenantId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound('Session not found', ERROR_CODES.SESSION_NOT_FOUND);
  return row;
}

async function updateSessionStatus(
  env: ApiEnv,
  id: string,
  status: typeof sessions.$inferSelect.status,
): Promise<void> {
  if (!env.CONTROL_PLANE_DB) return;
  const db = getControlPlaneDB(env.CONTROL_PLANE_DB);
  await db.update(sessions).set({ status, updatedAt: new Date() }).where(eq(sessions.id, id));
}

function requireEngine(env: ApiEnv): EngineClient {
  const c = new EngineClient(env.ENGINE);
  if (!c.isAvailable()) throw internal('Engine binding not configured');
  return c;
}

function clientIp(req: Request): string | undefined {
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? undefined;
}

function serializeSession(row: typeof sessions.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    status: row.status,
    phoneNumber: row.phoneNumber,
    pushName: row.pushName,
    proxyUrl: row.proxyUrl,
    lastConnectedAt: row.lastConnectedAt?.toISOString() ?? null,
    lastDisconnectedAt: row.lastDisconnectedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
