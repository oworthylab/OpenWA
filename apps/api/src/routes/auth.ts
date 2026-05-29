/**
 * Self-service tenant registration (US-047).
 *
 *  POST /v1/auth/register     create user + tenant + first admin key
 *  POST /v1/auth/verify-email confirm email via signed token
 *  POST /v1/auth/login        verify password, mint a fresh admin key
 *
 * These routes are intentionally **unauthenticated** — they are the
 * only way new tenants enter the system. The Worker's
 * `onBeforeHandle` skips `authenticate()` when no `x-api-key` header
 * is present, so this module does not need to opt out explicitly.
 *
 * Rate limiting per-IP is layered on top via `reg-rl:<ip>` KV
 * counters (5 attempts / hour) — when no KV is bound (unit tests),
 * the guard is a no-op.
 */

import { apiKeys, tenantMembers, tenants, users } from '@openwa/db/control-plane';
import { type ControlPlaneDB, getControlPlaneDB } from '@openwa/db/helpers';
import { ERROR_CODES } from '@openwa/shared/errors';
import { LoginSchema, RegisterSchema } from '@openwa/validators/auth';
import { VerifyEmailSchema } from '@openwa/validators/billing';
import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import * as v from 'valibot';
import type { ApiEnv } from '../env.js';
import { ApiError, conflict, internal, unauthorized, validationFailed } from '../errors.js';
import { writeAudit } from '../lib/audit.js';
import { generateApiKey, newId, sha256Hex } from '../lib/crypto.js';
import {
  hashPassword,
  issueVerificationToken,
  verifyPassword,
  verifyVerificationToken,
} from '../lib/password.js';
import { isSelfHostEnabled } from '../lib/self-host.js';
import { authenticate } from '../middleware/auth.js';

const REGISTRATION_IP_LIMIT = 5;
const REGISTRATION_IP_WINDOW_SECONDS = 60 * 60;
const VERIFICATION_TTL_SECONDS = 60 * 60 * 24;

function clientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

async function enforceIpRateLimit(env: ApiEnv, ip: string): Promise<void> {
  if (!env.AUTH_CACHE) return;
  const key = `reg-rl:${ip}`;
  const raw = await env.AUTH_CACHE.get(key);
  const current = raw ? Number.parseInt(raw, 10) : 0;
  if (current >= REGISTRATION_IP_LIMIT) {
    throw new ApiError({
      status: 429,
      code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
      message: 'Too many registration attempts. Try again later.',
      details: {
        retryAfter: REGISTRATION_IP_WINDOW_SECONDS,
        limit: REGISTRATION_IP_LIMIT,
        remaining: 0,
      },
    });
  }
  await env.AUTH_CACHE.put(key, String(current + 1), {
    expirationTtl: REGISTRATION_IP_WINDOW_SECONDS,
  });
}

function requireDb(env: ApiEnv): ControlPlaneDB {
  if (!env.CONTROL_PLANE_DB) throw internal('CONTROL_PLANE_DB binding missing');
  return getControlPlaneDB(env.CONTROL_PLANE_DB);
}

function requireTokenSecret(env: ApiEnv): string {
  if (!env.AUTH_TOKEN_SECRET) throw internal('AUTH_TOKEN_SECRET not configured');
  return env.AUTH_TOKEN_SECRET;
}

export function authRoutes(env: ApiEnv) {
  return (
    new Elysia({ aot: false, prefix: '/v1/auth' })
      // -------- POST /v1/auth/register --------
      .post('/register', async ({ body, request }) => {
        if (isSelfHostEnabled(env)) {
          throw new ApiError({
            status: 403,
            code: ERROR_CODES.SELF_HOST_REGISTRATION_DISABLED,
            message:
              'Self-host mode is enabled; tenant registration is disabled. Use the pre-provisioned admin API key.',
          });
        }
        const parsed = v.safeParse(RegisterSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        await enforceIpRateLimit(env, clientIp(request));

        const db = requireDb(env);
        const { email, password, name, tenantName, tenantSlug } = parsed.output;

        const dupEmail = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (dupEmail[0]) {
          throw conflict('Email already registered', ERROR_CODES.EMAIL_ALREADY_REGISTERED);
        }
        const dupSlug = await db
          .select({ id: tenants.id })
          .from(tenants)
          .where(eq(tenants.slug, tenantSlug))
          .limit(1);
        if (dupSlug[0]) {
          throw conflict('Tenant slug already taken', ERROR_CODES.TENANT_SLUG_TAKEN);
        }

        const userId = newId();
        const tenantId = newId();
        const apiKeyId = newId();
        const now = new Date();
        const passwordHash = await hashPassword(password);
        const { plaintext, prefix } = generateApiKey();
        const hashedKey = await sha256Hex(plaintext);

        await db.insert(users).values({
          id: userId,
          email,
          name,
          passwordHash,
          createdAt: now,
          updatedAt: now,
        });
        await db.insert(tenants).values({
          id: tenantId,
          name: tenantName,
          slug: tenantSlug,
          plan: 'free',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
        await db.insert(tenantMembers).values({
          tenantId,
          userId,
          role: 'owner',
          joinedAt: now,
        });
        await db.insert(apiKeys).values({
          id: apiKeyId,
          tenantId,
          name: 'default',
          prefix,
          hashedKey,
          role: 'admin',
          createdByUserId: userId,
          createdAt: now,
        });

        await writeAudit(db, {
          tenantId,
          action: 'tenant.create',
          resourceType: 'tenant',
          resourceId: tenantId,
          ipAddress: clientIp(request),
          userAgent: request.headers.get('user-agent') ?? undefined,
          metadata: { email, slug: tenantSlug },
        });

        // Email verification token — in production this is sent via
        // transactional email; in dev we log and return it inline so
        // the dashboard e2e can pick it up without an SMTP server.
        const verifyToken = env.AUTH_TOKEN_SECRET
          ? await issueVerificationToken({
              sub: userId,
              purpose: 'email_verify',
              ttlSeconds: VERIFICATION_TTL_SECONDS,
              secret: env.AUTH_TOKEN_SECRET,
            })
          : null;
        if (verifyToken && env.ENVIRONMENT !== 'production') {
          console.info('[auth.register] verification token for', email, verifyToken);
        }

        return Response.json(
          {
            tenant: { id: tenantId, name: tenantName, slug: tenantSlug, plan: 'free' },
            user: { id: userId, email, name },
            apiKey: { id: apiKeyId, prefix, key: plaintext, role: 'admin' },
            verificationToken:
              env.ENVIRONMENT === 'production' ? undefined : (verifyToken ?? undefined),
          },
          { status: 201 },
        );
      })
      // -------- POST /v1/auth/verify-email --------
      .post('/verify-email', async ({ body }) => {
        const parsed = v.safeParse(VerifyEmailSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        const secret = requireTokenSecret(env);
        const result = await verifyVerificationToken(parsed.output.token, secret);
        if (!result.valid) {
          if (result.reason === 'expired') {
            throw new ApiError({
              status: 400,
              code: ERROR_CODES.VERIFICATION_TOKEN_EXPIRED,
              message: 'Verification token expired',
            });
          }
          throw new ApiError({
            status: 400,
            code: ERROR_CODES.VERIFICATION_TOKEN_INVALID,
            message: 'Verification token invalid',
          });
        }
        if (result.payload.purpose !== 'email_verify') {
          throw new ApiError({
            status: 400,
            code: ERROR_CODES.VERIFICATION_TOKEN_INVALID,
            message: 'Wrong token purpose',
          });
        }
        const db = requireDb(env);
        await db
          .update(users)
          .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
          .where(eq(users.id, result.payload.sub));
        return Response.json({ verified: true });
      })
      // -------- POST /v1/auth/login --------
      .post('/login', async ({ body, request }) => {
        const parsed = v.safeParse(LoginSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        await enforceIpRateLimit(env, clientIp(request));
        const db = requireDb(env);
        const { email, password } = parsed.output;
        const row = (
          await db
            .select({
              id: users.id,
              passwordHash: users.passwordHash,
            })
            .from(users)
            .where(eq(users.email, email))
            .limit(1)
        )[0];
        // Always run verify against a placeholder when user missing
        // so timing leakage of "email exists?" is bounded.
        const passwordHash = row?.passwordHash ?? '';
        let ok = false;
        if (passwordHash) {
          ok = await verifyPassword(password, passwordHash);
        } else {
          // Run a dummy verify to consume similar CPU time.
          await verifyPassword(password, 'pbkdf2-sha256$1000$AAAA$AAAA');
        }
        if (!row || !ok) {
          throw unauthorized('Invalid credentials', ERROR_CODES.INVALID_CREDENTIALS);
        }
        await db
          .update(users)
          .set({ lastLoginAt: new Date(), updatedAt: new Date() })
          .where(eq(users.id, row.id));
        return Response.json({ userId: row.id });
      })
      // -------- POST /v1/auth/validate --------
      // Lightweight endpoint the dashboard hits with X-API-Key to confirm
      // the key works and discover the caller's role. Mirrors the legacy
      // NestJS endpoint so the existing SPA login flow keeps working.
      .post('/validate', async ({ request }) => {
        const auth = await authenticate(request, env);
        // Dashboard role enum is admin/operator/viewer; map API roles.
        const role =
          auth.role === 'admin' ? 'admin' : auth.role === 'read_write' ? 'operator' : 'viewer';
        return Response.json({
          valid: true,
          role,
          tenantId: auth.tenantId,
          keyId: auth.keyId,
        });
      })
      // GET form for convenience / health checks.
      .get('/validate', async ({ request }) => {
        const auth = await authenticate(request, env);
        const role =
          auth.role === 'admin' ? 'admin' : auth.role === 'read_write' ? 'operator' : 'viewer';
        return Response.json({
          valid: true,
          role,
          tenantId: auth.tenantId,
          keyId: auth.keyId,
        });
      })
  );
}
