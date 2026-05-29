/**
 * CRM endpoints (Sprint 7, US-051 / US-052 / US-054).
 *
 *  Contacts
 *    GET    /v1/crm/contacts                  list (paginated, ?tag, ?search)
 *    POST   /v1/crm/contacts                  create
 *    GET    /v1/crm/contacts/:id              detail (with tags)
 *    PATCH  /v1/crm/contacts/:id              update
 *    DELETE /v1/crm/contacts/:id              delete
 *    POST   /v1/crm/contacts/import           CSV import (bulk)
 *    GET    /v1/crm/contacts/export           CSV download
 *    POST   /v1/crm/contacts/merge            merge dedup (source → target)
 *    POST   /v1/crm/contacts/:id/tags         assign tags
 *    DELETE /v1/crm/contacts/:id/tags/:tagId  remove tag
 *
 *  Tags
 *    GET    /v1/crm/tags                      list
 *    POST   /v1/crm/tags                      create
 *    DELETE /v1/crm/tags/:id                  delete
 *
 *  Conversations
 *    GET    /v1/crm/conversations             list (?status, ?assignee)
 *    GET    /v1/crm/conversations/:id         detail
 *    PATCH  /v1/crm/conversations/:id         status + assignee
 *
 *  Templates
 *    GET    /v1/crm/templates                 list
 *    POST   /v1/crm/templates                 create
 *    PATCH  /v1/crm/templates/:id             update
 *    DELETE /v1/crm/templates/:id             delete
 *    POST   /v1/crm/templates/:id/render      preview (no send)
 */

import {
  conversations,
  crmContactTags,
  crmContacts,
  crmTags,
  messageTemplates,
} from '@openwa/db/control-plane';
import { type ControlPlaneDB, getControlPlaneDB } from '@openwa/db/helpers';
import { ERROR_CODES } from '@openwa/shared/errors';
import {
  ConversationQuerySchema,
  ConversationUpdateSchema,
  CrmContactCreateSchema,
  CrmContactImportSchema,
  CrmContactMergeSchema,
  CrmContactQuerySchema,
  CrmContactTagAssignSchema,
  CrmContactUpdateSchema,
  CrmTagCreateSchema,
  MessageTemplateCreateSchema,
  MessageTemplateUpdateSchema,
  TemplateSendSchema,
} from '@openwa/validators/crm';
import { and, desc, eq, inArray, like, sql } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import * as v from 'valibot';
import type { ApiEnv } from '../env.js';
import { ApiError, badRequest, conflict, internal, notFound, validationFailed } from '../errors.js';
import { writeAudit } from '../lib/audit.js';
import { newId } from '../lib/crypto.js';
import { parseCsv, sanitizeCell, writeCsv } from '../lib/csv.js';
import { TemplateRenderError, extractVariables, renderTemplate } from '../lib/template.js';
import { authenticate, requireRole } from '../middleware/auth.js';

function requireDb(env: ApiEnv): ControlPlaneDB {
  if (!env.CONTROL_PLANE_DB) throw internal('CONTROL_PLANE_DB binding missing');
  return getControlPlaneDB(env.CONTROL_PLANE_DB);
}

interface ContactWithTags {
  id: string;
  phoneNumber: string;
  name: string | null;
  email: string | null;
  waJid: string | null;
  metadata: Record<string, unknown> | null;
  optedOutAt: Date | null;
  tags: { id: string; name: string; color: string }[];
}

async function hydrateContactTags(
  db: ControlPlaneDB,
  tenantId: string,
  contactIds: string[],
): Promise<Map<string, ContactWithTags['tags']>> {
  const map = new Map<string, ContactWithTags['tags']>();
  if (contactIds.length === 0) return map;
  const rows = await db
    .select({
      contactId: crmContactTags.contactId,
      tagId: crmTags.id,
      tagName: crmTags.name,
      tagColor: crmTags.color,
    })
    .from(crmContactTags)
    .innerJoin(crmTags, eq(crmTags.id, crmContactTags.tagId))
    .where(and(inArray(crmContactTags.contactId, contactIds), eq(crmTags.tenantId, tenantId)));
  for (const r of rows) {
    const list = map.get(r.contactId) ?? [];
    list.push({ id: r.tagId, name: r.tagName, color: r.tagColor });
    map.set(r.contactId, list);
  }
  return map;
}

export function crmRoutes(env: ApiEnv) {
  return (
    new Elysia({ aot: false, prefix: '/v1/crm' })
      .derive(async ({ request }) => ({ auth: await authenticate(request, env) }))
      // ============ contacts ============
      .get('/contacts', async ({ auth, query }) => {
        const parsed = v.safeParse(CrmContactQuerySchema, normalizeQuery(query));
        if (!parsed.success) throw validationFailed(parsed.issues);
        const db = requireDb(env);
        const { page, pageSize, tag, search } = parsed.output;

        const filters = [eq(crmContacts.tenantId, auth.tenantId)];
        if (search) {
          filters.push(like(crmContacts.phoneNumber, `%${search}%`));
        }

        let baseRows: { id: string }[];
        if (tag) {
          baseRows = await db
            .selectDistinct({ id: crmContacts.id })
            .from(crmContacts)
            .innerJoin(crmContactTags, eq(crmContactTags.contactId, crmContacts.id))
            .innerJoin(crmTags, eq(crmTags.id, crmContactTags.tagId))
            .where(and(...filters, eq(crmTags.name, tag)))
            .limit(pageSize)
            .offset((page - 1) * pageSize);
        } else {
          baseRows = await db
            .select({ id: crmContacts.id })
            .from(crmContacts)
            .where(and(...filters))
            .orderBy(desc(crmContacts.updatedAt))
            .limit(pageSize)
            .offset((page - 1) * pageSize);
        }

        const ids = baseRows.map((r) => r.id);
        const detail = ids.length
          ? await db.select().from(crmContacts).where(inArray(crmContacts.id, ids))
          : [];
        const tagMap = await hydrateContactTags(db, auth.tenantId, ids);
        const data = detail.map((c) => ({
          ...c,
          tags: tagMap.get(c.id) ?? [],
        }));
        return Response.json({ data, pagination: { page, pageSize } });
      })
      .post(
        '/contacts',
        async ({ auth, body, request }) => {
          requireRole(auth, 'read_write');
          const parsed = v.safeParse(CrmContactCreateSchema, body);
          if (!parsed.success) throw validationFailed(parsed.issues);
          const db = requireDb(env);
          const dup = await db
            .select({ id: crmContacts.id })
            .from(crmContacts)
            .where(
              and(
                eq(crmContacts.tenantId, auth.tenantId),
                eq(crmContacts.phoneNumber, parsed.output.phoneNumber),
              ),
            )
            .limit(1);
          if (dup[0]) throw conflict('Contact with phone already exists');
          const now = new Date();
          const id = newId();
          await db.insert(crmContacts).values({
            id,
            tenantId: auth.tenantId,
            phoneNumber: parsed.output.phoneNumber,
            name: parsed.output.name ?? null,
            email: parsed.output.email ?? null,
            waJid: parsed.output.waJid ?? null,
            metadata: parsed.output.metadata ?? null,
            createdAt: now,
            updatedAt: now,
          });
          await writeAudit(db, {
            tenantId: auth.tenantId,
            apiKeyId: auth.keyId,
            action: 'crm.contact.create',
            resourceType: 'crm_contact',
            resourceId: id,
            ipAddress: clientIp(request),
            metadata: { phoneNumber: parsed.output.phoneNumber },
          });
          return Response.json({ id }, { status: 201 });
        },
        { body: t.Any() },
      )
      .get('/contacts/:id', async ({ auth, params }) => {
        const db = requireDb(env);
        const row = await loadContact(db, auth.tenantId, params.id);
        const tagMap = await hydrateContactTags(db, auth.tenantId, [row.id]);
        return Response.json({ ...row, tags: tagMap.get(row.id) ?? [] });
      })
      .patch(
        '/contacts/:id',
        async ({ auth, params, body }) => {
          requireRole(auth, 'read_write');
          const parsed = v.safeParse(CrmContactUpdateSchema, body);
          if (!parsed.success) throw validationFailed(parsed.issues);
          const db = requireDb(env);
          await loadContact(db, auth.tenantId, params.id);
          await db
            .update(crmContacts)
            .set({ ...parsed.output, updatedAt: new Date() })
            .where(eq(crmContacts.id, params.id));
          return Response.json({ id: params.id, updated: true });
        },
        { body: t.Any() },
      )
      .delete('/contacts/:id', async ({ auth, params }) => {
        requireRole(auth, 'read_write');
        const db = requireDb(env);
        await loadContact(db, auth.tenantId, params.id);
        await db.delete(crmContacts).where(eq(crmContacts.id, params.id));
        return new Response(null, { status: 204 });
      })
      .post(
        '/contacts/import',
        async ({ auth, body }) => {
          requireRole(auth, 'read_write');
          const parsed = v.safeParse(CrmContactImportSchema, body);
          if (!parsed.success) throw validationFailed(parsed.issues);
          const db = requireDb(env);
          const grid = parseCsv(parsed.output.csv);
          const mapping = parsed.output.mapping ?? {};
          const phoneCol =
            mapping.phoneNumber ?? findHeader(grid.headers, ['phone', 'phoneNumber']);
          const nameCol = mapping.name ?? findHeader(grid.headers, ['name', 'fullName']);
          const emailCol = mapping.email ?? findHeader(grid.headers, ['email']);
          if (!phoneCol) {
            throw badRequest('CSV missing required `phone` column');
          }
          const now = new Date();
          const errors: { row: number; error: string }[] = [];
          let imported = 0;
          for (let i = 0; i < grid.rows.length; i++) {
            const row = grid.rows[i];
            if (!row) continue;
            const phone = row[phoneCol]?.trim();
            if (!phone || !/^\+?[1-9]\d{6,14}$/.test(phone)) {
              errors.push({ row: i + 2, error: 'Invalid or missing phone' });
              continue;
            }
            const name = nameCol ? row[nameCol]?.trim() || null : null;
            const email = emailCol ? row[emailCol]?.trim() || null : null;
            try {
              await db.insert(crmContacts).values({
                id: newId(),
                tenantId: auth.tenantId,
                phoneNumber: phone,
                name,
                email,
                createdAt: now,
                updatedAt: now,
              });
              imported++;
            } catch {
              errors.push({ row: i + 2, error: 'Duplicate phone or DB error' });
            }
          }
          return Response.json({ imported, failed: errors.length, errors }, { status: 201 });
        },
        { body: t.Any() },
      )
      .get('/contacts/export', async ({ auth }) => {
        const db = requireDb(env);
        const rows = await db
          .select({
            phoneNumber: crmContacts.phoneNumber,
            name: crmContacts.name,
            email: crmContacts.email,
          })
          .from(crmContacts)
          .where(eq(crmContacts.tenantId, auth.tenantId));
        const csv = writeCsv(
          rows.map((r) => ({
            phoneNumber: sanitizeCell(r.phoneNumber),
            name: sanitizeCell(r.name ?? ''),
            email: sanitizeCell(r.email ?? ''),
          })),
          ['phoneNumber', 'name', 'email'],
        );
        return new Response(csv, {
          status: 200,
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="contacts.csv"',
          },
        });
      })
      .post(
        '/contacts/merge',
        async ({ auth, body }) => {
          requireRole(auth, 'admin');
          const parsed = v.safeParse(CrmContactMergeSchema, body);
          if (!parsed.success) throw validationFailed(parsed.issues);
          if (parsed.output.sourceId === parsed.output.targetId) {
            throw badRequest('source and target must differ');
          }
          const db = requireDb(env);
          await loadContact(db, auth.tenantId, parsed.output.sourceId);
          await loadContact(db, auth.tenantId, parsed.output.targetId);
          // Re-point tag assignments to target, ignoring rows that
          // would violate the unique (contact_id, tag_id) constraint.
          await db
            .update(crmContactTags)
            .set({ contactId: parsed.output.targetId })
            .where(eq(crmContactTags.contactId, parsed.output.sourceId))
            .catch(() => undefined);
          await db
            .update(conversations)
            .set({ contactId: parsed.output.targetId, updatedAt: new Date() })
            .where(eq(conversations.contactId, parsed.output.sourceId))
            .catch(() => undefined);
          await db.delete(crmContacts).where(eq(crmContacts.id, parsed.output.sourceId));
          return Response.json({ merged: true, into: parsed.output.targetId });
        },
        { body: t.Any() },
      )
      .post(
        '/contacts/:id/tags',
        async ({ auth, params, body }) => {
          requireRole(auth, 'read_write');
          const parsed = v.safeParse(CrmContactTagAssignSchema, body);
          if (!parsed.success) throw validationFailed(parsed.issues);
          const db = requireDb(env);
          await loadContact(db, auth.tenantId, params.id);
          // Verify all tags belong to this tenant.
          const valid = await db
            .select({ id: crmTags.id })
            .from(crmTags)
            .where(
              and(eq(crmTags.tenantId, auth.tenantId), inArray(crmTags.id, parsed.output.tagIds)),
            );
          if (valid.length !== parsed.output.tagIds.length) {
            throw badRequest('one or more tag ids invalid for tenant');
          }
          const now = new Date();
          for (const tagId of parsed.output.tagIds) {
            await db
              .insert(crmContactTags)
              .values({ contactId: params.id, tagId, createdAt: now })
              .onConflictDoNothing();
          }
          return Response.json({ assigned: parsed.output.tagIds.length });
        },
        { body: t.Any() },
      )
      .delete('/contacts/:id/tags/:tagId', async ({ auth, params }) => {
        requireRole(auth, 'read_write');
        const db = requireDb(env);
        await loadContact(db, auth.tenantId, params.id);
        await db
          .delete(crmContactTags)
          .where(
            and(eq(crmContactTags.contactId, params.id), eq(crmContactTags.tagId, params.tagId)),
          );
        return new Response(null, { status: 204 });
      })
      // ============ tags ============
      .get('/tags', async ({ auth }) => {
        const db = requireDb(env);
        const rows = await db
          .select()
          .from(crmTags)
          .where(eq(crmTags.tenantId, auth.tenantId))
          .orderBy(crmTags.name);
        return Response.json({ data: rows });
      })
      .post(
        '/tags',
        async ({ auth, body }) => {
          requireRole(auth, 'read_write');
          const parsed = v.safeParse(CrmTagCreateSchema, body);
          if (!parsed.success) throw validationFailed(parsed.issues);
          const db = requireDb(env);
          const dup = await db
            .select({ id: crmTags.id })
            .from(crmTags)
            .where(and(eq(crmTags.tenantId, auth.tenantId), eq(crmTags.name, parsed.output.name)))
            .limit(1);
          if (dup[0]) throw conflict('Tag name already exists');
          const id = newId();
          await db.insert(crmTags).values({
            id,
            tenantId: auth.tenantId,
            name: parsed.output.name,
            color: parsed.output.color,
            createdAt: new Date(),
          });
          return Response.json(
            { id, name: parsed.output.name, color: parsed.output.color },
            { status: 201 },
          );
        },
        { body: t.Any() },
      )
      .delete('/tags/:id', async ({ auth, params }) => {
        requireRole(auth, 'admin');
        const db = requireDb(env);
        const row = await db
          .select({ id: crmTags.id })
          .from(crmTags)
          .where(and(eq(crmTags.id, params.id), eq(crmTags.tenantId, auth.tenantId)))
          .limit(1);
        if (!row[0]) throw notFound('Tag not found');
        await db.delete(crmTags).where(eq(crmTags.id, params.id));
        return new Response(null, { status: 204 });
      })
      // ============ conversations ============
      .get('/conversations', async ({ auth, query }) => {
        const parsed = v.safeParse(ConversationQuerySchema, normalizeQuery(query));
        if (!parsed.success) throw validationFailed(parsed.issues);
        const db = requireDb(env);
        const filters = [eq(conversations.tenantId, auth.tenantId)];
        if (parsed.output.status) filters.push(eq(conversations.status, parsed.output.status));
        if (parsed.output.assigneeUserId)
          filters.push(eq(conversations.assigneeUserId, parsed.output.assigneeUserId));
        const rows = await db
          .select()
          .from(conversations)
          .where(and(...filters))
          .orderBy(desc(conversations.updatedAt))
          .limit(parsed.output.pageSize)
          .offset((parsed.output.page - 1) * parsed.output.pageSize);
        return Response.json({
          data: rows,
          pagination: { page: parsed.output.page, pageSize: parsed.output.pageSize },
        });
      })
      .get('/conversations/:id', async ({ auth, params }) => {
        const db = requireDb(env);
        const row = (
          await db
            .select()
            .from(conversations)
            .where(and(eq(conversations.id, params.id), eq(conversations.tenantId, auth.tenantId)))
            .limit(1)
        )[0];
        if (!row) throw notFound('Conversation not found');
        return Response.json(row);
      })
      .patch(
        '/conversations/:id',
        async ({ auth, params, body }) => {
          requireRole(auth, 'read_write');
          const parsed = v.safeParse(ConversationUpdateSchema, body);
          if (!parsed.success) throw validationFailed(parsed.issues);
          const db = requireDb(env);
          const row = (
            await db
              .select()
              .from(conversations)
              .where(
                and(eq(conversations.id, params.id), eq(conversations.tenantId, auth.tenantId)),
              )
              .limit(1)
          )[0];
          if (!row) throw notFound('Conversation not found');
          // Status transition rules: closed cannot reopen except via admin endpoint.
          if (
            row.status === 'closed' &&
            parsed.output.status &&
            parsed.output.status !== 'closed'
          ) {
            requireRole(auth, 'admin');
          }
          await db
            .update(conversations)
            .set({
              ...(parsed.output.status !== undefined ? { status: parsed.output.status } : {}),
              ...(parsed.output.assigneeUserId !== undefined
                ? { assigneeUserId: parsed.output.assigneeUserId }
                : {}),
              updatedAt: new Date(),
            })
            .where(eq(conversations.id, params.id));
          return Response.json({ id: params.id, updated: true });
        },
        { body: t.Any() },
      )
      // ============ templates ============
      .get('/templates', async ({ auth }) => {
        const db = requireDb(env);
        const rows = await db
          .select()
          .from(messageTemplates)
          .where(eq(messageTemplates.tenantId, auth.tenantId))
          .orderBy(messageTemplates.name);
        return Response.json({ data: rows });
      })
      .post(
        '/templates',
        async ({ auth, body }) => {
          requireRole(auth, 'read_write');
          const parsed = v.safeParse(MessageTemplateCreateSchema, body);
          if (!parsed.success) throw validationFailed(parsed.issues);
          const db = requireDb(env);
          const dup = await db
            .select({ id: messageTemplates.id })
            .from(messageTemplates)
            .where(
              and(
                eq(messageTemplates.tenantId, auth.tenantId),
                eq(messageTemplates.name, parsed.output.name),
              ),
            )
            .limit(1);
          if (dup[0]) throw conflict('Template name already exists');
          const id = newId();
          const now = new Date();
          await db.insert(messageTemplates).values({
            id,
            tenantId: auth.tenantId,
            name: parsed.output.name,
            body: parsed.output.body,
            variables: extractVariables(parsed.output.body),
            createdAt: now,
            updatedAt: now,
          });
          return Response.json(
            { id, variables: extractVariables(parsed.output.body) },
            { status: 201 },
          );
        },
        { body: t.Any() },
      )
      .patch(
        '/templates/:id',
        async ({ auth, params, body }) => {
          requireRole(auth, 'read_write');
          const parsed = v.safeParse(MessageTemplateUpdateSchema, body);
          if (!parsed.success) throw validationFailed(parsed.issues);
          const db = requireDb(env);
          const row = (
            await db
              .select()
              .from(messageTemplates)
              .where(
                and(
                  eq(messageTemplates.id, params.id),
                  eq(messageTemplates.tenantId, auth.tenantId),
                ),
              )
              .limit(1)
          )[0];
          if (!row) throw notFound('Template not found');
          const newBody = parsed.output.body ?? row.body;
          await db
            .update(messageTemplates)
            .set({
              ...(parsed.output.name !== undefined ? { name: parsed.output.name } : {}),
              ...(parsed.output.body !== undefined ? { body: parsed.output.body } : {}),
              variables: extractVariables(newBody),
              updatedAt: new Date(),
            })
            .where(eq(messageTemplates.id, params.id));
          return Response.json({ id: params.id, updated: true });
        },
        { body: t.Any() },
      )
      .delete('/templates/:id', async ({ auth, params }) => {
        requireRole(auth, 'admin');
        const db = requireDb(env);
        await db
          .delete(messageTemplates)
          .where(
            and(eq(messageTemplates.id, params.id), eq(messageTemplates.tenantId, auth.tenantId)),
          );
        return new Response(null, { status: 204 });
      })
      .post(
        '/templates/:id/render',
        async ({ auth, params, body }) => {
          requireRole(auth, 'read_write');
          const parsed = v.safeParse(TemplateSendSchema, body);
          if (!parsed.success) throw validationFailed(parsed.issues);
          const db = requireDb(env);
          const row = (
            await db
              .select()
              .from(messageTemplates)
              .where(
                and(
                  eq(messageTemplates.id, params.id),
                  eq(messageTemplates.tenantId, auth.tenantId),
                ),
              )
              .limit(1)
          )[0];
          if (!row) throw notFound('Template not found');
          try {
            const rendered = renderTemplate(row.body, parsed.output.variables);
            return Response.json({ id: params.id, rendered });
          } catch (err) {
            if (err instanceof TemplateRenderError) {
              throw new ApiError({
                status: 400,
                code: ERROR_CODES.VALIDATION_ERROR,
                message: err.message,
                details: { missing: err.missing },
              });
            }
            throw err;
          }
        },
        { body: t.Any() },
      )
  );
}

// -------------------- helpers --------------------

async function loadContact(db: ControlPlaneDB, tenantId: string, id: string) {
  const row = (
    await db
      .select()
      .from(crmContacts)
      .where(and(eq(crmContacts.id, id), eq(crmContacts.tenantId, tenantId)))
      .limit(1)
  )[0];
  if (!row) throw notFound('Contact not found');
  return row;
}

function findHeader(headers: string[], candidates: string[]): string | undefined {
  const lower = new Map(headers.map((h) => [h.toLowerCase(), h]));
  for (const c of candidates) {
    const m = lower.get(c.toLowerCase());
    if (m) return m;
  }
  return undefined;
}

function normalizeQuery(q: Record<string, string | undefined>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined) continue;
    if (k === 'page' || k === 'pageSize') {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function clientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

// Silence drizzle unused import warning when running without `sql`.
const _sql = sql;
void _sql;
