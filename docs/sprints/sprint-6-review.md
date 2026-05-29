# Sprint 6 Review — Multi-Tenant SaaS & Billing

> **Status:** ✅ Backend slice delivered. Real Stripe wiring, transactional email,
> per-tenant D1 provisioning, and dashboard upgrade UI deferred to Sprint 7.

## Summary

Sprint 6 shipped the **backend** for self-service onboarding, plan-based
quotas, real-time usage metering, and Stripe-driven plan upgrades —
all four user stories (US-047 through US-050) landed with unit tests
and a closed control loop wired into the existing API. The omitted
pieces (live Stripe customer + price provisioning, transactional email,
per-tenant D1 spinning, dashboard checkout flow) are documented below.

## What shipped

### US-047 — Tenant registration

A new unauthenticated route group at `/v1/auth`:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/auth/register` | Create user + tenant + first admin API key |
| `POST` | `/v1/auth/verify-email` | Confirm email via HMAC-signed token |
| `POST` | `/v1/auth/login` | Verify password, mint a fresh admin key |

Implementation:

- `apps/api/src/lib/password.ts` — PBKDF2-SHA256 (310 000 iterations),
  portable encoding `pbkdf2-sha256$<iter>$<saltB64>$<hashB64>`,
  constant-time verify.
- Verification tokens: HMAC-signed payloads (`<payloadB64>.<sigB64>`)
  with 24-hour TTL and explicit `purpose` field so an email-verify
  token can't be replayed as a password-reset.
- Per-IP registration rate limit (`reg-rl:<ip>`, 5 / hour) via KV.
- Audit log entries on tenant creation.
- Duplicate-email and duplicate-slug conflicts return distinct
  `EMAIL_ALREADY_REGISTERED` / `TENANT_SLUG_TAKEN` codes.

### US-048 — Plan-based limits

- `apps/api/src/lib/plans.ts` — frozen `PLANS` record (free / pro /
  business / enterprise) defining concurrent-session, monthly-message,
  and storage caps. Single source of truth for plan tiers.
- `apps/api/src/middleware/plan-limits.ts` — `enforceSessionLimit` and
  `enforceMessageLimit` throw `PLAN_LIMIT_EXCEEDED` (403) and
  `MESSAGE_LIMIT_REACHED` (429) respectively.
- Wired into `POST /v1/sessions` (counts active sessions before insert)
  and both `/v1/sessions/:id/messages/{text,media}` endpoints (checks
  monthly counter before forwarding to the engine).
- Plan lookups cached in KV for 60 s (`plan:tenant:<id>`) and
  invalidated on every billing webhook.

### US-049 — Usage metering

- `apps/api/src/lib/usage.ts` — KV-backed counters keyed
  `usage:{tenantId}:{m|d}:{period}:{metric}`. Monthly buckets expire
  after 90 days, daily buckets after 60 days.
- Five metrics: `messages_sent`, `messages_received`, `api_calls`,
  `media_bytes`, `active_sessions`.
- `GET /v1/billing/usage` returns the current month's snapshot plus
  the resolved plan ceilings.
- `incrementUsage` called from both message-send handlers; engine
  worker can push inbound counts via the existing event pipeline in a
  future sprint.

### US-050 — Stripe billing integration

- `apps/api/src/lib/stripe.ts` — minimal REST client (no `stripe` npm
  package; ~150 LOC) covering:
  - `verifyWebhookSignature` (HMAC-SHA256 over `${ts}.${payload}`,
    5-minute tolerance window, constant-time hex compare).
  - `createCheckoutSession` (POSTs `x-www-form-urlencoded` to
    `https://api.stripe.com/v1/checkout/sessions`).
- `POST /v1/billing/checkout` — admin-only; returns the hosted
  checkout URL. When `STRIPE_SECRET` is unset, returns a deterministic
  stub URL so dev + e2e flows don't require a Stripe account.
- `POST /v1/billing/webhooks` — signature-gated, **unauthenticated**
  by design. Idempotent via KV (`billing:event:<id>`, 24 h TTL).
  Handles `checkout.session.completed` (upgrades tenant plan) and
  `customer.subscription.deleted` (downgrades to free).
- `GET /v1/billing/plans` — public catalogue for the dashboard.

### Test coverage

| File | Tests |
|---|---|
| `apps/api/test/password.test.ts` | 11 (round-trip, salt randomness, tamper, expiry, wrong-secret) |
| `apps/api/test/plans.test.ts` | 7 (catalogue, ordering, fallback, type guard) |
| `apps/api/test/usage.test.ts` | 7 (period keys, per-tenant isolation, snapshot) |
| `apps/api/test/stripe.test.ts` | 7 (valid, missing, malformed, no-v1, stale ts, mismatch, wrong secret) |
| `apps/api/test/auth-billing-routes.test.ts` | 7 (validation, public catalogue, 401/503/400 envelopes) |

Total Sprint 6 additions: **39 tests**. Repository total: **76 API
unit tests + 14 desktop unit tests**, all green.

### Error code surface

`@openwa/shared/errors` gained six new codes:

- `MESSAGE_LIMIT_REACHED`
- `PLAN_LIMIT_EXCEEDED`
- `BILLING_NOT_CONFIGURED`
- `STRIPE_SIGNATURE_INVALID`
- `EMAIL_ALREADY_REGISTERED`
- `TENANT_SLUG_TAKEN`
- `VERIFICATION_TOKEN_INVALID` / `_EXPIRED`
- `INVALID_CREDENTIALS`

## Deferred to Sprint 7

| Item | Why deferred | Workaround in place |
|---|---|---|
| Real Stripe product/price provisioning | Requires live Stripe account + script | Price ids derived as `price_openwa_<plan>_monthly`; ops sets them in Stripe dashboard |
| Transactional email (SES / Resend / Postmark) | No email vendor selected | Verification token logged + returned in dev response when `ENVIRONMENT !== 'production'` |
| Per-tenant D1 provisioning | Cloudflare API needs admin token + binding hot-swap, big change | All tenant data continues to use the shared control-plane with `tenant_id` scoping |
| Dashboard registration + upgrade UI | Frontend slice, separate work stream | Backend exposes everything the dashboard needs |
| Scheduled D1 reconciliation of KV counters | Needs CF cron trigger | KV counters are authoritative for the billing period |
| `customer.subscription.updated` (plan-change mid-cycle) | Edge case; needs proration logic | Only `completed` + `deleted` handled |
| Stripe customer portal links | Requires customer portal config | Tenants must contact support for cancellations |
| CAPTCHA on registration | Reduces but doesn't eliminate spam; IP rate limit covers MVP | `reg-rl:<ip>` 5/hour |

## Open risks

1. **PBKDF2 iterations.** 310 000 iters of PBKDF2-SHA256 sits roughly
   3× under OWASP's 2023 recommendation (≥600 000). Raise after
   benchmarking the Worker CPU budget under load.
2. **KV eventual consistency.** Two concurrent message sends in the
   same second may both read the same counter and undercount by 1.
   Acceptable for fast-path enforcement; a nightly D1 reconciliation
   from the audit log is still needed for billing-grade accuracy.
3. **No webhook event log.** Successful Stripe events are processed
   then forgotten (only the idempotency key persists in KV for 24 h).
   Add a `billing_events` table in Sprint 7 before going live.
4. **Login does not issue a session token.** It only confirms
   credentials. The dashboard relies on the admin API key returned at
   registration. A real session/JWT layer arrives with the dashboard
   work in Sprint 7.

## Pipeline status

```
bunx tsc -b --force        # clean
bunx turbo run lint        # 5/5 packages green
bunx turbo run test        # 90 tests, 0 failures
```

## Files added

```
apps/api/src/lib/password.ts
apps/api/src/lib/plans.ts
apps/api/src/lib/usage.ts
apps/api/src/lib/stripe.ts
apps/api/src/middleware/plan-limits.ts
apps/api/src/routes/auth.ts
apps/api/src/routes/billing.ts
apps/api/test/password.test.ts
apps/api/test/plans.test.ts
apps/api/test/usage.test.ts
apps/api/test/stripe.test.ts
apps/api/test/auth-billing-routes.test.ts
packages/validators/src/billing.ts
docs/sprints/sprint-6-review.md
```

## Files modified

```
apps/api/src/app.ts                       # wire authRoutes + billingRoutes
apps/api/src/env.ts                       # AUTH_TOKEN_SECRET, STRIPE_SECRET, STRIPE_WEBHOOK_SECRET
apps/api/src/routes/sessions.ts           # plan-limit guards + usage counters
packages/shared/src/errors/index.ts       # 9 new error codes
packages/validators/src/index.ts          # re-export billing
packages/validators/package.json          # ./billing subpath
```
