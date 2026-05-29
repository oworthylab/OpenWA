/**
 * Group endpoints (US-025). All delegated to the engine Worker; the API
 * layer validates input and scopes by tenant.
 *
 *  - GET    /v1/sessions/:id/groups                            list
 *  - POST   /v1/sessions/:id/groups                            create
 *  - GET    /v1/sessions/:id/groups/:jid                       details
 *  - PATCH  /v1/sessions/:id/groups/:jid                       update subject/description
 *  - POST   /v1/sessions/:id/groups/:jid/participants          add/remove/promote/demote
 *  - GET    /v1/sessions/:id/groups/:jid/invite                fetch invite link
 *  - DELETE /v1/sessions/:id/groups/:jid/invite                revoke + rotate invite link
 */

import { sessions } from '@openwa/db/control-plane';
import { getControlPlaneDB } from '@openwa/db/helpers';
import { ERROR_CODES } from '@openwa/shared/errors';
import {
  CreateGroupSchema,
  GroupParticipantActionSchema,
  UpdateGroupSchema,
} from '@openwa/validators/group';
import { and, eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import * as v from 'valibot';
import type { ApiEnv } from '../env.js';
import { internal, notFound, validationFailed } from '../errors.js';
import { EngineClient } from '../lib/engine-client.js';
import { type AuthContext, authenticate, requireRole } from '../middleware/auth.js';

export function groupRoutes(env: ApiEnv) {
  return new Elysia({ aot: false, prefix: '/v1/sessions/:id/groups' })
    .derive(async ({ request }) => ({ auth: await authenticate(request, env) }))
    .get('/', async ({ params, auth }) => {
      await loadSession(env, auth, params.id);
      const engine = requireEngine(env);
      return Response.json(await engine.listGroups(params.id));
    })
    .post(
      '/',
      async ({ params, body, auth }) => {
        requireRole(auth, 'read_write');
        await loadSession(env, auth, params.id);
        const parsed = v.safeParse(CreateGroupSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        const engine = requireEngine(env);
        const result = await engine.createGroup(params.id, parsed.output);
        return Response.json(result, { status: 201 });
      },
      { body: t.Any() },
    )
    .get('/:jid', async ({ params, auth }) => {
      await loadSession(env, auth, params.id);
      const engine = requireEngine(env);
      return Response.json(await engine.getGroup(params.id, params.jid));
    })
    .patch(
      '/:jid',
      async ({ params, body, auth }) => {
        requireRole(auth, 'read_write');
        await loadSession(env, auth, params.id);
        const parsed = v.safeParse(UpdateGroupSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        const engine = requireEngine(env);
        await engine.updateGroup(params.id, params.jid, parsed.output);
        return new Response(null, { status: 204 });
      },
      { body: t.Any() },
    )
    .post(
      '/:jid/participants',
      async ({ params, body, auth }) => {
        requireRole(auth, 'read_write');
        await loadSession(env, auth, params.id);
        const parsed = v.safeParse(GroupParticipantActionSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        const engine = requireEngine(env);
        return Response.json(await engine.groupParticipants(params.id, params.jid, parsed.output));
      },
      { body: t.Any() },
    )
    .get('/:jid/invite', async ({ params, auth }) => {
      await loadSession(env, auth, params.id);
      const engine = requireEngine(env);
      return Response.json(await engine.groupInviteLink(params.id, params.jid));
    })
    .delete('/:jid/invite', async ({ params, auth }) => {
      requireRole(auth, 'admin');
      await loadSession(env, auth, params.id);
      const engine = requireEngine(env);
      return Response.json(await engine.groupRevokeInvite(params.id, params.jid));
    });
}

// -------------------- helpers --------------------

async function loadSession(env: ApiEnv, auth: AuthContext, id: string) {
  if (!env.CONTROL_PLANE_DB) throw internal('CONTROL_PLANE_DB missing');
  const db = getControlPlaneDB(env.CONTROL_PLANE_DB);
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.tenantId, auth.tenantId)))
    .limit(1);
  if (!rows[0]) throw notFound('Session not found', ERROR_CODES.SESSION_NOT_FOUND);
  return rows[0];
}

function requireEngine(env: ApiEnv): EngineClient {
  const c = new EngineClient(env.ENGINE);
  if (!c.isAvailable()) throw internal('Engine binding not configured');
  return c;
}
