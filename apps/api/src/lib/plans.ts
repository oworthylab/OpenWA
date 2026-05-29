/**
 * Pricing-plan definitions used by tenant registration, plan-based
 * limit guards (US-048), and the `/v1/billing/usage` endpoint
 * (US-049). The shape mirrors `docs/02-requirements-specification.md`
 * §4 (Plans & Limits) and is the single source of truth — other
 * modules MUST consume `PLANS` rather than hard-coding tiers.
 *
 * Per-second rate limits live separately in `middleware/rate-limit.ts`
 * (`PLAN_LIMITS`) to keep the hot path allocation-free; the two maps
 * are reconciled by `plan-rate-limit.test.ts`.
 */

import type { Tenant } from '@openwa/db/control-plane';

export type PlanName = 'free' | 'pro' | 'business' | 'enterprise';

export interface PlanQuota {
  /** Display name. */
  label: string;
  /** Maximum concurrent active sessions per tenant. */
  sessions: number;
  /** Outbound messages per calendar month (UTC). */
  messagesPerMonth: number;
  /** Inbound media storage cap in megabytes. */
  storageMb: number;
  /** Monthly price in USD (informational; the live price comes from Stripe). */
  monthlyUsd: number;
}

export const PLANS: Readonly<Record<PlanName, PlanQuota>> = Object.freeze({
  free: {
    label: 'Free',
    sessions: 2,
    messagesPerMonth: 1_000,
    storageMb: 100,
    monthlyUsd: 0,
  },
  pro: {
    label: 'Pro',
    sessions: 10,
    messagesPerMonth: 10_000,
    storageMb: 1_000,
    monthlyUsd: 29,
  },
  business: {
    label: 'Business',
    sessions: 50,
    messagesPerMonth: 100_000,
    storageMb: 10_000,
    monthlyUsd: 199,
  },
  enterprise: {
    label: 'Enterprise',
    sessions: 500,
    messagesPerMonth: 1_000_000,
    storageMb: 100_000,
    monthlyUsd: 999,
  },
});

export const PLAN_NAMES: readonly PlanName[] = ['free', 'pro', 'business', 'enterprise'];

/** Type-safe plan lookup; falls back to `free` for unknown values. */
export function getPlan(name: string | Tenant['plan'] | undefined | null): PlanQuota {
  if (name && (PLAN_NAMES as readonly string[]).includes(name)) {
    // biome-ignore lint/style/noNonNullAssertion: includes check guarantees presence
    return PLANS[name as PlanName]!;
  }
  return PLANS.free;
}

export function isPlanName(value: unknown): value is PlanName {
  return typeof value === 'string' && (PLAN_NAMES as readonly string[]).includes(value);
}
