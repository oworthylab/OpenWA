/**
 * WhatsApp Status / Stories (Sprint 8, US-060).
 *
 *   GET    /v1/status                list (paginated, ?sessionId)
 *   POST   /v1/status/text           post text status
 *   POST   /v1/status/media          post image/video status (URL or R2 key)
 *   GET    /v1/status/:id            detail
 *   DELETE /v1/status/:id            delete (soft)
 *   GET    /v1/status/:id/views      list viewers
 *   POST   /v1/status/:id/views      record a view
 *
 * Posting to the actual WhatsApp socket is the engine's job; this layer
 * just persists the intent and exposes view tracking.
 */

import { statusViews, statuses } from '@openwa/db/control-plane';
import { type ControlPlaneDB, getControlPlaneDB } from '@openwa/db/helpers';
import { ERROR_CODES } from '@openwa/shared/errors';
import {
  StatusMediaCreateSchema,
  StatusQuerySchema,
  StatusTextCreateSchema,
  StatusViewSchema,
} from '@openwa/validators/statuses';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import * as v from 'valibot';
import type { ApiEnv } from '../env.js';
import { badRequest, internal, notFound, validationFailed } from '../errors.js';
import { newId } from '../lib/crypto.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const STATUS_TTL_HOURS = 24;

function requireDb(env: ApiEnv): ControlPlaneDB {
  if (!env.CONTROL_PLANE_DB) throw internal('CONTROL_PLANE_DB binding missing');
  return getControlPlaneDB(env.CONTROL_PLANE_DB);
}

async function loadStatus(db: ControlPlaneDB, tenantId: string, id: string) {
  const row = await db
    .select()
    .from(statuses)
    .where(and(eq(statuses.tenantId, tenantId), eq(statuses.id, id)))
    .limit(1);
  if (!row[0] || row[0].deletedAt) {
    throw notFound('Status not found', ERROR_CODES.STATUS_NOT_FOUND);
  }
  return row[0];
}

function normalizeQuery(q: Record<string, string | undefined>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined) continue;
    if (k === 'page' || k === 'pageSize') {
      const n = Number(v);
      if (!Number.isNaN(n)) out[k] = n;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function statusRoutes(env: ApiEnv) {
  return new Elysia({ aot: false, prefix: '/v1/status' })
    .derive(async ({ request }) => ({ auth: await authenticate(request, env) }))
    .get('/', async ({ auth, query }) => {
      const parsed = v.safeParse(StatusQuerySchema, normalizeQuery(query));
      if (!parsed.success) throw validationFailed(parsed.issues);
      const db = requireDb(env);
      const { page, pageSize, sessionId } = parsed.output;
      const filters = [eq(statuses.tenantId, auth.tenantId), isNull(statuses.deletedAt)];
      if (sessionId) filters.push(eq(statuses.sessionId, sessionId));
      const rows = await db
        .select()
        .from(statuses)
        .where(and(...filters))
        .orderBy(desc(statuses.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      return Response.json({ data: rows, pagination: { page, pageSize } });
    })
    .post(
      '/text',
      async ({ auth, body }) => {
        requireRole(auth, 'read_write');
        const parsed = v.safeParse(StatusTextCreateSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        const db = requireDb(env);
        const id = newId();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + STATUS_TTL_HOURS * 60 * 60 * 1000);
        await db.insert(statuses).values({
          id,
          tenantId: auth.tenantId,
          sessionId: parsed.output.sessionId,
          kind: 'text',
          text: parsed.output.text,
          backgroundColor: parsed.output.backgroundColor ?? '#075E54',
          font: parsed.output.font ?? 'sans',
          viewCount: 0,
          expiresAt,
          createdAt: now,
        });
        return Response.json({ id, expiresAt }, { status: 201 });
      },
      { body: t.Any() },
    )
    .post(
      '/media',
      async ({ auth, body }) => {
        requireRole(auth, 'read_write');
        const parsed = v.safeParse(StatusMediaCreateSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        if (!parsed.output.mediaUrl && !parsed.output.mediaKey) {
          throw badRequest('Either mediaUrl or mediaKey is required');
        }
        const db = requireDb(env);
        const id = newId();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + STATUS_TTL_HOURS * 60 * 60 * 1000);
        await db.insert(statuses).values({
          id,
          tenantId: auth.tenantId,
          sessionId: parsed.output.sessionId,
          kind: parsed.output.kind,
          text: parsed.output.caption ?? null,
          mediaKey: parsed.output.mediaKey ?? parsed.output.mediaUrl ?? null,
          viewCount: 0,
          expiresAt,
          createdAt: now,
        });
        return Response.json({ id, expiresAt }, { status: 201 });
      },
      { body: t.Any() },
    )
    .get('/:id', async ({ auth, params }) => {
      const db = requireDb(env);
      const row = await loadStatus(db, auth.tenantId, params.id);
      if (row.expiresAt && row.expiresAt < new Date()) {
        throw notFound('Status has expired', ERROR_CODES.STATUS_EXPIRED);
      }
      return Response.json(row);
    })
    .delete('/:id', async ({ auth, params }) => {
      requireRole(auth, 'read_write');
      const db = requireDb(env);
      await loadStatus(db, auth.tenantId, params.id);
      await db.update(statuses).set({ deletedAt: new Date() }).where(eq(statuses.id, params.id));
      return new Response(null, { status: 204 });
    })
    .get('/:id/views', async ({ auth, params }) => {
      const db = requireDb(env);
      await loadStatus(db, auth.tenantId, params.id);
      const rows = await db
        .select()
        .from(statusViews)
        .where(eq(statusViews.statusId, params.id))
        .orderBy(desc(statusViews.viewedAt));
      return Response.json({ data: rows });
    })
    .post(
      '/:id/views',
      async ({ auth, params, body }) => {
        const parsed = v.safeParse(StatusViewSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        const db = requireDb(env);
        await loadStatus(db, auth.tenantId, params.id);
        const result = await db
          .insert(statusViews)
          .values({
            statusId: params.id,
            viewerJid: parsed.output.viewerJid,
            viewedAt: new Date(),
          })
          .onConflictDoNothing()
          .returning({ statusId: statusViews.statusId });
        // Only bump the cached count when this viewer is new.
        if (result.length > 0) {
          await db
            .update(statuses)
            .set({ viewCount: sql`${statuses.viewCount} + 1` })
            .where(eq(statuses.id, params.id));
        }
        return Response.json({ recorded: result.length > 0 });
      },
      { body: t.Any() },
    );
}
