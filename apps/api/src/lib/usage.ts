/**
 * Usage metering helpers (US-049).
 *
 * Writes are KV-backed so the hot path remains <2 ms even on the free
 * Workers tier — D1 is reserved for reconciliation jobs (deferred to
 * Sprint 7). Counters are bucketed per calendar month (UTC) and per
 * day, both keyed by tenant; reads collapse a per-tenant period into
 * a `UsageSnapshot` consumed by `/v1/billing/usage`.
 *
 * Key layout:
 *   `usage:{tenantId}:m:{YYYY-MM}:{metric}`  → monthly counter
 *   `usage:{tenantId}:d:{YYYY-MM-DD}:{metric}` → daily counter
 *
 * Monthly counters expire 90 days after the period ends so the KV
 * footprint stays bounded; daily counters expire after 60 days.
 *
 * **Race semantics.** Cloudflare KV is eventually consistent — two
 * concurrent `incrementUsage` calls may both read the same value and
 * write the same +1. The acceptable error for billing-grade metering
 * is bounded by the reconciliation job that replays the audit log
 * into D1 nightly; this module is the realtime fast path only.
 */

import type { ApiEnv } from '../env.js';

export type UsageMetric =
  | 'messages_sent'
  | 'messages_received'
  | 'api_calls'
  | 'media_bytes'
  | 'active_sessions';

export const USAGE_METRICS: readonly UsageMetric[] = [
  'messages_sent',
  'messages_received',
  'api_calls',
  'media_bytes',
  'active_sessions',
];

export interface UsageSnapshot {
  period: string; // YYYY-MM
  counters: Record<UsageMetric, number>;
}

const MONTH_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days
const DAY_TTL_SECONDS = 60 * 60 * 24 * 60; // 60 days

/** Returns the current UTC period key, e.g. `2026-06`. */
export function currentPeriod(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Returns the current UTC day key, e.g. `2026-06-15`. */
export function currentDay(now: Date = new Date()): string {
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${currentPeriod(now)}-${d}`;
}

function monthKey(tenantId: string, period: string, metric: UsageMetric): string {
  return `usage:${tenantId}:m:${period}:${metric}`;
}
function dayKey(tenantId: string, day: string, metric: UsageMetric): string {
  return `usage:${tenantId}:d:${day}:${metric}`;
}

async function readNumber(kv: KVNamespace, key: string): Promise<number> {
  const raw = await kv.get(key);
  if (raw === null) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Atomic-from-the-caller's-perspective increment of `metric` for the
 * given tenant by `delta` (default 1). Updates both the month and
 * day buckets. No-op (returns 0) when no KV binding is configured —
 * this keeps dev/test envs without bindings booting cleanly.
 */
export async function incrementUsage(
  env: ApiEnv,
  tenantId: string,
  metric: UsageMetric,
  delta = 1,
  now: Date = new Date(),
): Promise<number> {
  const kv = env.AUTH_CACHE;
  if (!kv || delta === 0) return 0;
  const period = currentPeriod(now);
  const day = currentDay(now);
  const mk = monthKey(tenantId, period, metric);
  const dk = dayKey(tenantId, day, metric);
  const [mCurr, dCurr] = await Promise.all([readNumber(kv, mk), readNumber(kv, dk)]);
  const mNext = mCurr + delta;
  const dNext = dCurr + delta;
  await Promise.all([
    kv.put(mk, String(mNext), { expirationTtl: MONTH_TTL_SECONDS }),
    kv.put(dk, String(dNext), { expirationTtl: DAY_TTL_SECONDS }),
  ]);
  return mNext;
}

/** Reads the month counter for a single metric. */
export async function getMonthlyUsage(
  env: ApiEnv,
  tenantId: string,
  metric: UsageMetric,
  period: string = currentPeriod(),
): Promise<number> {
  if (!env.AUTH_CACHE) return 0;
  return readNumber(env.AUTH_CACHE, monthKey(tenantId, period, metric));
}

/** Reads the entire monthly snapshot for a tenant. */
export async function getUsageSnapshot(
  env: ApiEnv,
  tenantId: string,
  period: string = currentPeriod(),
): Promise<UsageSnapshot> {
  const counters = Object.fromEntries(USAGE_METRICS.map((m) => [m, 0])) as Record<
    UsageMetric,
    number
  >;
  if (!env.AUTH_CACHE) return { period, counters };
  await Promise.all(
    USAGE_METRICS.map(async (m) => {
      // biome-ignore lint/style/noNonNullAssertion: KV checked above
      counters[m] = await readNumber(env.AUTH_CACHE!, monthKey(tenantId, period, m));
    }),
  );
  return { period, counters };
}
