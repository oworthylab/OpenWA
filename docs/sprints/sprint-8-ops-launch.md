# Sprint 8 — Operations & Launch

## Sprint Goal

Ship the public beta: publish SDKs (@openwa/sdk-js, @openwa/sdk-python), deploy interactive API documentation, implement structured logging + error tracking, complete security audit and load testing, finalize remaining UI (settings, plugins, labels, status), and launch to production with monitoring active.

## Sprint Duration & Dates

| Field | Value |
|-------|-------|
| Sprint # | 8 |
| Start Date | 2026-09-15 (Monday) |
| End Date | 2026-09-26 (Friday) |
| Working Days | 10 |
| Phase | Phase 8 — Observability, Docs, Launch |

## Capacity

| Team Member | Role | Available Days | Notes |
|-------------|------|---------------|-------|
| Dev A | SDK + Docs + Remaining API | 10 | Eden Treaty SDK, OpenAPI, labels, status |
| Dev B | Logging + Security + Load Test | 10 | Structured logging, Sentry, audit, k6 |
| Dev C | Settings UI + Plugin UI + Landing | 10 | Settings, plugins, landing page, polish |
| **Total** | | **30 person-days** | ~27 story points + launch tasks |

## Sprint Backlog

| Story ID | Title | Points | Assignee | Priority | Dependencies | Status |
|----------|-------|--------|----------|----------|--------------|--------|
| US-057 | Structured Logging | 3 | Dev B | Must-have | None | — |
| US-058 | Error Tracking | 3 | Dev B | Must-have | US-057 | — |
| US-059 | Label Management | 3 | Dev A | Should-have | None | — |
| US-060 | Status/Stories | 3 | Dev A | Should-have | None | — |
| US-061 | Eden Treaty SDK | 5 | Dev A | Must-have | None | — |
| US-062 | API Documentation | 5 | Dev A | Must-have | US-061 | — |
| US-063 | Settings Management | 2 | Dev C | Must-have | None | — |
| US-064 | Plugin Management UI | 3 | Dev C | Should-have | None | — |

**Total: 27 points** (remaining capacity reserved for security audit, load testing, and launch-day tasks)

## Day-by-Day Schedule

### Week 1 (September 15–19)

| Day | Dev A (SDK + Docs) | Dev B (Ops + Security) | Dev C (UI + Landing) |
|-----|-------------------|----------------------|---------------------|
| **D1 Mon** | US-059: Label endpoints (`GET labels`, `POST/DELETE` label assignments) | US-057: Structured logging middleware (JSON format, requestId, tenantId) | US-063: Settings page (tenant name, notifications, timezone) |
| **D2 Tue** | US-060: Status/Stories endpoints (`POST` text/image/video, `GET`, `DELETE`) | US-057: Log sensitive data filtering, CF Logpush configuration | US-064: Plugin list page, toggle enable/disable |
| **D3 Wed** | US-061: `@openwa/sdk-js` scaffold, Eden Treaty wrapper generation | US-058: Sentry integration, source maps upload, error context enrichment | US-064: Plugin config modal, admin-only route guard |
| **D4 Thu** | US-061: SDK auth handling, typed error classes, all endpoint methods | US-058: Alert rules (error rate > 1%), Sentry dashboard setup | Landing page — product overview, features grid, pricing table |
| **D5 Fri** | US-061: SDK README, quickstart example, npm publish preparation | Security audit — auth flows, injection vectors, tenant isolation review | Landing page — quickstart CTA, deploy to root domain |

### Week 2 (September 22–26)

| Day | Dev A (SDK + Docs) | Dev B (Ops + Security) | Dev C (UI + Landing) |
|-----|-------------------|----------------------|---------------------|
| **D6 Mon** | US-061: Python SDK (`@openwa/sdk-python`), async httpx client, PyPI prep | Load testing — 100 concurrent sessions, 1000 req/s API with k6 | API playground (Scalar/Swagger UI) integration |
| **D7 Tue** | US-062: OpenAPI spec generation from Elysia types, endpoint documentation | Load test analysis, bottleneck identification, document limits | Quickstart guide (register → key → send message in 5 min) |
| **D8 Wed** | US-062: Integration guides (Node.js, Python, cURL, webhook setup) | Final security fixes, penetration test findings remediation | Integration guides for Mart, desktop app setup docs |
| **D9 Thu** | SDK publish to npm + PyPI (scoped packages) | Monitoring dashboards finalized, runbook for common issues | Final UI polish, accessibility review (WCAG 2.1 AA) |
| **D10 Fri** | **LAUNCH DAY**: Production deploy verification, changelog | **LAUNCH DAY**: DNS, secrets rotation, monitoring active | **LAUNCH DAY**: Community announcement, docs live |

## Technical Tasks

### US-057: Structured Logging (3 pts) — Dev B

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Logging middleware | 2h | JSON structured logs with `requestId`, `tenantId`, `method`, `path`, `status`, `duration_ms` |
| 2 | Sensitive data filtering | 2h | Redact `authorization` headers, phone numbers (last 4 only), message bodies |
| 3 | Log levels | 1h | `debug`, `info`, `warn`, `error` with environment-based minimum level |
| 4 | CF Logpush config | 2h | Push Worker logs to R2 bucket, configure retention (30 days) |
| 5 | Request correlation | 1h | `X-Request-ID` header propagation across DO ↔ Worker boundaries |

### US-058: Error Tracking (3 pts) — Dev B

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Sentry integration | 2h | `@sentry/cloudflare` SDK, DSN configuration, environment tags |
| 2 | Source maps | 1h | Upload source maps on deploy via `sentry-cli` in CI |
| 3 | Error context | 2h | Attach `tenantId`, `sessionId`, `userId` to error events |
| 4 | Alert rules | 1h | Error rate > 1% → PagerDuty/Slack alert; new issue → notify |
| 5 | Performance monitoring | 1h | Transaction tracing for API endpoints, DO alarm callbacks |
| 6 | Dashboard | 1h | Sentry project dashboard with key metrics widget |

### US-059: Label Management (3 pts) — Dev A

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Label endpoints | 2h | `GET /labels` (list all), `POST /contacts/:id/labels` (assign), `DELETE` (remove) |
| 2 | Label colors | 1h | Predefined color palette, custom hex support |
| 3 | Bulk operations | 1h | `POST /contacts/bulk/labels` — assign/remove labels for multiple contacts |
| 4 | WhatsApp sync | 2h | Sync labels with WhatsApp native labels (bidirectional) |
| 5 | Tests | 1h | CRUD, bulk operations, sync verification |

### US-060: Status/Stories (3 pts) — Dev A

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Post text status | 2h | `POST /status/text` — background color, font, text content |
| 2 | Post media status | 2h | `POST /status/media` — image/video upload via R2, caption |
| 3 | Get status views | 1h | `GET /status/:id/views` — who viewed the status |
| 4 | Delete status | 30min | `DELETE /status/:id` |
| 5 | List my statuses | 30min | `GET /status` — active statuses with view counts |
| 6 | Tests | 1h | Post, view, delete lifecycle |

### US-061: Eden Treaty SDK (5 pts) — Dev A

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | JS SDK scaffold | 2h | `sdk/javascript/` — package.json, tsconfig, build with `tsup` |
| 2 | Eden Treaty wrapper | 3h | Auto-generated typed client from Elysia app type |
| 3 | Auth handling | 2h | API key + Bearer token support, auto-refresh, retry on 401 |
| 4 | Error types | 1h | Typed errors: `AuthError`, `RateLimitError`, `ValidationError`, `NotFoundError` |
| 5 | All endpoint methods | 3h | Sessions, messages, contacts, groups, webhooks, CRM, Mart |
| 6 | README + quickstart | 1h | Installation, authentication, send first message example |
| 7 | Python SDK | 4h | `sdk/python/` — async httpx client, type stubs, PyPI package structure |
| 8 | Python tests | 1h | pytest async tests for core methods |
| 9 | npm publish prep | 1h | `.npmrc`, `prepublishOnly` script, `files` field, `@openwa/sdk-js` scope |
| 10 | PyPI publish prep | 1h | `pyproject.toml`, `twine` upload config, `openwa-sdk` package name |

### US-062: API Documentation (5 pts) — Dev A

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | OpenAPI spec generation | 3h | Extract from Elysia types via `@elysiajs/swagger`, validate completeness |
| 2 | Scalar/Swagger UI | 2h | Interactive API playground hosted at `/docs`, try-it-out with auth |
| 3 | Node.js guide | 1.5h | Step-by-step: install SDK, authenticate, send message, handle webhooks |
| 4 | Python guide | 1.5h | Async example, error handling, webhook verification |
| 5 | cURL guide | 1h | Raw HTTP examples for every endpoint group |
| 6 | Webhook setup guide | 1h | Configure webhook URL, verify signatures, handle retries |
| 7 | Quickstart | 1h | Register → create API key → send first message in < 5 minutes |

### US-063: Settings Management (2 pts) — Dev C

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Settings page | 2h | Tenant name, notification preferences, timezone, language |
| 2 | API key management | 2h | List keys, create with scopes, revoke, copy-to-clipboard |
| 3 | Webhook config UI | 2h | Add/edit/delete webhook URLs, event selection, test ping |
| 4 | Theme toggle | 1h | Light/dark mode persistence |

### US-064: Plugin Management UI (3 pts) — Dev C

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Plugin list page | 2h | Grid of installed plugins with status badges |
| 2 | Enable/disable toggle | 1h | Toggle with confirmation, immediate effect |
| 3 | Plugin config modal | 2h | Dynamic form from plugin manifest, save to KV |
| 4 | Admin-only guard | 1h | Route protection, role check, redirect non-admins |
| 5 | Plugin marketplace stub | 1h | Placeholder for future community plugins |

### Launch Tasks (unpointed — shared across team)

| # | Task | Owner | Description |
|---|------|-------|-------------|
| 1 | Security audit | Dev B | Review all auth flows, SQL injection vectors, tenant isolation |
| 2 | Load testing | Dev B | k6 script: 100 VUs, 5 min sustained, 1000 req/s target |
| 3 | DNS configuration | Dev B | Production domain, SSL certificates, CF proxy |
| 4 | Secrets rotation | Dev B | Rotate all staging secrets for production values |
| 5 | 48h staging burn-in | Dev B | Monitor staging for stability before production cutover |
| 6 | Landing page deploy | Dev C | Deploy to root domain, SEO meta, OG tags |
| 7 | Changelog | Dev A | Compile all features from Sprints 1–8 |
| 8 | Community announcement | Dev C | Blog post, social media, community channels |

## End-to-End Tests

| Test File | Stories | Description |
|-----------|---------|-------------|
| `12-status.e2e.ts` | US-060 | Status post/view/delete lifecycle |
| `13-labels.e2e.ts` | US-059 | Label CRUD, assignment, bulk operations |
| `08-settings.e2e.ts` | US-063 | Settings update, API key management |
| `10-plugins.spec.ts` (frontend) | US-064 | Plugin list, enable/disable, config |
| `11-theme-responsive.spec.ts` (frontend) | General UI | Theme toggle, responsive breakpoints |

## Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | SDK publishing permissions (npm/PyPI) | Low | Low | Set up `@openwa` org on npm and PyPI in advance (D1 of sprint) |
| 2 | Load test reveals scaling bottleneck | Medium | High | D1 single-writer limit is accepted for MVP; document limitations, plan sharding for v2 |
| 3 | Security audit finds critical issue | Medium | Critical | Reserve D8–D9 for remediation; delay launch if critical/high findings remain |
| 4 | TanStack Start breaking change in RC | Low | High | Pin exact version in lockfile, test upgrade path post-launch |
| 5 | Sentry quota exceeded during load test | Low | Low | Use separate Sentry project for load tests, sample rate 0.1 during k6 |

## Sprint Review / Launch Checklist

- [ ] All e2e tests pass (backend + frontend)
- [ ] `@openwa/sdk-js` published to npm with TypeScript types
- [ ] `@openwa/sdk-python` published to PyPI with type stubs
- [ ] API docs live at `/docs` with interactive playground
- [ ] Quickstart guide: register → API key → first message in < 5 minutes
- [ ] Sentry capturing errors with source maps resolved
- [ ] Load test: 100 sessions sustained, 1000 req/s API with p95 < 200ms
- [ ] Security audit: no critical/high findings remaining
- [ ] DNS configured, SSL active on production domain
- [ ] Monitoring dashboards active (latency p50/p95/p99, error rate, DO count, Queue depth)
- [ ] 99.9% uptime verified over 48h staging burn-in
- [ ] Changelog published + community announcement ready
- [ ] Secrets rotated for production (no staging values in prod)
- [ ] Logpush active, logs flowing to R2
- [ ] Rollback plan documented and tested

## Definition of Done Verification

```bash
# Full test suite
bun run test && cd e2e && pnpm test && cd ../e2e-frontend && npx playwright test
# Expected: ALL tests pass (including sprint 7 + 8 additions)

# SDK verification — JavaScript
npx @openwa/sdk-js --version
# Expected: version matches published package

node -e "const { OpenWA } = require('@openwa/sdk-js'); console.log(typeof OpenWA)"
# Expected: "function"

# SDK verification — Python
pip install openwa-sdk && python -c "import openwa; print(openwa.__version__)"
# Expected: version string printed, no import errors

# Production deploy
wrangler deploy --env production
wrangler pages deploy --project-name openwa-dashboard --branch production
# Expected: All services live, health returns 200

# Health check
curl https://api.openwa.io/health
# Expected: {"status": "ok", "version": "1.0.0"}

# Load test
k6 run load-test.js --vus 100 --duration 5m
# Expected: p95 < 200ms, error rate < 0.1%, 0 dropped connections

# Monitoring verification
curl https://api.openwa.io/metrics
# Expected: Prometheus metrics endpoint responding

# Sentry verification
curl -X POST https://api.openwa.io/test/error -H "X-Admin-Key: $ADMIN_KEY"
# Expected: Error appears in Sentry within 30s with full context
```

---
