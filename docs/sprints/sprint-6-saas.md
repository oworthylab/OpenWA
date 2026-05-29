# Sprint 6 — Multi-Tenant SaaS & Billing

## Sprint Goal

Implement multi-tenant registration, plan-based limits, usage metering, and Stripe billing integration — enabling OpenWA to operate as a self-service SaaS platform where users can register, choose plans, and scale usage with automated billing.

## Sprint Duration & Dates

| Field | Value |
|-------|-------|
| Sprint # | 6 |
| Start Date | 2026-08-18 (Monday) |
| End Date | 2026-08-29 (Friday) |
| Working Days | 10 |
| Phase | Phase 6 — Multi-Tenant SaaS & Billing |

## Capacity

| Team Member | Role | Available Days | Notes |
|-------------|------|---------------|-------|
| Dev A | Senior Full-Stack | 10 | Registration flow + plan enforcement |
| Dev B | Backend/Infra | 10 | Metering + billing webhook handler |
| Dev C | Frontend | 10 | Dashboard pages for usage/billing |
| **Total** | | **30 person-days** | ~30 story points capacity |

## Sprint Backlog

| Story ID | Title | Points | Assignee | Priority | Dependencies | Status |
|----------|-------|--------|----------|----------|--------------|--------|
| US-047 | Tenant Registration | 5 | Dev A + Dev C | Must-have | None | — |
| US-048 | Plan-Based Limits | 5 | Dev A + Dev C | Must-have | US-047 | — |
| US-049 | Usage Metering | 5 | Dev B + Dev C | Must-have | US-047 | — |
| US-050 | Billing Integration | 8 | Dev B + Dev C | Must-have | US-047, US-048, US-049 | — |

**Total: 23 points** (within 30-point velocity — remaining capacity for Stripe edge cases, webhook testing, and security hardening)

## Day-by-Day Schedule

### Week 1 (August 18–22)

| Day | Dev A (Full-Stack) | Dev B (Backend/Infra) | Dev C (Frontend) |
|-----|-------------------|----------------------|------------------|
| **D1 Mon** | US-047: Registration endpoint (POST /auth/register — name, email, password, tenant name) | US-050: Stripe account setup, product/price creation (Free/Pro/Business) | US-047: Registration page UI (form, validation, loading states) |
| **D2 Tue** | US-047: Email verification flow (send token → verify endpoint → activate account) | US-049: Usage counter design (KV key schema, increment/read helpers, TTL strategy) | US-047: Registration form validation, success redirect, email sent confirmation |
| **D3 Wed** | US-047: Tenant provisioning (create D1 database, store binding ID, generate first API key) | US-049: Message count tracking (per-send increment in KV, daily/monthly rollup keys) | US-047: Onboarding flow (first session creation wizard, API key display) |
| **D4 Thu** | US-048: Plan definitions (Free: 2 sessions/1k msg, Pro: 10/10k, Business: 50/100k), limit config in tenant record | US-049: Session count tracking, media storage byte tracking | US-048: Plan comparison page (feature matrix, pricing cards) |
| **D5 Fri** | US-048: Enforce session limit on create (403 + upgrade prompt), message limit on send (429 + remaining count) | US-049: API call counter (per-request middleware, per-minute + per-day buckets) | US-049: Usage dashboard page (gauges for sessions/messages/storage, daily history chart) |

### Week 2 (August 25–29)

| Day | Dev A (Full-Stack) | Dev B (Backend/Infra) | Dev C (Frontend) |
|-----|-------------------|----------------------|------------------|
| **D6 Mon** | US-048: Rate limiting per plan (Free: 10 req/s, Pro: 50, Business: 200), 429 responses with headers | US-050: Stripe Checkout session creation endpoint (POST /billing/checkout) | US-050: Upgrade button → Stripe Checkout redirect, success/cancel return URLs |
| **D7 Tue** | US-048: Plan upgrade/downgrade logic (immediate upgrade, end-of-period downgrade) | US-050: Stripe webhook handler (checkout.session.completed → update tenant plan, provision limits) | US-050: Billing settings page (current plan, next invoice, payment method, invoices list) |
| **D8 Wed** | US-048: Grace period on failed payment (3 days warning → freeze account, restore on payment) | US-050: Subscription lifecycle webhooks (invoice.paid, invoice.payment_failed, customer.subscription.deleted) | US-050: Alert banners (approaching limit 80%/95%, payment failed, account frozen) |
| **D9 Thu** | E2E tests: registration flow, plan limits, 403/429 responses, upgrade path | E2E tests: usage metering accuracy, webhook signature verification, idempotency | E2E-frontend: registration, upgrade flow, usage page, billing settings |
| **D10 Fri** | Sprint Review prep, security audit of billing flows | Sprint Review prep, Stripe test mode demo | Sprint Review: Full SaaS demo |

## Technical Tasks

### US-047: Tenant Registration (5 pts) — Dev A + Dev C

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Registration endpoint | 2h | POST /auth/register — validate input, hash password (Argon2id), create user + tenant records |
| 2 | Email verification | 3h | Generate verification token (HMAC-signed, 24h expiry), send via email service (Resend/SendGrid), verify endpoint |
| 3 | Tenant provisioning | 3h | On verification: create D1 database for tenant, store binding in control plane, apply migrations |
| 4 | API key generation | 1.5h | Generate first admin API key, display once on registration complete, store hashed |
| 5 | Registration page | 2h | Form: name, email, password, tenant name; client-side validation; loading/error states |
| 6 | Email verification page | 1h | Token from URL → verify → success redirect to dashboard |
| 7 | Onboarding wizard | 2h | Step 1: copy API key, Step 2: create first session, Step 3: configure webhook |
| 8 | Rate limit registration | 1h | 5 registrations per IP per hour, CAPTCHA on suspicious patterns |
| 9 | Duplicate detection | 1h | Check email uniqueness, tenant name uniqueness, friendly error messages |

### US-048: Plan-Based Limits (5 pts) — Dev A

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Plan schema | 1.5h | Plan definitions table: name, session_limit, message_limit_monthly, storage_limit_mb, rate_limit_per_second |
| 2 | Limit enforcement middleware | 3h | Pre-request check: session count, message count, storage usage against plan limits |
| 3 | Session limit guard | 1.5h | On POST /sessions: count active sessions → reject if >= plan limit → 403 with limit details |
| 4 | Message limit guard | 1.5h | On POST /messages/send: check monthly count → reject if >= limit → 429 with reset time |
| 5 | Rate limiter per plan | 2h | Sliding window counter in KV, per-tenant, configurable by plan tier |
| 6 | Upgrade/downgrade logic | 3h | Upgrade: immediate effect, prorate billing. Downgrade: end of period, queue limit reduction |
| 7 | Grace period handling | 2h | Payment failed → 3-day grace → freeze (reject all API calls except billing) → restore on payment |
| 8 | Plan comparison page | 1.5h | Feature matrix, pricing, CTA buttons, current plan indicator |
| 9 | Limit response headers | 1h | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` on all responses |

### US-049: Usage Metering (5 pts) — Dev B + Dev C

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | KV key design | 1h | Pattern: `usage:{tenantId}:{metric}:{period}` — e.g., `usage:t1:messages:2026-08` |
| 2 | Counter increment helper | 1.5h | Atomic increment in KV, handle race conditions, batch writes where possible |
| 3 | Message metering | 2h | Increment on successful send, track by type (text/media/template) |
| 4 | Session metering | 1h | Track active session count, session-hours for usage reports |
| 5 | Storage metering | 1.5h | Track media bytes uploaded, per-tenant running total |
| 6 | API call metering | 1.5h | Per-request middleware: increment call counter, track by endpoint category |
| 7 | Daily reconciliation | 2h | Scheduled Worker: sum KV counters → write to D1 for historical reporting |
| 8 | Usage query endpoint | 1.5h | GET /billing/usage — current period totals, daily breakdown, comparison to limits |
| 9 | Usage dashboard | 3h | Gauges (sessions, messages, storage), daily chart, "X% of limit" indicators |
| 10 | Approaching-limit alerts | 1.5h | Trigger at 80% and 95% usage, emit webhook event, show in-app banner |

### US-050: Billing Integration (8 pts) — Dev B + Dev C

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Stripe product setup | 1h | Create Products + Prices in Stripe (Free=no charge, Pro=$29/mo, Business=$99/mo) |
| 2 | Customer creation | 1.5h | Create Stripe Customer on tenant registration, store customer ID in tenant record |
| 3 | Checkout endpoint | 2h | POST /billing/checkout — create Stripe Checkout Session, return URL for redirect |
| 4 | Checkout success handling | 1.5h | Success URL callback → show confirmation, poll for webhook completion |
| 5 | Webhook endpoint | 3h | POST /billing/webhooks — verify signature, handle: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.deleted |
| 6 | Webhook idempotency | 1.5h | Store processed event IDs, skip duplicates, handle out-of-order delivery |
| 7 | Plan update on payment | 2h | On successful checkout → update tenant plan, apply new limits immediately |
| 8 | Subscription cancellation | 1.5h | Handle voluntary cancel (end-of-period) + involuntary (payment failures) |
| 9 | Customer portal | 1h | Stripe Customer Portal integration for payment method updates, invoice history |
| 10 | Billing settings page | 2.5h | Current plan, usage summary, upgrade/downgrade buttons, invoice list, payment method |
| 11 | Alert banners | 1.5h | Payment failed warning, account frozen notice, approaching limit alerts |
| 12 | Webhook security | 1.5h | Verify Stripe signatures, reject replays, log all events to audit trail |
| 13 | Test mode configuration | 1h | Environment-based Stripe keys (test/live), test clock support for billing cycles |

## End-to-End Tests

### Backend E2E Tests

| # | Test | Description |
|---|------|-------------|
| 1 | Registration happy path | POST /auth/register → verify email → tenant provisioned → API key returned |
| 2 | Duplicate email rejection | Register with existing email → 409 Conflict |
| 3 | Session limit enforcement | Free plan: create 3rd session → 403 with upgrade prompt |
| 4 | Message limit enforcement | Exhaust monthly messages → 429 with reset time |
| 5 | Rate limit enforcement | Exceed per-second limit → 429 with Retry-After header |
| 6 | Usage counter accuracy | Send 100 messages → GET /billing/usage → count = 100 |
| 7 | Plan upgrade flow | Checkout complete webhook → plan updated → higher limits active |
| 8 | Plan downgrade | Cancel subscription → limits reduce at end of period |
| 9 | Webhook signature verification | Invalid signature → 401, valid → processed |
| 10 | Webhook idempotency | Send same event twice → only processed once |
| 11 | Grace period | Payment fails → 3 days pass → account frozen → pay → restored |
| 12 | Registration rate limit | 6th registration from same IP → 429 |

### Frontend E2E Tests (Playwright)

| # | Test | Description |
|---|------|-------------|
| 1 | Registration page | Fill form → submit → email confirmation page shown |
| 2 | Onboarding wizard | Complete 3 steps → dashboard with active session |
| 3 | Usage dashboard | Displays gauges, chart loads, values match API |
| 4 | Plan comparison | All plans displayed, current plan highlighted |
| 5 | Upgrade flow | Click upgrade → redirect to Stripe Checkout (mocked) → success page |
| 6 | Billing settings | Current plan, invoices list, manage payment link |
| 7 | Limit warning banner | At 80% usage → yellow banner displayed |
| 8 | Account frozen state | Frozen account → all actions blocked → upgrade prompt shown |

## Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | Stripe webhook reliability in staging | Medium | Medium | Use Stripe CLI (`stripe listen --forward-to`) for local testing; implement retry queue for missed events |
| 2 | D1 database provisioning API not public | High | Critical | Workaround: pre-provision pool of 100 D1 databases, assign on registration; monitor pool size, alert at 20% remaining |
| 3 | KV eventual consistency affects usage display | Low | Low | Show "approximate" badge on real-time counters, reconcile daily via scheduled Worker |
| 4 | Plan downgrade edge cases (active sessions > new limit) | Medium | Medium | Queue enforcement for end-of-period; notify user to reduce sessions, don't force-disconnect |
| 5 | Stripe Checkout abandonment (user doesn't complete) | Medium | Low | Track incomplete checkouts, send reminder email after 24h, expire sessions after 48h |
| 6 | Race condition on concurrent usage increments | Low | Medium | KV atomic operations; over-count is acceptable (reconcile daily), under-count is not |

## Sprint Review Checklist

- [ ] New user can register via /register page
- [ ] Email verification link works → account activated
- [ ] Onboarding wizard completes → first session created
- [ ] Free plan limits enforced (2 sessions, 1k messages/month)
- [ ] 403 response includes clear upgrade path
- [ ] Usage dashboard shows real-time message/session/storage counts
- [ ] 80% usage threshold triggers in-app warning banner
- [ ] Upgrade button → Stripe Checkout → payment → plan upgraded
- [ ] Upgraded tenant immediately gets higher limits
- [ ] Billing settings shows current plan, invoices, payment method
- [ ] Webhook handles payment failure → grace period → account freeze
- [ ] Rate limiting responds with correct 429 + headers per plan tier
- [ ] All backend e2e tests pass (12/12)
- [ ] All frontend e2e tests pass (8/8)

## Definition of Done Verification

```bash
# Run full test suite
bun run test
# Expected: all unit tests pass, coverage > 80% for billing module

# Backend e2e tests
cd e2e
bun run test:billing
# Expected: 12/12 tests pass (registration, limits, metering, webhooks)

# Frontend e2e tests
cd e2e-frontend
bun run test:saas
# Expected: 8/8 tests pass (registration, usage, billing UI flows)

# Verify registration flow
curl -X POST http://localhost:8787/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","password":"SecureP@ss1","tenantName":"my-company"}'
# Expected: 201 Created, verification email sent

# Verify plan limits
curl -X POST http://localhost:8787/sessions \
  -H "Authorization: Bearer <free-plan-key>" \
  -H "Content-Type: application/json" \
  -d '{"name":"session-3"}'
# Expected: 403 Forbidden (limit: 2 sessions for Free plan)

# Verify usage endpoint
curl http://localhost:8787/billing/usage \
  -H "Authorization: Bearer <api-key>"
# Expected: JSON with messages_used, sessions_active, storage_bytes, limits

# Verify Stripe webhook handling
stripe trigger checkout.session.completed --forward-to localhost:8787/billing/webhooks
# Expected: tenant plan updated, 200 response

# Verify rate limiting
for i in $(seq 1 15); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/sessions -H "Authorization: Bearer <free-key>"; done
# Expected: first 10 return 200, remaining return 429

# Typecheck
bun run typecheck
# Expected: 0 errors across all packages

# Lint
bun run lint
# Expected: 0 errors, 0 warnings
```

---
