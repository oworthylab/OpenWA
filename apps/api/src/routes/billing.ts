/**
 * Billing endpoints (US-049, US-050).
 *
 *  GET  /v1/billing/plans     plan catalogue (public)
 *  GET  /v1/billing/usage     current period usage + plan ceilings
 *  POST /v1/billing/checkout  start a Stripe Checkout session
 *  POST /v1/billing/webhooks  Stripe webhook handler (signature-gated)
 *
 * The webhook endpoint is **unauthenticated by design** — it verifies
 * the `Stripe-Signature` header on the raw request body instead. The
 * other endpoints require an admin API key.
 */

import { tenants } from '@openwa/db/control-plane';
import { getControlPlaneDB } from '@openwa/db/helpers';
import { ERROR_CODES } from '@openwa/shared/errors';
import { CheckoutSchema } from '@openwa/validators/billing';
import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import * as v from 'valibot';
import type { ApiEnv } from '../env.js';
import { ApiError, internal, validationFailed } from '../errors.js';
import { writeAudit } from '../lib/audit.js';
import { PLANS, type PlanName, isPlanName } from '../lib/plans.js';
import { createCheckoutSession, verifyWebhookSignature } from '../lib/stripe.js';
import { getUsageSnapshot } from '../lib/usage.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { invalidatePlanCache, resolveTenantPlan } from '../middleware/plan-limits.js';

/** Maps an internal plan name to the Stripe price id (env-driven in prod). */
function priceIdFor(plan: PlanName): string {
  return `price_openwa_${plan}_monthly`;
}

export function billingRoutes(env: ApiEnv) {
  return (
    new Elysia({ aot: false, prefix: '/v1/billing' })
      // -------- GET /v1/billing/plans (public) --------
      .get('/plans', () => Response.json({ plans: PLANS }))
      // -------- GET /v1/billing/usage --------
      .get('/usage', async ({ request }) => {
        const auth = await authenticate(request, env);
        const plan = await resolveTenantPlan(env, auth.tenantId);
        const snapshot = await getUsageSnapshot(env, auth.tenantId);
        return Response.json({
          period: snapshot.period,
          plan,
          usage: snapshot.counters,
        });
      })
      // -------- POST /v1/billing/checkout --------
      .post('/checkout', async ({ body, request }) => {
        const auth = await authenticate(request, env);
        requireRole(auth, 'admin');
        const parsed = v.safeParse(CheckoutSchema, body);
        if (!parsed.success) throw validationFailed(parsed.issues);
        if (!env.CONTROL_PLANE_DB) throw internal('CONTROL_PLANE_DB missing');
        const db = getControlPlaneDB(env.CONTROL_PLANE_DB);
        const tenant = (
          await db
            .select({ id: tenants.id, stripeCustomerId: tenants.stripeCustomerId })
            .from(tenants)
            .where(eq(tenants.id, auth.tenantId))
            .limit(1)
        )[0];
        if (!tenant) throw internal('tenant missing');
        const session = await createCheckoutSession(env.STRIPE_SECRET, {
          tenantId: tenant.id,
          priceId: priceIdFor(parsed.output.plan),
          customerId: tenant.stripeCustomerId,
          successUrl: parsed.output.successUrl,
          cancelUrl: parsed.output.cancelUrl,
        });
        await writeAudit(db, {
          tenantId: auth.tenantId,
          apiKeyId: auth.keyId,
          action: 'billing.checkout.create',
          resourceType: 'checkout_session',
          resourceId: session.id,
          metadata: { plan: parsed.output.plan, stub: session.stub },
        });
        return Response.json(session, { status: 201 });
      })
      // -------- POST /v1/billing/webhooks --------
      .post('/webhooks', async ({ request }) => {
        if (!env.STRIPE_WEBHOOK_SECRET) {
          throw new ApiError({
            status: 503,
            code: ERROR_CODES.BILLING_NOT_CONFIGURED,
            message: 'Stripe webhook secret not configured',
          });
        }
        const sigHeader = request.headers.get('stripe-signature');
        const raw = await request.text();
        const verify = await verifyWebhookSignature(raw, sigHeader, env.STRIPE_WEBHOOK_SECRET);
        if (!verify.valid) {
          throw new ApiError({
            status: 400,
            code: ERROR_CODES.STRIPE_SIGNATURE_INVALID,
            message: `Invalid Stripe signature: ${verify.reason}`,
          });
        }
        let event: StripeEvent;
        try {
          event = JSON.parse(raw) as StripeEvent;
        } catch {
          throw new ApiError({
            status: 400,
            code: ERROR_CODES.BAD_REQUEST,
            message: 'Malformed Stripe event body',
          });
        }
        // Idempotency: skip events we've already processed (KV-backed,
        // 24 h TTL — well over Stripe's redelivery window).
        if (env.AUTH_CACHE) {
          const idemKey = `billing:event:${event.id}`;
          const seen = await env.AUTH_CACHE.get(idemKey);
          if (seen) return Response.json({ received: true, deduped: true });
          await env.AUTH_CACHE.put(idemKey, '1', { expirationTtl: 60 * 60 * 24 });
        }
        await handleStripeEvent(env, event);
        return Response.json({ received: true });
      })
  );
}

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

async function handleStripeEvent(env: ApiEnv, event: StripeEvent): Promise<void> {
  if (!env.CONTROL_PLANE_DB) return;
  const db = getControlPlaneDB(env.CONTROL_PLANE_DB);
  switch (event.type) {
    case 'checkout.session.completed': {
      const obj = event.data.object as {
        client_reference_id?: string;
        customer?: string;
        metadata?: { plan?: string };
      };
      const tenantId = obj.client_reference_id;
      const plan = obj.metadata?.plan;
      if (tenantId && isPlanName(plan)) {
        await db
          .update(tenants)
          .set({
            plan,
            stripeCustomerId: obj.customer ?? null,
            updatedAt: new Date(),
          })
          .where(eq(tenants.id, tenantId));
        await invalidatePlanCache(env, tenantId);
        await writeAudit(db, {
          tenantId,
          action: 'billing.subscription.activated',
          resourceType: 'tenant',
          resourceId: tenantId,
          metadata: { plan, eventId: event.id },
        });
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const obj = event.data.object as { metadata?: { tenant_id?: string } };
      const tenantId = obj.metadata?.tenant_id;
      if (tenantId) {
        await db
          .update(tenants)
          .set({ plan: 'free', updatedAt: new Date() })
          .where(eq(tenants.id, tenantId));
        await invalidatePlanCache(env, tenantId);
        await writeAudit(db, {
          tenantId,
          action: 'billing.subscription.cancelled',
          resourceType: 'tenant',
          resourceId: tenantId,
          metadata: { eventId: event.id },
        });
      }
      break;
    }
    default:
      // Unhandled event types are acknowledged but ignored — Stripe
      // retries only on non-2xx responses.
      break;
  }
}
