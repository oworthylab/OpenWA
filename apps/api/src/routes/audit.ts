/**
 * Audit log query endpoint (US-033).
 *
 *  - GET /v1/audit  paginated query, scoped to the caller's tenant.
 *
 *    Query params:
 *      page          (default 1)
 *      pageSize      (default 25, max 100)
 *      action        filter by exact action string
 *      resourceType  filter by resource type
 *      resourceId    filter by resource id
 *      from          ISO date — createdAt >= from
 *      to            ISO date — createdAt <  to
 */

import { auditLog } from '@openwa/db/control-plane';
import { getControlPlaneDB } from '@openwa/db/helpers';
import { and, count, desc, eq, gte, lt } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { ApiEnv } from '../env.js';
import { internal } from '../errors.js';
import { authenticate } from '../middleware/auth.js';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

export function auditRoutes(env: ApiEnv) {
  return new Elysia({ aot: false, prefix: '/v1/audit' })
    .derive(async ({ request }) => ({ auth: await authenticate(request, env) }))
    .get('/', async ({ query, auth }) => {
      const cpDb = env.CONTROL_PLANE_DB;
      if (!cpDb) throw internal('CONTROL_PLANE_DB missing');
      const db = getControlPlaneDB(cpDb);

      const page = clampInt(query.page, 1, 1, Number.MAX_SAFE_INTEGER);
      const pageSize = clampInt(query.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

      const filters = [eq(auditLog.tenantId, auth.tenantId)];
      if (typeof query.action === 'string' && query.action) {
        filters.push(eq(auditLog.action, query.action));
      }
      if (typeof query.resourceType === 'string' && query.resourceType) {
        filters.push(eq(auditLog.resourceType, query.resourceType));
      }
      if (typeof query.resourceId === 'string' && query.resourceId) {
        filters.push(eq(auditLog.resourceId, query.resourceId));
      }
      const from = parseDate(query.from);
      if (from) filters.push(gte(auditLog.createdAt, from));
      const to = parseDate(query.to);
      if (to) filters.push(lt(auditLog.createdAt, to));

      const whereExpr = filters.length === 1 ? filters[0] : and(...filters);

      const [rows, totalRow] = await Promise.all([
        db
          .select()
          .from(auditLog)
          .where(whereExpr)
          .orderBy(desc(auditLog.createdAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ value: count() }).from(auditLog).where(whereExpr),
      ]);

      const total = totalRow[0]?.value ?? 0;
      return Response.json({
        data: rows,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      });
    });
}

function clampInt(value: unknown, def: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}
