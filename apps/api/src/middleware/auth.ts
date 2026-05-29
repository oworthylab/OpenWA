/**
 * API key authentication: looks up `X-API-Key` in the control-plane DB,
 * caches the resolved {tenantId, role, keyId} in KV (5 min TTL), and
 * injects an {@link AuthContext} for downstream handlers.
 *
 * - 401 INVALID_API_KEY when header missing or key not found
 * - 401 EXPIRED_API_KEY when `expiresAt < now`
 * - 401 REVOKED_API_KEY when `revokedAt` set
 * - 401 TENANT_INACTIVE when tenant suspended/frozen/deleted
 */

import { apiKeys, tenants } from '@openwa/db/control-plane';
import { type ControlPlaneDB, getControlPlaneDB } from '@openwa/db/helpers';
import { ERROR_CODES } from '@openwa/shared/errors';
import { and, eq, isNull } from 'drizzle-orm';
import type { ApiEnv } from '../env.js';
import { internal, unauthorized } from '../errors.js';
import { parseApiKeyPrefix, sha256Hex } from '../lib/crypto.js';

export type ApiKeyRole = 'admin' | 'read_write' | 'read_only';

export interface AuthContext {
  tenantId: string;
  tenantStatus: 'active' | 'suspended' | 'frozen' | 'deleted';
  keyId: string;
  role: ApiKeyRole;
  /** Resolved per-tenant D1 binding id (from `tenants.d1DatabaseId`). May be null on free tier. */
  tenantDbId: string | null;
}

interface CachedAuth {
  tenantId: string;
  tenantStatus: AuthContext['tenantStatus'];
  keyId: string;
  role: ApiKeyRole;
  tenantDbId: string | null;
  /** Plaintext-key SHA-256 we matched against (used for cache integrity). */
  hashedKey: string;
}

const KV_TTL_SECONDS = 300;
const KV_PREFIX = 'auth:key:';

/**
 * Resolves an inbound request's API key to an {@link AuthContext}.
 *
 * Throws {@link ApiError} on any failure. Always returns a fresh object;
 * callers must not mutate it.
 */
export async function authenticate(request: Request, env: ApiEnv): Promise<AuthContext> {
  const header = request.headers.get('x-api-key') ?? request.headers.get('authorization');
  const plaintext = extractKey(header);
  if (!plaintext) {
    throw unauthorized('Missing API key', ERROR_CODES.UNAUTHORIZED);
  }
  const prefix = parseApiKeyPrefix(plaintext);
  if (!prefix) {
    throw unauthorized('Invalid API key format', ERROR_CODES.INVALID_API_KEY);
  }
  if (!env.CONTROL_PLANE_DB) {
    throw internal('Control plane DB binding missing');
  }

  const hashedKey = await sha256Hex(plaintext);

  // 1. Try KV cache (key on the hash so a leaked prefix can't pull cached data).
  const cached = await readKvCache(env.AUTH_CACHE, hashedKey);
  if (cached && cached.hashedKey === hashedKey) {
    return toContext(cached);
  }

  // 2. DB lookup by hashedKey (unique index).
  const db = getDb(env);
  const rows = await db
    .select({
      keyId: apiKeys.id,
      tenantId: apiKeys.tenantId,
      role: apiKeys.role,
      hashedKey: apiKeys.hashedKey,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
      tenantStatus: tenants.status,
      tenantDbId: tenants.d1DatabaseId,
    })
    .from(apiKeys)
    .innerJoin(tenants, eq(tenants.id, apiKeys.tenantId))
    .where(and(eq(apiKeys.hashedKey, hashedKey), isNull(apiKeys.revokedAt)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw unauthorized('Invalid API key', ERROR_CODES.INVALID_API_KEY);
  }
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    throw unauthorized('API key expired', ERROR_CODES.EXPIRED_API_KEY);
  }
  if (row.tenantStatus !== 'active') {
    throw unauthorized(`Tenant ${row.tenantStatus}`, ERROR_CODES.TENANT_INACTIVE);
  }

  const ctx: CachedAuth = {
    tenantId: row.tenantId,
    tenantStatus: row.tenantStatus,
    keyId: row.keyId,
    role: row.role,
    tenantDbId: row.tenantDbId ?? null,
    hashedKey,
  };
  await writeKvCache(env.AUTH_CACHE, hashedKey, ctx);
  return toContext(ctx);
}

/**
 * Returns the API key only if the request can be authenticated, otherwise null.
 * Use for endpoints that have both authenticated and unauthenticated paths
 * (e.g. health endpoints that emit richer info to known callers).
 */
export async function tryAuthenticate(request: Request, env: ApiEnv): Promise<AuthContext | null> {
  try {
    return await authenticate(request, env);
  } catch {
    return null;
  }
}

/**
 * Enforces that an {@link AuthContext}'s role satisfies the minimum required
 * role for an operation. Roles are ordered admin > read_write > read_only.
 */
export function requireRole(auth: AuthContext, min: ApiKeyRole): void {
  const order: Record<ApiKeyRole, number> = { read_only: 0, read_write: 1, admin: 2 };
  if (order[auth.role] < order[min]) {
    throw unauthorized(`Requires ${min} role`, ERROR_CODES.INSUFFICIENT_ROLE);
  }
}

// -------------------- internals --------------------

function extractKey(header: string | null): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith('bearer ')) return trimmed.slice(7).trim() || null;
  return trimmed;
}

function getDb(env: ApiEnv): ControlPlaneDB {
  // biome-ignore lint/style/noNonNullAssertion: callers ensure binding exists
  return getControlPlaneDB(env.CONTROL_PLANE_DB!);
}

async function readKvCache(
  kv: KVNamespace | undefined,
  hashedKey: string,
): Promise<CachedAuth | null> {
  if (!kv) return null;
  try {
    return await kv.get<CachedAuth>(KV_PREFIX + hashedKey, 'json');
  } catch {
    return null;
  }
}

async function writeKvCache(
  kv: KVNamespace | undefined,
  hashedKey: string,
  value: CachedAuth,
): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(KV_PREFIX + hashedKey, JSON.stringify(value), {
      expirationTtl: KV_TTL_SECONDS,
    });
  } catch {
    // cache failures are non-fatal
  }
}

function toContext(c: CachedAuth): AuthContext {
  return {
    tenantId: c.tenantId,
    tenantStatus: c.tenantStatus,
    keyId: c.keyId,
    role: c.role,
    tenantDbId: c.tenantDbId,
  };
}
