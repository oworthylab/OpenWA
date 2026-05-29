/**
 * Tenant settings (Sprint 8, US-063).
 *
 *   GET   /v1/settings   — fetches the tenant's settings row, creating
 *                          one with defaults if it doesn't exist yet.
 *   PATCH /v1/settings   — partial update via upsert (`onConflictDoUpdate`).
 *
 * The settings table uses `tenantId` as its primary key — exactly one
 * row per tenant. PATCH is admin-only because notification email and
 * defaults affect the whole tenant.
 */

import { tenantSettings } from '@openwa/db/control-plane';
import { type ControlPlaneDB, getControlPlaneDB } from '@openwa/db/helpers';
import { SettingsUpdateSchema } from '@openwa/validators/settings';
import { eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import * as v from 'valibot';
import type { ApiEnv } from '../env.js';
import { internal, validationFailed } from '../errors.js';
import { writeAudit } from '../lib/audit.js';
import { authenticate, requireRole } from '../middleware/auth.js';

function requireDb(env: ApiEnv): ControlPlaneDB {
  if (!env.CONTROL_PLANE_DB) throw internal('CONTROL_PLANE_DB binding missing');
  return getControlPlaneDB(env.CONTROL_PLANE_DB);
}

async function loadOrCreate(db: ControlPlaneDB, tenantId: string) {
  const row = await db
    .select()
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))
    .limit(1);
  if (row[0]) return row[0];
  const now = new Date();
  await db.insert(tenantSettings).values({ tenantId, updatedAt: now }).onConflictDoNothing();
  const refreshed = await db
    .select()
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))
    .limit(1);
  if (!refreshed[0]) throw internal('Failed to initialise tenant settings');
  return refreshed[0];
}

export function settingsRoutes(env: ApiEnv) {
  return new Elysia({ aot: false, prefix: '/v1/settings' })
    .derive(async ({ request }) => ({ auth: await authenticate(request, env) }))
    .get('/', async ({ auth }) => {
      const db = requireDb(env);
      const row = await loadOrCreate(db, auth.tenantId);
      return Response.json(row);
    })
    .patch(
      '/',
      async ({ auth, body }) => {
        requireRole(auth, 'admin');
        const parsed = v.safeParse(SettingsUpdateSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        const db = requireDb(env);
        // Ensure a row exists first (upsert pattern).
        await loadOrCreate(db, auth.tenantId);
        await db
          .update(tenantSettings)
          .set({ ...parsed.output, updatedAt: new Date() })
          .where(eq(tenantSettings.tenantId, auth.tenantId));
        await writeAudit(db, {
          tenantId: auth.tenantId,
          apiKeyId: auth.keyId,
          action: 'settings.update',
          resourceType: 'tenant_settings',
          resourceId: auth.tenantId,
          metadata: { keys: Object.keys(parsed.output) },
        });
        const refreshed = await db
          .select()
          .from(tenantSettings)
          .where(eq(tenantSettings.tenantId, auth.tenantId))
          .limit(1);
        return Response.json(refreshed[0]);
      },
      { body: t.Any() },
    );
}
