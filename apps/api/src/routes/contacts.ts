/**
 * Contact endpoints (US-024). All delegated to the engine Worker; the
 * API layer just authenticates, scopes by tenant, and validates input.
 *
 *  - GET  /v1/sessions/:id/contacts             list (paginated)
 *  - GET  /v1/sessions/:id/contacts/:jid        single contact
 *  - POST /v1/sessions/:id/contacts/check       bulk phone-on-WA check
 *  - GET  /v1/sessions/:id/contacts/:jid/photo  profile photo URL
 *  - POST /v1/sessions/:id/contacts/block       block by JID
 *  - POST /v1/sessions/:id/contacts/unblock     unblock by JID
 */

import { sessions } from '@openwa/db/control-plane';
import { getControlPlaneDB } from '@openwa/db/helpers';
import { ERROR_CODES } from '@openwa/shared/errors';
import {
  BlockContactSchema,
  CheckContactsSchema,
  ContactQuerySchema,
} from '@openwa/validators/contact';
import { and, eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import * as v from 'valibot';
import type { ApiEnv } from '../env.js';
import { internal, notFound, validationFailed } from '../errors.js';
import { EngineClient } from '../lib/engine-client.js';
import { type AuthContext, authenticate, requireRole } from '../middleware/auth.js';

export function contactRoutes(env: ApiEnv) {
  return new Elysia({ aot: false, prefix: '/v1/sessions/:id/contacts' })
    .derive(async ({ request }) => ({ auth: await authenticate(request, env) }))
    .get('/', async ({ params, query, auth }) => {
      await loadSession(env, auth, params.id);
      const parsed = v.safeParse(ContactQuerySchema, normaliseQuery(query));
      if (!parsed.success) throw validationFailed(parsed.issues);
      const engine = requireEngine(env);
      const out = await engine.listContacts(params.id, parsed.output);
      return Response.json(out);
    })
    .post(
      '/check',
      async ({ params, body, auth }) => {
        requireRole(auth, 'read_write');
        await loadSession(env, auth, params.id);
        const parsed = v.safeParse(CheckContactsSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        const engine = requireEngine(env);
        return Response.json(await engine.checkContacts(params.id, parsed.output));
      },
      { body: t.Any() },
    )
    .post(
      '/block',
      async ({ params, body, auth }) => {
        requireRole(auth, 'read_write');
        await loadSession(env, auth, params.id);
        const parsed = v.safeParse(BlockContactSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        const engine = requireEngine(env);
        await engine.blockContact(params.id, parsed.output.jid);
        return new Response(null, { status: 204 });
      },
      { body: t.Any() },
    )
    .post(
      '/unblock',
      async ({ params, body, auth }) => {
        requireRole(auth, 'read_write');
        await loadSession(env, auth, params.id);
        const parsed = v.safeParse(BlockContactSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        const engine = requireEngine(env);
        await engine.unblockContact(params.id, parsed.output.jid);
        return new Response(null, { status: 204 });
      },
      { body: t.Any() },
    )
    .get('/:jid', async ({ params, auth }) => {
      await loadSession(env, auth, params.id);
      const engine = requireEngine(env);
      return Response.json(await engine.getContact(params.id, params.jid));
    })
    .get('/:jid/photo', async ({ params, auth }) => {
      await loadSession(env, auth, params.id);
      const engine = requireEngine(env);
      return Response.json(await engine.getContactPhoto(params.id, params.jid));
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

function normaliseQuery(q: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (q.page !== undefined) out.page = Number(q.page);
  if (q.pageSize !== undefined) out.pageSize = Number(q.pageSize);
  if (typeof q.search === 'string') out.search = q.search;
  return out;
}
