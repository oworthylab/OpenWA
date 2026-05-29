/**
 * Single-tenant self-host mode (US-065).
 *
 * When `SELF_HOST_MODE='true'`:
 *
 *   1. `isSelfHostEnabled(env)` returns `true`.
 *   2. `/v1/auth/register` is rejected with 403 SELF_HOST_REGISTRATION_DISABLED.
 *   3. On every request, before authentication, `bootstrapSelfHost(env)`
 *      ensures exactly one tenant + one admin API key exist. The
 *      operation is idempotent and short-circuits via a KV flag
 *      (`self-host:bootstrapped`) after the first run.
 *   4. If `SELF_HOST_ADMIN_API_KEY` is set, the operator can use that
 *      key directly with `X-API-Key`. Otherwise the generated plaintext
 *      is logged once (level=warn) so it can be copied out of Logpush.
 *
 * Multi-tenant SaaS mode is the default. Any deployment where
 * `SELF_HOST_MODE` is unset behaves exactly as before.
 */

import { apiKeys, tenantMembers, tenants, users } from '@openwa/db/control-plane';
import { getControlPlaneDB } from '@openwa/db/helpers';
import { eq } from 'drizzle-orm';
import type { ApiEnv } from '../env.js';
import { getLogger } from '../middleware/logging.js';
import { generateApiKey, newId, parseApiKeyPrefix, sha256Hex } from './crypto.js';

const KV_BOOTSTRAP_KEY = 'self-host:bootstrapped';
const DEFAULT_TENANT_ID = 'self-host-tenant';
const DEFAULT_TENANT_NAME = 'Self-Host';
const DEFAULT_TENANT_SLUG = 'self-host';
const SYSTEM_USER_ID = 'self-host-system-user';
const SYSTEM_USER_EMAIL = 'system@self-host.local';
const SYSTEM_USER_NAME = 'Self-Host System';

export function isSelfHostEnabled(env: ApiEnv): boolean {
  return (env.SELF_HOST_MODE ?? '').toLowerCase() === 'true';
}

/**
 * Idempotently ensures the single self-host tenant + admin key exist.
 * Safe to call on every request; returns immediately when the KV flag
 * is set or when self-host mode is disabled.
 */
export async function bootstrapSelfHost(env: ApiEnv): Promise<void> {
  if (!isSelfHostEnabled(env)) return;
  if (!env.CONTROL_PLANE_DB) return;
  if (env.AUTH_CACHE) {
    const flag = await env.AUTH_CACHE.get(KV_BOOTSTRAP_KEY);
    if (flag === '1') return;
  }
  const db = getControlPlaneDB(env.CONTROL_PLANE_DB);
  const tenantId = env.SELF_HOST_TENANT_ID || DEFAULT_TENANT_ID;
  const tenantName = env.SELF_HOST_TENANT_NAME || DEFAULT_TENANT_NAME;

  const now = new Date();

  // 1. Upsert system user (FK target for the admin key).
  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, SYSTEM_USER_ID))
    .limit(1);
  if (!existingUser[0]) {
    await db.insert(users).values({
      id: SYSTEM_USER_ID,
      email: SYSTEM_USER_EMAIL,
      name: SYSTEM_USER_NAME,
      emailVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  // 2. Upsert tenant (insert-if-missing).
  const existing = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!existing[0]) {
    await db.insert(tenants).values({
      id: tenantId,
      name: tenantName,
      slug: DEFAULT_TENANT_SLUG,
      plan: 'enterprise',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(tenantMembers).values({
      tenantId,
      userId: SYSTEM_USER_ID,
      role: 'owner',
      joinedAt: now,
    });
  }

  // 3. Ensure exactly one active admin key.
  const keys = await db
    .select({ id: apiKeys.id, hashedKey: apiKeys.hashedKey })
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, tenantId))
    .limit(1);
  if (!keys[0]) {
    let plaintext: string;
    let prefix: string;
    if (env.SELF_HOST_ADMIN_API_KEY) {
      const operatorPrefix = parseApiKeyPrefix(env.SELF_HOST_ADMIN_API_KEY);
      if (!operatorPrefix) {
        getLogger(env).error('self-host.bootstrap', {
          err: 'SELF_HOST_ADMIN_API_KEY format invalid; expected openwa_<8>_<32>',
        });
        return;
      }
      plaintext = env.SELF_HOST_ADMIN_API_KEY;
      prefix = operatorPrefix;
    } else {
      const generated = generateApiKey();
      plaintext = generated.plaintext;
      prefix = generated.prefix;
      getLogger(env).warn('self-host.bootstrap', {
        msg: 'Generated admin API key — copy this value, it will not be shown again',
        apiKey: plaintext,
      });
    }
    const hashedKey = await sha256Hex(plaintext);
    await db.insert(apiKeys).values({
      id: newId(),
      tenantId,
      name: 'self-host-admin',
      prefix,
      hashedKey,
      role: 'admin',
      createdByUserId: SYSTEM_USER_ID,
      createdAt: now,
    });
  }

  if (env.AUTH_CACHE) {
    await env.AUTH_CACHE.put(KV_BOOTSTRAP_KEY, '1', { expirationTtl: 60 * 60 * 24 });
  }
}
