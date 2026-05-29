/**
 * Tenant plugin install / configuration (Sprint 8, US-064).
 *
 *   GET    /v1/plugins        list installed plugins
 *   POST   /v1/plugins        install a plugin (admin)
 *   PATCH  /v1/plugins/:id    toggle / reconfigure
 *   DELETE /v1/plugins/:id    uninstall (admin)
 *
 * `pluginId` here references the manifest id from the marketplace —
 * we do not download or execute plugin code in the Worker tier.
 * Plugin runtime lives in the engine workers.
 */

import { tenantPlugins } from '@openwa/db/control-plane';
import { type ControlPlaneDB, getControlPlaneDB } from '@openwa/db/helpers';
import { ERROR_CODES } from '@openwa/shared/errors';
import { PluginInstallSchema, PluginUpdateSchema } from '@openwa/validators/plugins';
import { and, asc, eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import * as v from 'valibot';
import type { ApiEnv } from '../env.js';
import { conflict, internal, notFound, validationFailed } from '../errors.js';
import { writeAudit } from '../lib/audit.js';
import { newId } from '../lib/crypto.js';
import { authenticate, requireRole } from '../middleware/auth.js';

function requireDb(env: ApiEnv): ControlPlaneDB {
  if (!env.CONTROL_PLANE_DB) throw internal('CONTROL_PLANE_DB binding missing');
  return getControlPlaneDB(env.CONTROL_PLANE_DB);
}

async function loadPlugin(db: ControlPlaneDB, tenantId: string, id: string) {
  const row = await db
    .select()
    .from(tenantPlugins)
    .where(and(eq(tenantPlugins.tenantId, tenantId), eq(tenantPlugins.id, id)))
    .limit(1);
  if (!row[0]) throw notFound('Plugin not installed', ERROR_CODES.PLUGIN_NOT_FOUND);
  return row[0];
}

export function pluginRoutes(env: ApiEnv) {
  return new Elysia({ aot: false, prefix: '/v1/plugins' })
    .derive(async ({ request }) => ({ auth: await authenticate(request, env) }))
    .get('/', async ({ auth }) => {
      const db = requireDb(env);
      const rows = await db
        .select()
        .from(tenantPlugins)
        .where(eq(tenantPlugins.tenantId, auth.tenantId))
        .orderBy(asc(tenantPlugins.pluginId));
      return Response.json({ data: rows });
    })
    .post(
      '/',
      async ({ auth, body }) => {
        requireRole(auth, 'admin');
        const parsed = v.safeParse(PluginInstallSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        const db = requireDb(env);
        const dup = await db
          .select({ id: tenantPlugins.id })
          .from(tenantPlugins)
          .where(
            and(
              eq(tenantPlugins.tenantId, auth.tenantId),
              eq(tenantPlugins.pluginId, parsed.output.pluginId),
            ),
          )
          .limit(1);
        if (dup[0]) {
          throw conflict('Plugin already installed', ERROR_CODES.PLUGIN_ALREADY_INSTALLED);
        }
        const id = newId();
        const now = new Date();
        await db.insert(tenantPlugins).values({
          id,
          tenantId: auth.tenantId,
          pluginId: parsed.output.pluginId,
          enabled: parsed.output.enabled ?? false,
          config: parsed.output.config ?? null,
          installedAt: now,
          updatedAt: now,
        });
        await writeAudit(db, {
          tenantId: auth.tenantId,
          apiKeyId: auth.keyId,
          action: 'plugin.install',
          resourceType: 'plugin',
          resourceId: id,
          metadata: { pluginId: parsed.output.pluginId },
        });
        return Response.json({ id }, { status: 201 });
      },
      { body: t.Any() },
    )
    .patch(
      '/:id',
      async ({ auth, params, body }) => {
        requireRole(auth, 'read_write');
        const parsed = v.safeParse(PluginUpdateSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        const db = requireDb(env);
        await loadPlugin(db, auth.tenantId, params.id);
        await db
          .update(tenantPlugins)
          .set({ ...parsed.output, updatedAt: new Date() })
          .where(eq(tenantPlugins.id, params.id));
        return Response.json({ id: params.id, updated: true });
      },
      { body: t.Any() },
    )
    .delete('/:id', async ({ auth, params }) => {
      requireRole(auth, 'admin');
      const db = requireDb(env);
      const row = await loadPlugin(db, auth.tenantId, params.id);
      await db.delete(tenantPlugins).where(eq(tenantPlugins.id, params.id));
      await writeAudit(db, {
        tenantId: auth.tenantId,
        apiKeyId: auth.keyId,
        action: 'plugin.uninstall',
        resourceType: 'plugin',
        resourceId: params.id,
        metadata: { pluginId: row.pluginId },
      });
      return new Response(null, { status: 204 });
    });
}
