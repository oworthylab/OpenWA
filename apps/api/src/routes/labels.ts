/**
 * Label management (Sprint 8, US-059).
 *
 *   GET    /v1/labels                          list
 *   POST   /v1/labels                          create (admin)
 *   PATCH  /v1/labels/:id                      rename / recolor (admin)
 *   DELETE /v1/labels/:id                      delete (admin)
 *   POST   /v1/contacts/:contactId/labels      assign labels to a contact
 *   DELETE /v1/contacts/:contactId/labels/:id  remove a single label
 *   POST   /v1/labels/bulk                     bulk assign/remove across contacts
 *
 * `waLabelId` is captured so a future plugin can mirror labels into the
 * WhatsApp native label space — we never write the WA side from here.
 */

import { contactLabels, crmContacts, labels } from '@openwa/db/control-plane';
import { type ControlPlaneDB, getControlPlaneDB } from '@openwa/db/helpers';
import { ERROR_CODES } from '@openwa/shared/errors';
import {
  LabelAssignSchema,
  LabelBulkAssignSchema,
  LabelCreateSchema,
  LabelUpdateSchema,
} from '@openwa/validators/labels';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import * as v from 'valibot';
import type { ApiEnv } from '../env.js';
import { ApiError, conflict, internal, notFound, validationFailed } from '../errors.js';
import { writeAudit } from '../lib/audit.js';
import { newId } from '../lib/crypto.js';
import { authenticate, requireRole } from '../middleware/auth.js';

function requireDb(env: ApiEnv): ControlPlaneDB {
  if (!env.CONTROL_PLANE_DB) throw internal('CONTROL_PLANE_DB binding missing');
  return getControlPlaneDB(env.CONTROL_PLANE_DB);
}

async function loadLabel(db: ControlPlaneDB, tenantId: string, id: string) {
  const row = await db
    .select()
    .from(labels)
    .where(and(eq(labels.tenantId, tenantId), eq(labels.id, id)))
    .limit(1);
  if (!row[0]) throw notFound('Label not found', ERROR_CODES.LABEL_NOT_FOUND);
  return row[0];
}

async function assertContactsBelong(
  db: ControlPlaneDB,
  tenantId: string,
  contactIds: string[],
): Promise<void> {
  if (contactIds.length === 0) return;
  const rows = await db
    .select({ id: crmContacts.id })
    .from(crmContacts)
    .where(and(eq(crmContacts.tenantId, tenantId), inArray(crmContacts.id, contactIds)));
  if (rows.length !== contactIds.length) {
    throw notFound('One or more contacts not found');
  }
}

async function assertLabelsBelong(
  db: ControlPlaneDB,
  tenantId: string,
  labelIds: string[],
): Promise<void> {
  if (labelIds.length === 0) return;
  const rows = await db
    .select({ id: labels.id })
    .from(labels)
    .where(and(eq(labels.tenantId, tenantId), inArray(labels.id, labelIds)));
  if (rows.length !== labelIds.length) {
    throw notFound('One or more labels not found', ERROR_CODES.LABEL_NOT_FOUND);
  }
}

export function labelRoutes(env: ApiEnv) {
  return new Elysia({ aot: false, prefix: '/v1' })
    .derive(async ({ request }) => ({ auth: await authenticate(request, env) }))
    .get('/labels', async ({ auth }) => {
      const db = requireDb(env);
      const rows = await db
        .select()
        .from(labels)
        .where(eq(labels.tenantId, auth.tenantId))
        .orderBy(asc(labels.name));
      return Response.json({ data: rows });
    })
    .post(
      '/labels',
      async ({ auth, body }) => {
        requireRole(auth, 'admin');
        const parsed = v.safeParse(LabelCreateSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        const db = requireDb(env);
        const dup = await db
          .select({ id: labels.id })
          .from(labels)
          .where(and(eq(labels.tenantId, auth.tenantId), eq(labels.name, parsed.output.name)))
          .limit(1);
        if (dup[0]) {
          throw conflict('Label name already in use', ERROR_CODES.LABEL_NAME_TAKEN);
        }
        const id = newId();
        await db.insert(labels).values({
          id,
          tenantId: auth.tenantId,
          name: parsed.output.name,
          color: parsed.output.color ?? '#1f6feb',
          waLabelId: parsed.output.waLabelId ?? null,
          createdAt: new Date(),
        });
        await writeAudit(db, {
          tenantId: auth.tenantId,
          apiKeyId: auth.keyId,
          action: 'label.create',
          resourceType: 'label',
          resourceId: id,
          metadata: { name: parsed.output.name },
        });
        return Response.json({ id }, { status: 201 });
      },
      { body: t.Any() },
    )
    .patch(
      '/labels/:id',
      async ({ auth, params, body }) => {
        requireRole(auth, 'admin');
        const parsed = v.safeParse(LabelUpdateSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        const db = requireDb(env);
        await loadLabel(db, auth.tenantId, params.id);
        if (parsed.output.name) {
          const dup = await db
            .select({ id: labels.id })
            .from(labels)
            .where(and(eq(labels.tenantId, auth.tenantId), eq(labels.name, parsed.output.name)))
            .limit(1);
          if (dup[0] && dup[0].id !== params.id) {
            throw conflict('Label name already in use', ERROR_CODES.LABEL_NAME_TAKEN);
          }
        }
        await db.update(labels).set(parsed.output).where(eq(labels.id, params.id));
        return Response.json({ id: params.id, updated: true });
      },
      { body: t.Any() },
    )
    .delete('/labels/:id', async ({ auth, params }) => {
      requireRole(auth, 'admin');
      const db = requireDb(env);
      await loadLabel(db, auth.tenantId, params.id);
      await db.delete(labels).where(eq(labels.id, params.id));
      return new Response(null, { status: 204 });
    })
    .post(
      '/contacts/:contactId/labels',
      async ({ auth, params, body }) => {
        requireRole(auth, 'read_write');
        const parsed = v.safeParse(LabelAssignSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        const db = requireDb(env);
        await assertContactsBelong(db, auth.tenantId, [params.contactId]);
        await assertLabelsBelong(db, auth.tenantId, parsed.output.labelIds);
        const now = new Date();
        for (const labelId of parsed.output.labelIds) {
          await db
            .insert(contactLabels)
            .values({ contactId: params.contactId, labelId, createdAt: now })
            .onConflictDoNothing();
        }
        return Response.json({ contactId: params.contactId, assigned: parsed.output.labelIds });
      },
      { body: t.Any() },
    )
    .delete('/contacts/:contactId/labels/:labelId', async ({ auth, params }) => {
      requireRole(auth, 'read_write');
      const db = requireDb(env);
      await assertContactsBelong(db, auth.tenantId, [params.contactId]);
      await assertLabelsBelong(db, auth.tenantId, [params.labelId]);
      await db
        .delete(contactLabels)
        .where(
          and(
            eq(contactLabels.contactId, params.contactId),
            eq(contactLabels.labelId, params.labelId),
          ),
        );
      return new Response(null, { status: 204 });
    })
    .post(
      '/labels/bulk',
      async ({ auth, body }) => {
        requireRole(auth, 'read_write');
        const parsed = v.safeParse(LabelBulkAssignSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        const db = requireDb(env);
        await assertContactsBelong(db, auth.tenantId, parsed.output.contactIds);
        await assertLabelsBelong(db, auth.tenantId, parsed.output.labelIds);
        const now = new Date();
        let touched = 0;
        if (parsed.output.action === 'assign') {
          for (const contactId of parsed.output.contactIds) {
            for (const labelId of parsed.output.labelIds) {
              await db
                .insert(contactLabels)
                .values({ contactId, labelId, createdAt: now })
                .onConflictDoNothing();
              touched++;
            }
          }
        } else {
          await db
            .delete(contactLabels)
            .where(
              and(
                inArray(contactLabels.contactId, parsed.output.contactIds),
                inArray(contactLabels.labelId, parsed.output.labelIds),
              ),
            );
          touched = parsed.output.contactIds.length * parsed.output.labelIds.length;
        }
        return Response.json({ action: parsed.output.action, touched });
      },
      { body: t.Any() },
    );
}

// Keep ApiError import marked as used in case future endpoints add custom statuses.
void ApiError;
