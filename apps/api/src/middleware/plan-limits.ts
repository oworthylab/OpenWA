/**
 * Plan-based quota guards (US-048).
 *
 * Per-second rate limits live in `rate-limit.ts`; this module covers
 * the **monthly** and **steady-state** quotas: how many concurrent
 * sessions a tenant may own, and how many outbound messages per
 * calendar month they may send.
 *
 * Both functions throw {@link ApiError} so handlers can `await` them
 * inline without bespoke error plumbing.
 */

import { tenants } from '@openwa/db/control-plane';
import { getControlPlaneDB } from '@openwa/db/helpers';
import { ERROR_CODES } from '@openwa/shared/errors';
import { eq } from 'drizzle-orm';
import type { ApiEnv } from '../env.js';
import { ApiError, internal } from '../errors.js';
import { type PlanQuota, getPlan } from '../lib/plans.js';
import { type UsageMetric, getMonthlyUsage } from '../lib/usage.js';

const PLAN_CACHE_TTL_SECONDS = 60;
const PLAN_CACHE_PREFIX = 'plan:tenant:';

/** Reads the tenant's current plan, cached for 60 s in KV. */
export async function resolveTenantPlan(env: ApiEnv, tenantId: string): Promise<PlanQuota> {
  const kv = env.AUTH_CACHE;
  if (kv) {
    const cached = await kv.get(`${PLAN_CACHE_PREFIX}${tenantId}`);
    if (cached) return getPlan(cached);
  }
  if (!env.CONTROL_PLANE_DB) return getPlan('free');
  const db = getControlPlaneDB(env.CONTROL_PLANE_DB);
  const row = (
    await db.select({ plan: tenants.plan }).from(tenants).where(eq(tenants.id, tenantId)).limit(1)
  )[0];
  const planName = row?.plan ?? 'free';
  if (kv) {
    await kv.put(`${PLAN_CACHE_PREFIX}${tenantId}`, planName, {
      expirationTtl: PLAN_CACHE_TTL_SECONDS,
    });
  }
  return getPlan(planName);
}

/** Invalidate the cached plan after a billing webhook upgrades a tenant. */
export async function invalidatePlanCache(env: ApiEnv, tenantId: string): Promise<void> {
  if (!env.AUTH_CACHE) return;
  await env.AUTH_CACHE.delete(`${PLAN_CACHE_PREFIX}${tenantId}`);
}

export interface PlanLimitInput {
  env: ApiEnv;
  tenantId: string;
  /** Current count of the metric (e.g. number of active sessions). */
  currentCount: number;
  /** Cost of the in-flight operation in metric units. Default 1. */
  delta?: number;
}

/**
 * Throws 403 PLAN_LIMIT_EXCEEDED when `currentCount + delta > sessions`.
 */
export async function enforceSessionLimit(input: PlanLimitInput): Promise<void> {
  const plan = await resolveTenantPlan(input.env, input.tenantId);
  const delta = input.delta ?? 1;
  if (input.currentCount + delta > plan.sessions) {
    throw new ApiError({
      status: 403,
      code: ERROR_CODES.PLAN_LIMIT_EXCEEDED,
      message: `Plan limit reached: ${plan.sessions} concurrent session(s)`,
      details: { limit: plan.sessions, current: input.currentCount },
    });
  }
}

export interface MessageLimitInput {
  env: ApiEnv;
  tenantId: string;
  /** Metric name to check (defaults to `messages_sent`). */
  metric?: UsageMetric;
  delta?: number;
}

/**
 * Throws 429 MESSAGE_LIMIT_REACHED when the current month's
 * `messages_sent` counter has reached the plan ceiling.
 *
 * Returns the current counter value so callers can include it in
 * response headers (`X-Usage-Messages-Used`).
 */
export async function enforceMessageLimit(input: MessageLimitInput): Promise<number> {
  const metric = input.metric ?? 'messages_sent';
  const delta = input.delta ?? 1;
  const plan = await resolveTenantPlan(input.env, input.tenantId);
  const used = await getMonthlyUsage(input.env, input.tenantId, metric);
  if (used + delta > plan.messagesPerMonth) {
    throw new ApiError({
      status: 429,
      code: ERROR_CODES.MESSAGE_LIMIT_REACHED,
      message: `Monthly message limit reached (${plan.messagesPerMonth}). Upgrade your plan.`,
      details: { limit: plan.messagesPerMonth, used },
    });
  }
  return used;
}

/** Convenience helper for callers that want both numbers in one shot. */
export async function planSnapshot(
  env: ApiEnv,
  tenantId: string,
): Promise<{ plan: PlanQuota; planName: string }> {
  if (!env.CONTROL_PLANE_DB) {
    const plan = getPlan('free');
    return { plan, planName: 'free' };
  }
  const db = getControlPlaneDB(env.CONTROL_PLANE_DB);
  const row = (
    await db.select({ plan: tenants.plan }).from(tenants).where(eq(tenants.id, tenantId)).limit(1)
  )[0];
  if (!row) throw internal('tenant lookup failed');
  return { plan: getPlan(row.plan), planName: row.plan };
}
