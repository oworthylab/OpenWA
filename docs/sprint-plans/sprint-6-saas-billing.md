# Sprint 6 — Multi-Tenant SaaS & Billing

## Sprint Goal

Implement the complete multi-tenant SaaS infrastructure with tenant registration, plan-based limits, usage metering, and Stripe billing integration to enable monetization of the OpenWA platform.

## Sprint Duration & Dates

| Field | Value |
|-------|-------|
| Sprint # | 6 |
| Start Date | 2026-07-28 (Monday) |
| End Date | 2026-08-08 (Friday) |
| Working Days | 10 |
| Phase | Phase 6 — Multi-Tenant SaaS & Billing (Week 11-13) |

## Capacity

| Team Member | Role | Available Days | Story Points Capacity |
|-------------|------|---------------|----------------------|
| Dev A | Senior Full-Stack | 10 | ~12 pts |
| Dev B | Backend/Infra | 10 | ~10 pts |
| Dev C | Frontend | 10 | ~10 pts |
| **Total** | | **30 person-days** | **~30 pts** |

**Note:** Sprint total is 23 points. Remaining 7 points allocated to tech debt, e2e test hardening, and documentation.

## Sprint Backlog

| Story ID | Title | Points | Assignee | Priority | Dependencies |
|----------|-------|--------|----------|----------|--------------|
| US-047 | Tenant Registration | 5 | Dev B + Dev C | P0 | None |
| US-048 | Plan-Based Limits | 5 | Dev B | P0 | US-047 |
| US-049 | Usage Metering | 5 | Dev B | P0 | US-048 |
| US-050 | Billing Integration | 8 | Dev A + Dev C | P0 | US-047, US-048 |
| TECH-01 | E2E Test Suite (08-settings, 09-stats) | 3 | Dev A | P1 | US-048, US-049 |
| TECH-02 | Billing webhook security hardening | 2 | Dev A | P1 | US-050 |
| TECH-03 | Frontend plugin tests (10-plugins.spec.ts) | 2 | Dev C | P2 | US-047 |
| **Total** | | **30** | | | |

## Day-by-Day Schedule

### Week 1 (July 28 – August 1)

| Day | Dev A (Full-Stack) | Dev B (Backend/Infra) | Dev C (Frontend) |
|-----|-------------------|----------------------|-----------------|
| **1** Mon | US-050: Stripe account setup, product/price config | US-047: Tenant DB schema, D1 provisioning logic | US-047: Registration page UI, form validation |
| **2** Tue | US-050: Stripe Checkout session API | US-047: Registration endpoint, email verification | US-047: Email verification flow UI, success page |
| **3** Wed | US-050: Webhook endpoint, signature verification | US-047: D1 database-per-tenant creation | US-047: Onboarding wizard (plan selection) |
| **4** Thu | US-050: Subscription lifecycle (create/update/cancel) | US-048: Plan definitions, tenant plan assignment | US-050: Pricing page, plan comparison table |
| **5** Fri | US-050: Plan upgrade/downgrade proration logic | US-048: Limit enforcement middleware | US-050: Checkout flow UI, payment method display |

### Week 2 (August 4–8)

| Day | Dev A (Full-Stack) | Dev B (Backend/Infra) | Dev C (Frontend) |
|-----|-------------------|----------------------|-----------------|
| **6** Mon | US-050: Customer portal integration | US-049: KV counter implementation | US-050: Billing dashboard, invoice history |
| **7** Tue | US-050: Failed payment handling, dunning | US-049: Usage API endpoints | US-050: Usage charts, limit indicators |
| **8** Wed | TECH-01: E2E tests (08-settings, 09-stats) | US-049: Usage alerts (80%, 100% thresholds) | TECH-03: Frontend plugin e2e tests |
| **9** Thu | TECH-02: Webhook security, idempotency | US-049: Usage reset on billing cycle | US-050: Upgrade/downgrade modal, confirmation |
| **10** Fri | Sprint review prep, integration testing | All: Bug fixes, documentation, sprint review | UI polish, error states, loading skeletons |

## Technical Tasks

### US-047: Tenant Registration (5 pts) — Dev B + Dev C

| # | Task | Hours | Assignee | Notes |
|---|------|-------|----------|-------|
| 1 | Tenant table schema in D1 (id, email, org_name, plan, status) | 2 | Dev B | Migration script |
| 2 | POST /api/tenants/register endpoint | 3 | Dev B | Input validation, rate limiting |
| 3 | Email verification token generation & storage | 2 | Dev B | Crypto-random, 24h expiry |
| 4 | Email verification send (Resend/SES integration) | 2 | Dev B | Template, retry logic |
| 5 | GET /api/tenants/verify/:token endpoint | 2 | Dev B | Token validation, status update |
| 6 | D1 database-per-tenant provisioning | 3 | Dev B | Cloudflare API, schema migration |
| 7 | Registration page UI (form, validation, error states) | 3 | Dev C | React Hook Form, zod schema |
| 8 | Email verification UI (pending, success, expired states) | 2 | Dev C | Polling or deep-link |
| 9 | Onboarding wizard (org setup, plan selection) | 3 | Dev C | Multi-step form, progress indicator |

### US-048: Plan-Based Limits (5 pts) — Dev B

| # | Task | Hours | Assignee | Notes |
|---|------|-------|----------|-------|
| 1 | Plan configuration (Free/Pro/Business definitions) | 2 | Dev B | JSON config, hot-reloadable |
| 2 | Plan limits schema (sessions, messages/day, webhooks, storage) | 2 | Dev B | Per-plan limit matrix |
| 3 | Tenant plan assignment & upgrade tracking | 2 | Dev B | D1 mutations, audit log |
| 4 | Rate-limiting middleware (per-tenant, per-plan) | 3 | Dev B | KV-backed sliding window |
| 5 | Session count enforcement | 2 | Dev B | Check before session.create |
| 6 | Message rate enforcement | 2 | Dev B | Per-minute and per-day limits |
| 7 | Webhook count enforcement | 1 | Dev B | Max webhooks per plan |
| 8 | 429 response with upgrade CTA in body | 1 | Dev B | Include current usage & limit |
| 9 | Plan limits API (GET /api/tenants/:id/limits) | 2 | Dev B | Current usage vs. limits |
| 10 | Unit tests for all enforcement paths | 3 | Dev B | Edge cases: boundary, overflow |

### US-049: Usage Metering (5 pts) — Dev B

| # | Task | Hours | Assignee | Notes |
|---|------|-------|----------|-------|
| 1 | KV counter design (keys: `usage:{tenant}:{metric}:{period}`) | 2 | Dev B | Atomic increments |
| 2 | Increment middleware (messages, API calls, media) | 3 | Dev B | Non-blocking, fire-and-forget |
| 3 | GET /api/tenants/:id/usage endpoint | 2 | Dev B | Current period breakdown |
| 4 | GET /api/tenants/:id/usage/history endpoint | 2 | Dev B | Last 30 days, aggregated |
| 5 | Usage alert system (80% warning, 100% hard limit) | 3 | Dev B | Email + in-app notification |
| 6 | Usage reset on billing cycle (cron/scheduled) | 2 | Dev B | Cloudflare Cron Trigger |
| 7 | Usage data export (CSV) | 1 | Dev B | For billing transparency |
| 8 | Usage metering unit tests | 2 | Dev B | Counter accuracy, race conditions |
| 9 | Integration test with plan limits | 2 | Dev B | Limit hit → 429 flow |

### US-050: Billing Integration (8 pts) — Dev A + Dev C

| # | Task | Hours | Assignee | Notes |
|---|------|-------|----------|-------|
| 1 | Stripe product/price creation (3 plans × monthly/annual) | 2 | Dev A | Stripe Dashboard + API seed script |
| 2 | POST /api/billing/checkout-session endpoint | 3 | Dev A | Stripe Checkout, success/cancel URLs |
| 3 | Webhook endpoint (POST /api/billing/webhooks) | 3 | Dev A | Signature verification, event routing |
| 4 | Handle `checkout.session.completed` event | 2 | Dev A | Activate subscription, update tenant plan |
| 5 | Handle `invoice.paid` / `invoice.payment_failed` | 2 | Dev A | Payment status tracking |
| 6 | Handle `customer.subscription.updated/deleted` | 2 | Dev A | Plan change, cancellation logic |
| 7 | Plan upgrade/downgrade with proration | 3 | Dev A | Stripe proration behavior config |
| 8 | Customer portal session creation | 2 | Dev A | Payment method, invoice access |
| 9 | Failed payment handling & grace period | 2 | Dev A | 3-day grace, then downgrade to Free |
| 10 | Webhook idempotency (event deduplication) | 2 | Dev A | KV-based event ID tracking |
| 11 | Pricing page UI (plan comparison, feature matrix) | 3 | Dev C | Responsive, toggle monthly/annual |
| 12 | Checkout flow UI (plan select → Stripe redirect → success) | 3 | Dev C | Loading states, error handling |
| 13 | Billing dashboard (current plan, next invoice, usage) | 3 | Dev C | Stripe customer portal link |
| 14 | Usage visualization (charts, progress bars) | 3 | Dev C | Recharts, real-time counters |
| 15 | Upgrade/downgrade modal with proration preview | 2 | Dev C | Stripe preview API integration |
| 16 | Invoice history table | 2 | Dev C | Download PDF, status badges |

### TECH-01: E2E Test Suite (3 pts) — Dev A

| # | Task | Hours | Assignee | Notes |
|---|------|-------|----------|-------|
| 1 | Implement 08-settings.e2e.ts test scenarios | 3 | Dev A | Plan settings, limits config |
| 2 | Implement 09-stats.e2e.ts test scenarios | 3 | Dev A | Usage stats, billing stats |
| 3 | Test fixtures for multi-tenant scenarios | 2 | Dev A | Tenant creation, plan assignment |
| 4 | CI integration for e2e test suite | 1 | Dev A | Docker Compose, D1 test instance |

### TECH-02: Billing Webhook Security (2 pts) — Dev A

| # | Task | Hours | Assignee | Notes |
|---|------|-------|----------|-------|
| 1 | Stripe signature verification with timing-safe compare | 2 | Dev A | Prevent replay attacks |
| 2 | Webhook event idempotency layer | 2 | Dev A | KV deduplication, 48h TTL |
| 3 | Webhook retry handling & dead letter queue | 2 | Dev A | Failed events logged, alerting |
| 4 | Security audit of billing endpoints | 1 | Dev A | OWASP checklist, Stripe best practices |

### TECH-03: Frontend Plugin E2E Tests (2 pts) — Dev C

| # | Task | Hours | Assignee | Notes |
|---|------|-------|----------|-------|
| 1 | Implement 10-plugins.spec.ts test scenarios | 3 | Dev C | Plugin install/uninstall/config |
| 2 | Mock Stripe Checkout for e2e testing | 2 | Dev C | stripe-mock or test mode |
| 3 | Registration flow e2e test | 2 | Dev C | Full signup → verification → dashboard |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Stripe webhook delivery delays in production | Medium | High | Implement polling fallback; check subscription status on login |
| D1 per-tenant provisioning rate limits | Medium | High | Queue tenant creation; batch during off-peak; request limit increase |
| KV counter race conditions under high concurrency | Medium | Medium | Use atomic operations; accept ±1% accuracy for metering |
| Plan upgrade proration calculation errors | Medium | High | Use Stripe's built-in proration; never calculate manually |
| Email verification deliverability issues | Medium | Medium | Use established provider (Resend); implement retry; allow resend |
| Billing state inconsistency (Stripe vs. D1) | Low | High | Stripe as source of truth; reconciliation job every 6 hours |
| Free tier abuse (multiple accounts) | Medium | Medium | Rate limit registration by IP; phone verification for Free tier |
| GDPR compliance for tenant data | Low | High | Data deletion API; tenant export; retention policies documented |

## Sprint Review Checklist

### Tenant Registration Demo
- [ ] New user can register with email and organization name
- [ ] Email verification sent and received within 30 seconds
- [ ] Verification link activates account
- [ ] Expired token shows re-send option
- [ ] D1 database provisioned for new tenant
- [ ] Onboarding wizard guides through plan selection

### Plan-Based Limits Demo
- [ ] Free plan: limited to 1 session, 100 messages/day
- [ ] Pro plan: up to 5 sessions, 10,000 messages/day
- [ ] Business plan: up to 25 sessions, 100,000 messages/day
- [ ] 429 returned when limit exceeded with upgrade prompt
- [ ] Rate limiting persists across requests (KV-backed)

### Usage Metering Demo
- [ ] Usage counters increment on message send/receive
- [ ] Usage API returns current period stats
- [ ] 80% usage warning notification triggered
- [ ] 100% limit blocks further operations
- [ ] Usage resets at billing cycle start

### Billing Integration Demo
- [ ] Pricing page displays all 3 plans with features
- [ ] Monthly/annual toggle with savings displayed
- [ ] Stripe Checkout redirect and successful payment
- [ ] Subscription active after payment (webhook processed)
- [ ] Billing dashboard shows current plan and usage
- [ ] Plan upgrade with proration preview
- [ ] Plan downgrade with end-of-period scheduling
- [ ] Customer portal accessible for payment method changes
- [ ] Invoice history with PDF download

### E2E Tests Demo
- [ ] `08-settings.e2e.ts` passing in CI
- [ ] `09-stats.e2e.ts` passing in CI
- [ ] `10-plugins.spec.ts` passing in CI
- [ ] Full registration → billing → usage flow automated

## Definition of Done Verification

```bash
# 1. Run unit tests for billing module
cd src && pnpm test -- --testPathPattern="billing|tenant|usage|plan"

# 2. Run backend e2e tests
cd e2e && pnpm test -- --testPathPattern="08-settings|09-stats"

# 3. Run frontend e2e tests
cd e2e-frontend && npx playwright test tests/10-plugins.spec.ts

# 4. Stripe webhook test (using Stripe CLI)
stripe trigger checkout.session.completed
stripe trigger invoice.paid
stripe trigger customer.subscription.updated
stripe trigger invoice.payment_failed

# 5. Verify tenant registration flow
curl -X POST http://localhost:3000/api/tenants/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","orgName":"Test Org","plan":"free"}'

# 6. Verify plan limits enforcement
curl -X POST http://localhost:3000/api/sessions \
  -H "Authorization: Bearer $TOKEN" \
  # Should return 429 after limit exceeded

# 7. Verify usage metering
curl http://localhost:3000/api/tenants/me/usage \
  -H "Authorization: Bearer $TOKEN"

# 8. Lint and type-check
pnpm lint && pnpm typecheck

# 9. Security audit
pnpm audit --production
grep -r "stripe_sk_" src/ # Should find NO hardcoded keys

# 10. D1 migration verification
wrangler d1 migrations list --database-id=$DB_ID

# 11. Load test usage metering (100 concurrent requests)
hey -n 1000 -c 100 -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/messages/send
```

---
