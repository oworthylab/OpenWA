# Sprint 8 — Operations & Launch

## Sprint Goal

Harden the platform with production-grade observability, complete the SDK and documentation, deliver remaining WhatsApp features (labels, status), and execute a successful beta launch with all security and performance criteria met.

## Sprint Duration & Dates

| Field | Value |
|-------|-------|
| Sprint # | 8 (LAUNCH SPRINT) |
| Start Date | 2026-08-11 (Monday) |
| End Date | 2026-08-22 (Friday) |
| Working Days | 10 |
| Phase | Phase 8 — Operations & Launch |

## Capacity

| Developer | Role | Available Days | Capacity (pts) | Notes |
|-----------|------|---------------|----------------|-------|
| Dev A | Senior Full-Stack | 10 | ~12 | Also: security audit, SDK |
| Dev B | Backend/Infra | 10 | ~10 | Also: load testing |
| Dev C | Frontend | 10 | ~8 | Also: landing page |
| **Total** | | **30 dev-days** | **~30 pts** | +launch activities |

## Sprint Backlog

| Story ID | Title | Points | Assignee | Priority | Dependencies |
|----------|-------|--------|----------|----------|--------------|
| US-057 | Structured Logging | 3 | Dev B | P1 | None |
| US-058 | Error Tracking (Sentry) | 3 | Dev B | P1 | US-057 |
| US-059 | Label Management | 3 | Dev B | P2 | Sessions module |
| US-060 | Status/Stories Endpoints | 3 | Dev B | P2 | Sessions module |
| US-061 | Eden Treaty Type-Safe SDK | 5 | Dev A | P1 | All API endpoints stable |
| US-062 | API Documentation | 5 | Dev A | P1 | US-061 |
| US-063 | Settings Management | 3 | Dev A + Dev C | P2 | Tenant module |
| US-064 | Plugin Management UI | 3 | Dev C | P2 | Plugin system |
| — | Security Audit | — | Dev A | P0 | All auth flows |
| — | Load Testing | — | Dev B | P0 | Full API deployed |
| — | Beta Launch Checklist | — | All | P0 | Everything |

**Total: 28 points + launch activities**

## Day-by-Day Schedule

### Week 1 (Aug 11 – Aug 15)

| Day | Dev A (Full-Stack) | Dev B (Backend/Infra) | Dev C (Frontend) |
|-----|--------------------|-----------------------|------------------|
| **Day 1** (Mon) | US-061: SDK architecture, Eden Treaty type extraction from Elysia app | US-057: Structured logging middleware (requestId, tenantId, timestamp) | US-064: Plugin management page scaffolding, plugin list component |
| **Day 2** (Tue) | US-061: @openwa/sdk-js package setup, client generation, auth helpers | US-057: Cloudflare Logpush configuration, log format validation | US-064: Plugin toggle, config modal, status indicators |
| **Day 3** (Wed) | US-061: SDK error handling, retry logic, pagination helpers | US-058: Sentry integration, source map upload, error boundary setup | US-063: Settings page UI (tenant name, timezone, notification prefs) |
| **Day 4** (Thu) | US-061: @openwa/sdk-python stub generation, README, examples | US-058: Alert rules (error rate, latency P99), Slack webhook | US-063: Settings form validation, save/reset, confirmation dialogs |
| **Day 5** (Fri) | US-062: OpenAPI spec generation from Elysia routes | US-059: Label CRUD endpoints (GET/POST/PUT/DELETE /labels) | US-063: Settings integration tests, API wiring |

### Week 2 (Aug 18 – Aug 22) — LAUNCH WEEK

| Day | Dev A (Full-Stack) | Dev B (Backend/Infra) | Dev C (Frontend) |
|-----|--------------------|-----------------------|------------------|
| **Day 6** (Mon) | US-062: Swagger UI integration, authentication docs, quick-start guide | US-059: Label assignment to chats, label filtering on messages | Security audit: frontend auth flows, token storage, XSS prevention |
| **Day 7** (Tue) | Security audit: auth flows, JWT validation, tenant isolation, crypto review | US-060: Status/Stories endpoints (POST/GET/DELETE /status) | Final UI polish, error states, loading skeletons, responsive fixes |
| **Day 8** (Wed) | Security audit: API rate limiting verification, RBAC edge cases, report | US-060: Media upload for stories, status viewer list | Load testing support, frontend performance audit (Lighthouse) |
| **Day 9** (Thu) | Launch prep: DNS verification, secrets rotation, runbook review | Load testing: k6 scripts (100 sessions, 1000 req/s), results analysis | Launch prep: landing page final, changelog, announcement draft |
| **Day 10** (Fri) | **LAUNCH DAY**: Deploy to production, monitor, hotfix standby | **LAUNCH DAY**: Infrastructure monitoring, scaling verification | **LAUNCH DAY**: Dashboard smoke test, user onboarding flow verification |

## Technical Tasks

### US-057: Structured Logging (3 pts)

| # | Task | Est. | Assignee |
|---|------|------|----------|
| 1 | Logging middleware: inject requestId (crypto.randomUUID), tenantId from auth context | 2h | Dev B |
| 2 | JSON log formatter (timestamp, level, requestId, tenantId, method, path, status, duration_ms) | 2h | Dev B |
| 3 | Cloudflare Logpush configuration (R2 bucket destination, filter rules) | 2h | Dev B |
| 4 | Log level configuration via environment variable (debug/info/warn/error) | 1h | Dev B |
| 5 | Sensitive data scrubbing (passwords, tokens, phone numbers in logs) | 2h | Dev B |
| 6 | Unit tests: log format, scrubbing, request correlation | 1h | Dev B |

### US-058: Error Tracking — Sentry (3 pts)

| # | Task | Est. | Assignee |
|---|------|------|----------|
| 1 | Sentry SDK integration in Elysia (toucan-js for CF Workers) | 2h | Dev B |
| 2 | Source map upload in CI/CD pipeline (wrangler deploy hook) | 2h | Dev B |
| 3 | Error boundary: catch unhandled rejections, add request context | 1h | Dev B |
| 4 | Alert rules: error rate > 1%/min → Slack, P99 latency > 2s → PagerDuty | 2h | Dev B |
| 5 | Sentry dashboard: custom views for tenant errors, API errors, queue failures | 1h | Dev B |
| 6 | Frontend Sentry integration (React error boundary, replay) | 2h | Dev B |

### US-059: Label Management (3 pts)

| # | Task | Est. | Assignee |
|---|------|------|----------|
| 1 | D1 migration: `labels` table (id, tenant_id, session_id, name, color, wa_label_id) | 1h | Dev B |
| 2 | Label CRUD: GET/POST/PUT/DELETE /api/sessions/:sessionId/labels | 2h | Dev B |
| 3 | Chat label assignment: POST /api/sessions/:sessionId/chats/:chatId/labels | 2h | Dev B |
| 4 | WhatsApp Business API label sync (fetch remote labels, reconcile) | 2h | Dev B |
| 5 | Label filtering on message list endpoint | 1h | Dev B |
| 6 | Unit + integration tests | 2h | Dev B |

### US-060: Status/Stories Endpoints (3 pts)

| # | Task | Est. | Assignee |
|---|------|------|----------|
| 1 | POST /api/sessions/:sessionId/status (text or media status) | 2h | Dev B |
| 2 | GET /api/sessions/:sessionId/status (list own + contacts' statuses) | 2h | Dev B |
| 3 | DELETE /api/sessions/:sessionId/status/:statusId | 1h | Dev B |
| 4 | Media upload handling for status images/videos (R2 storage) | 2h | Dev B |
| 5 | Status viewer list: GET /api/sessions/:sessionId/status/:statusId/viewers | 1h | Dev B |
| 6 | Unit + integration tests | 2h | Dev B |

### US-061: Eden Treaty Type-Safe SDK (5 pts)

| # | Task | Est. | Assignee |
|---|------|------|----------|
| 1 | Package setup: @openwa/sdk-js (tsup build, package.json, exports) | 2h | Dev A |
| 2 | Eden Treaty client extraction from Elysia app type | 2h | Dev A |
| 3 | Authentication helper (API key, JWT token management) | 2h | Dev A |
| 4 | Error handling wrapper (typed errors, retry with backoff) | 2h | Dev A |
| 5 | Pagination helper (cursor-based, auto-fetch-all option) | 2h | Dev A |
| 6 | Webhook event types and handler helper | 2h | Dev A |
| 7 | Python SDK stub: @openwa/sdk-python (openapi-python-client generation) | 3h | Dev A |
| 8 | SDK README with installation, auth, and usage examples | 2h | Dev A |
| 9 | Integration tests: SDK against running API | 2h | Dev A |

### US-062: API Documentation (5 pts)

| # | Task | Est. | Assignee |
|---|------|------|----------|
| 1 | OpenAPI 3.1 spec generation from Elysia swagger plugin | 2h | Dev A |
| 2 | Swagger UI route: GET /docs (interactive API explorer) | 2h | Dev A |
| 3 | Authentication documentation (API key creation, JWT flow, scopes) | 2h | Dev A |
| 4 | Quick-start guide (5-minute: create account → send first message) | 2h | Dev A |
| 5 | Webhook documentation (events, payload schemas, verification) | 2h | Dev A |
| 6 | Rate limiting documentation (limits per plan, headers, 429 handling) | 1h | Dev A |
| 7 | SDK integration guide (JS and Python examples) | 2h | Dev A |
| 8 | Error reference (all error codes, descriptions, resolution steps) | 2h | Dev A |
| 9 | Postman/Insomnia collection export | 1h | Dev A |

### US-063: Settings Management (3 pts)

| # | Task | Est. | Assignee |
|---|------|------|----------|
| 1 | D1 migration: `tenant_settings` table (tenant_id, key, value, updated_at) | 1h | Dev A |
| 2 | Settings API: GET/PUT /api/settings (tenant name, timezone, locale, notification prefs) | 2h | Dev A |
| 3 | Settings validation schema (Zod with sensible defaults) | 1h | Dev A |
| 4 | Frontend: Settings page with form sections (general, notifications, API) | 3h | Dev C |
| 5 | Frontend: Save confirmation, unsaved changes warning | 1h | Dev C |
| 6 | Unit tests: validation, default merging | 1h | Dev A |

### US-064: Plugin Management UI (3 pts)

| # | Task | Est. | Assignee |
|---|------|------|----------|
| 1 | Plugin list API: GET /api/plugins (installed, available, status) | 2h | Dev C |
| 2 | Plugin toggle: POST /api/plugins/:id/enable, /disable | 1h | Dev C |
| 3 | Plugin config: GET/PUT /api/plugins/:id/config | 2h | Dev C |
| 4 | Frontend: Plugin grid/list with status badges, toggle switches | 3h | Dev C |
| 5 | Frontend: Plugin config modal (dynamic form from plugin schema) | 3h | Dev C |
| 6 | Frontend: Plugin health indicators, error display | 1h | Dev C |

### Launch Activities (Non-Story-Pointed)

| # | Task | Est. | Assignee |
|---|------|------|----------|
| 1 | Security audit: JWT validation, token expiry, refresh flow | 3h | Dev A |
| 2 | Security audit: Tenant isolation (D1 queries, R2 keys, Queue routing) | 3h | Dev A |
| 3 | Security audit: Crypto review (password hashing, API key generation, webhook signatures) | 2h | Dev A |
| 4 | Security audit: Rate limiting effectiveness, DDoS mitigation | 2h | Dev A |
| 5 | Security audit: RBAC edge cases, privilege escalation attempts | 2h | Dev A |
| 6 | Load test: k6 script for 100 concurrent sessions | 3h | Dev B |
| 7 | Load test: k6 script for 1000 req/s sustained (message send, contacts, sessions) | 3h | Dev B |
| 8 | Load test: Queue throughput under load (webhook storm simulation) | 2h | Dev B |
| 9 | Load test: D1 connection pool exhaustion test | 1h | Dev B |
| 10 | DNS configuration: production domain, SSL certificates | 1h | Dev B |
| 11 | Secrets rotation: generate fresh production API keys, encrypt at rest | 1h | Dev B |
| 12 | Monitoring dashboards: Grafana/CF Analytics (latency, errors, queue depth) | 2h | Dev B |
| 13 | Backup verification: D1 point-in-time restore test, R2 versioning | 1h | Dev B |
| 14 | Landing page: feature highlights, pricing, sign-up CTA | 4h | Dev C |
| 15 | Changelog: public-facing release notes for beta | 1h | Dev C |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Security audit reveals critical vulnerability | Medium | Critical | Reserve Day 9-10 for hotfixes; no launch if P0 security issue unresolved |
| Load test shows <1000 req/s throughput | Medium | High | Profile bottlenecks Day 9, optimize hot paths, add caching; defer launch if <500 req/s |
| Sentry source maps not resolving in Workers | Medium | Low | Use wrangler's built-in source map support; fallback to inline source maps |
| SDK type generation breaks with complex Elysia routes | Low | Medium | Manually type critical endpoints; document known limitations |
| D1 write limits hit during load test | Low | High | Implement write batching, use Durable Objects for hot counters |
| Launch-day traffic spike exceeds capacity | Low | High | CF Workers auto-scale; pre-warm with synthetic traffic; have rollback plan |

## Sprint Review Checklist

### Demo Script (Sprint Review — Aug 22, Pre-Launch)

- [ ] **Structured Logging**: Show JSON log output with requestId correlation across multiple services
- [ ] **Sentry**: Trigger an error → show it appear in Sentry with full stack trace and request context
- [ ] **Labels**: Create label, assign to chat, filter messages by label
- [ ] **Status/Stories**: Post a text status, post an image status, view status viewers
- [ ] **SDK**: Install @openwa/sdk-js, authenticate, send a message — all type-safe
- [ ] **API Docs**: Open Swagger UI, authenticate, execute a request, show response
- [ ] **Settings**: Change tenant timezone, notification preferences, verify persistence
- [ ] **Plugin UI**: View installed plugins, toggle one off/on, modify config

### Launch Demo (to stakeholders)

- [ ] **End-to-end flow**: Sign up → create session → scan QR → send message → receive reply → view in CRM
- [ ] **SDK demo**: 10-line script that sends a message using @openwa/sdk-js
- [ ] **Load test results**: Show sustained 1000 req/s with <200ms P95 latency
- [ ] **Security audit**: Present clean report (or document accepted risks)
- [ ] **Monitoring**: Show live dashboard with real-time metrics

## Definition of Done Verification

```bash
# ============================================
# ALL tests must pass for launch clearance
# ============================================

# Unit tests (full suite)
cd /workspaces/OpenWA
pnpm test

# Type checking
pnpm tsc --noEmit

# Lint (zero warnings)
pnpm lint

# Backend E2E tests (ALL must pass)
cd /workspaces/OpenWA/e2e
pnpm test -- 01-health
pnpm test -- 02-auth
pnpm test -- 03-sessions
pnpm test -- 04-messaging
pnpm test -- 05-contacts
pnpm test -- 06-groups
pnpm test -- 07-media
pnpm test -- 08-webhooks
pnpm test -- 09-templates
pnpm test -- 10-bulk
pnpm test -- 11-billing
pnpm test -- 12-plugins
pnpm test -- 13-crm
pnpm test -- 14-catalog

# Frontend E2E tests (ALL must pass)
cd /workspaces/OpenWA/e2e-frontend
pnpm test -- 01-login
pnpm test -- 02-dashboard
pnpm test -- 03-sessions
pnpm test -- 04-messaging
pnpm test -- 05-contacts
pnpm test -- 06-groups
pnpm test -- 07-media
pnpm test -- 08-templates
pnpm test -- 09-settings
pnpm test -- 10-billing
pnpm test -- 11-plugins
pnpm test -- 12-auth-persistence

# SDK tests
cd /workspaces/OpenWA/sdk/javascript
pnpm test

# Load test (must meet thresholds)
k6 run --vus 100 --duration 60s load-tests/api-stress.js
# Expected: p95 < 200ms, error_rate < 0.1%, req/s > 1000

# Security scan
pnpm audit --production
# Expected: 0 critical, 0 high vulnerabilities
```

## Launch Readiness Criteria

### Go/No-Go Checklist

Each criterion must be explicitly verified. **ALL must be "Go" for launch.**

#### Functional Readiness

| # | Criterion | Status | Verified By |
|---|-----------|--------|-------------|
| 1 | All 14 backend E2E test suites pass (01-health through 14-catalog) | ☐ Go / ☐ No-Go | Dev B |
| 2 | All 12 frontend E2E test suites pass (01-login through 12-auth-persistence) | ☐ Go / ☐ No-Go | Dev C |
| 3 | SDK installs and authenticates successfully from clean environment | ☐ Go / ☐ No-Go | Dev A |
| 4 | API documentation accessible and all examples execute correctly | ☐ Go / ☐ No-Go | Dev A |
| 5 | QR code scan → session active flow works end-to-end | ☐ Go / ☐ No-Go | Dev B |

#### Performance Readiness

| # | Criterion | Threshold | Status |
|---|-----------|-----------|--------|
| 6 | API latency P95 | < 200ms | ☐ Go / ☐ No-Go |
| 7 | API latency P99 | < 500ms | ☐ Go / ☐ No-Go |
| 8 | Sustained throughput | > 1000 req/s | ☐ Go / ☐ No-Go |
| 9 | Concurrent sessions | > 100 stable | ☐ Go / ☐ No-Go |
| 10 | Queue processing latency | < 5s for webhooks | ☐ Go / ☐ No-Go |
| 11 | Dashboard Lighthouse score | > 90 (performance) | ☐ Go / ☐ No-Go |

#### Security Readiness

| # | Criterion | Status | Verified By |
|---|-----------|--------|-------------|
| 12 | No critical/high vulnerabilities in `pnpm audit` | ☐ Go / ☐ No-Go | Dev A |
| 13 | JWT validation covers: expiry, issuer, audience, signature | ☐ Go / ☐ No-Go | Dev A |
| 14 | Tenant isolation verified: no cross-tenant data access possible | ☐ Go / ☐ No-Go | Dev A |
| 15 | API keys hashed with Argon2, never stored plaintext | ☐ Go / ☐ No-Go | Dev A |
| 16 | Rate limiting active on all public endpoints | ☐ Go / ☐ No-Go | Dev A |
| 17 | Webhook signatures verified (HMAC-SHA256) | ☐ Go / ☐ No-Go | Dev A |
| 18 | No secrets in code, environment variables, or logs | ☐ Go / ☐ No-Go | Dev A |

#### Infrastructure Readiness

| # | Criterion | Status | Verified By |
|---|-----------|--------|-------------|
| 19 | Production DNS configured and SSL active | ☐ Go / ☐ No-Go | Dev B |
| 20 | All secrets rotated from development values | ☐ Go / ☐ No-Go | Dev B |
| 21 | Sentry receiving errors with correct source maps | ☐ Go / ☐ No-Go | Dev B |
| 22 | Cloudflare Logpush delivering to R2 | ☐ Go / ☐ No-Go | Dev B |
| 23 | D1 backup/restore tested successfully | ☐ Go / ☐ No-Go | Dev B |
| 24 | Monitoring dashboard live with alerting configured | ☐ Go / ☐ No-Go | Dev B |
| 25 | Rollback procedure documented and tested | ☐ Go / ☐ No-Go | Dev B |

#### Operational Readiness

| # | Criterion | Status | Verified By |
|---|-----------|--------|-------------|
| 26 | Runbook covers: incident response, rollback, scaling | ☐ Go / ☐ No-Go | All |
| 27 | On-call rotation defined for first 2 weeks post-launch | ☐ Go / ☐ No-Go | All |
| 28 | Landing page live with sign-up flow | ☐ Go / ☐ No-Go | Dev C |
| 29 | Changelog/release notes published | ☐ Go / ☐ No-Go | Dev C |
| 30 | Beta user communication sent (if applicable) | ☐ Go / ☐ No-Go | All |

### Launch Day Procedure (Day 10 — Aug 22)

```
08:00  Final go/no-go decision (all 30 criteria must be Go)
08:30  Production deploy: wrangler deploy --env production
09:00  Smoke test: health check, auth flow, send message, receive webhook
09:30  DNS cutover: point api.openwa.dev → CF Workers production
10:00  Monitoring: verify metrics flowing, set up war room
10:00–12:00  Controlled beta access (invite first 10 users)
12:00  Status check: error rates, latency, user feedback
13:00  Wider beta access (invite remaining waitlist)
14:00–17:00  Active monitoring, bug triage, hotfix if needed
17:00  End-of-day status: publish metrics, note known issues
```

### Rollback Plan

If critical issues are discovered post-launch:

1. **Immediate** (< 5 min): `wrangler rollback` to previous deployment
2. **DNS**: Revert CNAME to maintenance page
3. **Data**: D1 point-in-time restore if data corruption detected
4. **Communication**: Status page update, user notification via email
5. **Post-mortem**: Schedule within 24 hours, document in runbook
