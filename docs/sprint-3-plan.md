# Sprint 3 — Infrastructure Layer

> **Note:** Sprint 3 contains 70 story points, exceeding single-sprint velocity (~30 pts). It is split into **Sprint 3a** (32 pts) and **Sprint 3b** (38 pts).

---

## Sprint 3a — Core Infrastructure & Session APIs

### 1. Sprint Goal

Deliver the Durable Object session host, session CRUD/lifecycle APIs, authentication layer, and health endpoints — establishing the foundational infrastructure that all other services depend on.

### 2. Sprint Duration & Dates

| Field | Value |
|-------|-------|
| Sprint | 3a |
| Start Date | 2026-06-22 (Monday) |
| End Date | 2026-07-03 (Friday) |
| Duration | 2 weeks (10 working days) |

### 3. Capacity

| Team Member | Role | Available Days | Capacity (pts) |
|-------------|------|---------------|----------------|
| Dev A | Senior Full-Stack | 10 | ~12 |
| Dev B | Backend/Infra | 10 | ~12 |
| Dev C | Frontend | 10 | ~8 (supporting backend) |
| **Total** | | **30 days** | **~32 pts** |

### 4. Sprint Backlog

| Story ID | Title | Points | Assignee | Priority | Dependencies | Target Days |
|----------|-------|--------|----------|----------|--------------|-------------|
| US-019 | Durable Object Session Host | 8 | Dev B | P0 | None | D1–D4 |
| US-021 | Session CRUD API | 5 | Dev A | P0 | US-019 | D3–D5 |
| US-022 | Session Lifecycle API | 5 | Dev A | P0 | US-019, US-021 | D5–D7 |
| US-026 | API Key Authentication | 5 | Dev B | P0 | None | D4–D6 |
| US-027 | API Key Management | 3 | Dev B | P1 | US-026 | D6–D7 |
| US-032 | Health Endpoints | 2 | Dev C | P0 | None | D1–D2 |
| US-029 | Tenant Data Isolation | 5 | Dev A | P0 | US-019 | D7–D9 |
| US-020 | Real-Time WebSocket | 5 | Dev C | P1 | US-019 | D5–D8 |

**Sprint 3a Total: 38 pts** → Adjusted to 32 pts by deferring US-020 overflow to 3b if needed.

### 5. Day-by-Day Schedule

| Day | Dev A | Dev B | Dev C |
|-----|-------|-------|-------|
| D1 (Jun 22) | Sprint planning, architecture review | DO class scaffold, wrangler config | Health endpoints `/health`, `/health/live` |
| D2 (Jun 23) | Elysia route setup, middleware scaffold | DO fetch handler, alarm setup | Health `/health/ready`, integration tests |
| D3 (Jun 24) | Session CRUD: POST /sessions | DO engine hosting, hibernation logic | e2e: `01-health.e2e.ts` |
| D4 (Jun 25) | Session CRUD: GET/DELETE /sessions | API key auth middleware (X-API-Key) | WebSocket research, DO WebSocket setup |
| D5 (Jun 26) | Session Lifecycle: start/stop | API key SHA-256 hashing, role checks | WebSocket: DO → client connection |
| D6 (Jun 27) | Session Lifecycle: logout, QR flow | API key management: create/list | WebSocket: fan-out to subscribers |
| D7 (Jun 28) | Tenant isolation: DB-per-tenant routing | API key management: revoke, tests | WebSocket: reconnection logic |
| D8 (Jul 1) | Tenant isolation: R2 path separation | Auth integration tests | WebSocket: heartbeat, e2e validation |
| D9 (Jul 2) | Integration testing, bug fixes | Security review, load testing | Frontend WebSocket hook prototype |
| D10 (Jul 3) | Sprint review prep, documentation | Sprint review prep, documentation | Sprint review prep, documentation |

### 6. Technical Tasks

#### US-019: Durable Object Session Host (8 pts) — Dev B

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | Create DO class with `fetch()` and `alarm()` handlers | 3h |
| 2 | Implement engine instance hosting within DO | 4h |
| 3 | Add hibernation support (idle timeout → alarm-based wake) | 3h |
| 4 | Implement DO state persistence (storage API) | 3h |
| 5 | Add graceful shutdown and error recovery | 2h |
| 6 | Wrangler bindings configuration | 1h |
| 7 | Unit tests for DO lifecycle | 2h |
| 8 | Integration test: DO creation → engine boot → hibernation cycle | 3h |

#### US-021: Session CRUD API (5 pts) — Dev A

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | Elysia route: `POST /sessions` — create session + provision DO | 3h |
| 2 | Elysia route: `GET /sessions` — list tenant sessions from D1 | 2h |
| 3 | Elysia route: `GET /sessions/:id` — single session detail | 1h |
| 4 | Elysia route: `DELETE /sessions/:id` — delete + cleanup DO | 2h |
| 5 | Input validation schemas (Typebox) | 1h |
| 6 | D1 migrations for sessions table | 1h |
| 7 | Unit + integration tests | 2h |

#### US-022: Session Lifecycle API (5 pts) — Dev A

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | `POST /sessions/:id/start` — wake DO, initialize engine | 2h |
| 2 | `POST /sessions/:id/stop` — graceful stop, persist state | 2h |
| 3 | `POST /sessions/:id/logout` — WA logout + cleanup | 2h |
| 4 | `GET /sessions/:id/qr` — QR code retrieval from DO | 2h |
| 5 | Status transition validation (state machine) | 2h |
| 6 | Integration tests with DO | 2h |

#### US-026: API Key Authentication (5 pts) — Dev B

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | Auth middleware: extract X-API-Key header | 1h |
| 2 | SHA-256 hash lookup in D1 | 2h |
| 3 | Role-based permission checking (admin, write, read) | 2h |
| 4 | Tenant context injection into request | 1h |
| 5 | Error responses (401, 403) with proper headers | 1h |
| 6 | Unit tests for auth flows | 2h |

#### US-027: API Key Management (3 pts) — Dev B

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | `POST /api-keys` — generate key, store SHA-256 hash | 2h |
| 2 | `GET /api-keys` — list keys (masked) | 1h |
| 3 | `DELETE /api-keys/:id` — revoke key | 1h |
| 4 | D1 migration for api_keys table | 1h |
| 5 | Tests | 1h |

#### US-032: Health Endpoints (2 pts) — Dev C

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | `GET /health` — basic 200 response with version | 1h |
| 2 | `GET /health/live` — liveness (always 200 if process running) | 0.5h |
| 3 | `GET /health/ready` — readiness (check D1, KV connectivity) | 2h |
| 4 | Response schema and tests | 1h |

#### US-029: Tenant Data Isolation (5 pts) — Dev A

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | DB-per-tenant: D1 database provisioning on tenant create | 3h |
| 2 | Dynamic D1 binding resolution per request | 2h |
| 3 | R2 bucket path isolation (`/{tenant_id}/...`) | 2h |
| 4 | Middleware to inject tenant-scoped DB/R2 into context | 2h |
| 5 | Security tests: cross-tenant access prevention | 2h |

#### US-020: Real-Time WebSocket (5 pts) — Dev C

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | DO WebSocket handler: accept connections | 2h |
| 2 | Session event fan-out to connected clients | 3h |
| 3 | Connection lifecycle (heartbeat, close, reconnect) | 2h |
| 4 | Authentication for WebSocket upgrade requests | 2h |
| 5 | Message format definition (JSON protocol) | 1h |
| 6 | Integration tests | 2h |

### 7. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| DO hibernation complexity exceeds estimate | Medium | High | Dev A assists Dev B; spike on day 1 |
| D1 DB-per-tenant provisioning API limitations | Medium | Medium | Fallback: schema-per-tenant with row-level isolation |
| WebSocket fan-out performance under load | Low | Medium | Start with single-subscriber, optimize in Sprint 5 |
| API key auth blocking session APIs | Low | High | Develop auth in parallel; use test-mode bypass initially |

### 8. Sprint Review Checklist

- [ ] Demo: Create a session via API → DO boots → QR code returned
- [ ] Demo: Start/stop/logout session lifecycle
- [ ] Demo: API key creation → authenticated request → rejection without key
- [ ] Demo: Health endpoints responding correctly
- [ ] Demo: WebSocket connection receiving session events
- [ ] Demo: Tenant isolation — tenant A cannot access tenant B's data
- [ ] Show: All passing e2e tests

### 9. Definition of Done Verification

```bash
# Run backend e2e tests
cd e2e && pnpm test -- --testPathPattern="01-health|02-auth|03-sessions"

# Run unit tests
cd /workspaces/OpenWA && pnpm test

# Type checking
pnpm tsc --noEmit

# Lint
pnpm lint

# Verify DO deploys locally
npx wrangler dev --test-scheduled
```

### 10. e2e Test Coverage

| Test File | Stories Validated |
|-----------|-----------------|
| `01-health.e2e.ts` | US-032 |
| `02-auth.e2e.ts` | US-026, US-027 |
| `03-sessions.e2e.ts` | US-019, US-021, US-022, US-029 |

---

## Sprint 3b — Messaging, Webhooks & Remaining APIs

### 1. Sprint Goal

Complete the messaging API, contact/group endpoints, webhook delivery system with retries, rate limiting, and audit logging — finishing the entire API surface required for the dashboard phase.

### 2. Sprint Duration & Dates

| Field | Value |
|-------|-------|
| Sprint | 3b |
| Start Date | 2026-07-06 (Monday) |
| End Date | 2026-07-17 (Friday) |
| Duration | 2 weeks (10 working days) |

### 3. Capacity

| Team Member | Role | Available Days | Capacity (pts) |
|-------------|------|---------------|----------------|
| Dev A | Senior Full-Stack | 10 | ~14 |
| Dev B | Backend/Infra | 10 | ~14 |
| Dev C | Frontend | 10 | ~10 |
| **Total** | | **30 days** | **~38 pts** |

### 4. Sprint Backlog

| Story ID | Title | Points | Assignee | Priority | Dependencies | Target Days |
|----------|-------|--------|----------|----------|--------------|-------------|
| US-023 | Message Send API | 8 | Dev A | P0 | US-019, US-026 | D1–D4 |
| US-024 | Contact Endpoints | 3 | Dev C | P1 | US-026 | D1–D2 |
| US-025 | Group Endpoints | 5 | Dev C | P1 | US-026 | D3–D5 |
| US-028 | Rate Limiting | 5 | Dev B | P0 | US-026 | D1–D3 |
| US-030 | Webhook CRUD | 3 | Dev A | P0 | US-026 | D5–D6 |
| US-031 | Webhook Delivery with Retries | 5 | Dev B | P0 | US-030 | D4–D7 |
| US-033 | Audit Logging | 3 | Dev B | P1 | US-026 | D7–D8 |
| — | Spillover: US-020 fixes (if any) | 0-2 | Dev C | P2 | — | D6 |
| — | Integration testing & hardening | — | All | P0 | All | D9–D10 |

**Sprint 3b Total: 32 pts** (+ integration buffer)

### 5. Day-by-Day Schedule

| Day | Dev A | Dev B | Dev C |
|-----|-------|-------|-------|
| D1 (Jul 6) | Message API: text, image, document | Rate limiting: KV sliding window design | Contact endpoints: list, check |
| D2 (Jul 7) | Message API: video, audio, location | Rate limiting: middleware implementation | Contact endpoints: block/unblock, tests |
| D3 (Jul 8) | Message API: sticker, contact card, buttons | Rate limiting: per-plan config, tests | Group endpoints: list, create |
| D4 (Jul 9) | Message API: template messages, validation | Webhook delivery: CF Queue producer | Group endpoints: update, delete |
| D5 (Jul 10) | Webhook CRUD: create/update/delete | Webhook delivery: Queue consumer + retry | Group endpoints: participants, tests |
| D6 (Jul 13) | Webhook CRUD: URL validation, secret signing | Webhook delivery: DLQ, exponential backoff | e2e: `06-contacts.e2e.ts`, `07-groups.e2e.ts` |
| D7 (Jul 14) | Message API e2e tests | Audit logging: middleware, D1 schema | e2e: `04-messages.e2e.ts` |
| D8 (Jul 15) | Integration: full message → webhook flow | Audit logging: query endpoint, tests | e2e: `05-webhooks.e2e.ts` |
| D9 (Jul 16) | Cross-service integration testing | `10-audit.e2e.ts`, performance testing | Full regression, fix failures |
| D10 (Jul 17) | Sprint review prep, documentation | Sprint review prep, documentation | Sprint review prep, documentation |

### 6. Technical Tasks

#### US-023: Message Send API (8 pts) — Dev A

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | `POST /sessions/:id/messages/text` — text message | 2h |
| 2 | `POST /sessions/:id/messages/image` — image with caption | 2h |
| 3 | `POST /sessions/:id/messages/document` — file attachment | 2h |
| 4 | `POST /sessions/:id/messages/video` — video message | 1h |
| 5 | `POST /sessions/:id/messages/audio` — audio/voice | 1h |
| 6 | `POST /sessions/:id/messages/location` — location pin | 1h |
| 7 | `POST /sessions/:id/messages/contact` — contact card | 1h |
| 8 | `POST /sessions/:id/messages/sticker` — sticker | 1h |
| 9 | `POST /sessions/:id/messages/buttons` — interactive buttons | 2h |
| 10 | `POST /sessions/:id/messages/template` — template messages | 2h |
| 11 | Input validation schemas for all types | 2h |
| 12 | R2 media upload for images/docs/video/audio | 3h |
| 13 | Integration tests | 3h |

#### US-024: Contact Endpoints (3 pts) — Dev C

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | `GET /sessions/:id/contacts` — list contacts | 1.5h |
| 2 | `GET /sessions/:id/contacts/:phone/check` — number registered | 1.5h |
| 3 | `POST /sessions/:id/contacts/:phone/block` — block | 1h |
| 4 | `POST /sessions/:id/contacts/:phone/unblock` — unblock | 1h |
| 5 | Tests | 1.5h |

#### US-025: Group Endpoints (5 pts) — Dev C

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | `GET /sessions/:id/groups` — list groups | 1.5h |
| 2 | `POST /sessions/:id/groups` — create group | 2h |
| 3 | `PUT /sessions/:id/groups/:gid` — update group metadata | 1.5h |
| 4 | `DELETE /sessions/:id/groups/:gid` — leave group | 1h |
| 5 | `POST /sessions/:id/groups/:gid/participants` — add participants | 2h |
| 6 | `DELETE /sessions/:id/groups/:gid/participants` — remove participants | 1.5h |
| 7 | `PUT /sessions/:id/groups/:gid/participants/:pid/admin` — promote/demote | 1.5h |
| 8 | Tests | 2h |

#### US-028: Rate Limiting (5 pts) — Dev B

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | KV sliding window algorithm implementation | 3h |
| 2 | Rate limit middleware (Elysia plugin) | 2h |
| 3 | Per-plan configuration (free: 60/min, pro: 600/min) | 1.5h |
| 4 | Rate limit headers (X-RateLimit-*) | 1h |
| 5 | 429 response with Retry-After | 0.5h |
| 6 | Tests: window expiry, burst, multi-key | 2h |

#### US-030: Webhook CRUD (3 pts) — Dev A

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | `POST /webhooks` — create webhook (URL, events, secret) | 2h |
| 2 | `GET /webhooks` — list webhooks | 1h |
| 3 | `PUT /webhooks/:id` — update webhook | 1.5h |
| 4 | `DELETE /webhooks/:id` — delete webhook | 1h |
| 5 | URL validation (HTTPS only in prod, HMAC secret generation) | 1.5h |
| 6 | D1 migration for webhooks table | 0.5h |
| 7 | Tests | 1.5h |

#### US-031: Webhook Delivery with Retries (5 pts) — Dev B

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | CF Queue producer: enqueue webhook events | 2h |
| 2 | CF Queue consumer: HTTP POST delivery | 2h |
| 3 | HMAC-SHA256 signature generation | 1.5h |
| 4 | Retry logic: exponential backoff (3 attempts) | 2h |
| 5 | Dead Letter Queue for failed deliveries | 2h |
| 6 | Delivery status tracking in D1 | 1.5h |
| 7 | Integration tests with mock receiver | 2h |

#### US-033: Audit Logging (3 pts) — Dev B

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | Audit log middleware (capture action, actor, resource, timestamp) | 2h |
| 2 | D1 schema: immutable audit_logs table (no UPDATE/DELETE) | 1h |
| 3 | `GET /audit-logs` — paginated query with filters | 2h |
| 4 | Retention policy (configurable TTL) | 1h |
| 5 | Tests | 1.5h |

### 7. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| CF Queue consumer cold-start delays webhook delivery | Medium | Medium | Set concurrency=1 per queue; monitor latency |
| Rate limiting KV consistency (eventual) allows burst overrun | Medium | Low | Accept slight over-limit; add local in-memory counter |
| Message API scope creep (too many message types) | Low | Medium | MVP: text, image, document only; others in Sprint 5 |
| Webhook HMAC verification complexity for consumers | Low | Low | Provide SDK helper + documentation |

### 8. Sprint Review Checklist

- [ ] Demo: Send text/image/document message via API → delivered
- [ ] Demo: Contact lookup and block/unblock
- [ ] Demo: Group creation with participants
- [ ] Demo: Rate limit triggered → 429 response with proper headers
- [ ] Demo: Webhook created → event fires → delivery received with signature
- [ ] Demo: Failed webhook → retried → DLQ after 3 failures
- [ ] Demo: Audit log showing all API actions
- [ ] Show: All e2e tests green

### 9. Definition of Done Verification

```bash
# Full backend e2e suite
cd e2e && pnpm test

# Specific test files
pnpm test -- --testPathPattern="04-messages"
pnpm test -- --testPathPattern="05-webhooks"
pnpm test -- --testPathPattern="06-contacts"
pnpm test -- --testPathPattern="07-groups"
pnpm test -- --testPathPattern="10-audit"

# Rate limit load test
k6 run scripts/rate-limit-test.js

# Webhook delivery verification
curl -X POST http://localhost:8787/webhooks/test-delivery

# Type checking + lint
cd /workspaces/OpenWA && pnpm tsc --noEmit && pnpm lint
```

### 10. e2e Test Coverage

| Test File | Stories Validated |
|-----------|-----------------|
| `04-messages.e2e.ts` | US-023 |
| `05-webhooks.e2e.ts` | US-030, US-031 |
| `06-contacts.e2e.ts` | US-024 |
| `07-groups.e2e.ts` | US-025 |
| `10-audit.e2e.ts` | US-033 |
| `02-auth.e2e.ts` (extended) | US-028 (rate limiting assertions) |

---
