# OpenWA — User Stories & Acceptance Criteria

**Date:** 2026-05-28
**Source:** PRD v1.0, EPICS, Architecture Decisions
**Format:** "As a [user type], I want to [action] so that [benefit]."
**Definition of Done (DoD):** Each story is complete when all acceptance criteria pass, including referenced e2e and e2e-frontend tests.

---

## Global Definition of Done

Every user story is **done** when:

1. ✅ Code implements all acceptance criteria listed
2. ✅ TypeScript compiles (`bun run typecheck`) — zero errors
3. ✅ Biome lint passes (`bun run lint`) — zero warnings
4. ✅ Unit tests pass (Vitest: `bun run test`)
5. ✅ Backend e2e tests pass (`cd e2e && pnpm test` — Jest + API client)
6. ✅ Frontend e2e tests pass (`cd e2e-frontend && npx playwright test` — Playwright/Chromium)
7. ✅ No OWASP Top 10 vulnerabilities introduced
8. ✅ Code reviewed and approved
9. ✅ Deployed to staging and verified end-to-end

---

## Sprint 1 — Foundation (Phase 1)

### US-001: Monorepo Initialization

**As a** developer,
**I want** a Bun workspace monorepo with Turborepo pipelines
**so that** all packages build, lint, and test in parallel with dependency tracking.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `bun install` resolves all workspaces without error | CI pipeline |
| 2 | `turbo.json` defines `build`, `lint`, `test`, `typecheck` pipelines | File exists with correct config |
| 3 | Running `bun run build` completes successfully for all packages | CI green |
| 4 | Workspace packages can import from sibling packages via `@openwa/*` aliases | Unit test imports succeed |

**Tests:**
- CI: `bun run typecheck && bun run lint && bun run test` all pass
- No e2e tests at this stage (infra only)

---

### US-002: Code Quality Tooling

**As a** developer,
**I want** Biome configured for linting and formatting
**so that** code style is consistent and errors are caught before commit.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `bun run lint` passes on all packages with zero warnings | CI check |
| 2 | `bun run format` is idempotent (no changes after running) | CI check |
| 3 | Biome rules enforce `no-default-exports`, `no-explicit-any` | Lint error on violation |
| 4 | Pre-commit hook runs Biome (via lefthook or similar) | Local dev verification |

---

### US-003: Shared Types Package

**As a** developer,
**I want** a `packages/shared` package exporting common TypeScript types
**so that** all services share a single source of truth for data shapes.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Exports: `SessionStatus`, `MessageType`, `EventType`, `ErrorCode`, `TenantPlan` | Import from `@openwa/shared` compiles |
| 2 | Types cover all session states: `CREATED`, `CONNECTING`, `QR_READY`, `SCANNING`, `AUTHENTICATED`, `CONNECTED`, `DISCONNECTED` | Unit test enum coverage |
| 3 | Builds without errors on `bun run build` | CI |
| 4 | Zero runtime code — types only (tree-shakeable) | Bundle analysis |

---

### US-004: Validation Schemas

**As a** developer,
**I want** a `packages/validators` package with Valibot schemas
**so that** all API boundaries validate input with shared, type-safe schemas.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Valibot schemas exist for: session, message, webhook, contact, tenant, API key entities | File exports |
| 2 | Each schema has unit tests covering valid + invalid inputs | `bun run test -- packages/validators` |
| 3 | Schemas are re-exported and usable from `@openwa/validators` | Import test |
| 4 | Invalid input produces structured error messages (field + reason) | Unit test assertions |

---

### US-005: Database Schema Package (D1 + Drizzle)

**As a** developer,
**I want** a `packages/db` package with Drizzle ORM schemas for D1
**so that** all services interact with the database through type-safe, tested schemas.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Control Plane schema: `tenants`, `api_keys` tables using `sqlite-core` | Schema file compiles |
| 2 | Tenant schema: `sessions`, `messages`, `contacts`, `webhooks`, `labels`, `conversations`, `audit_logs` tables | Schema file compiles |
| 3 | No `tenant_id` column in per-tenant tables (DB-per-tenant isolation) | Schema inspection |
| 4 | Migrations generated via `drizzle-kit generate --dialect sqlite` | `bun run db:generate` succeeds |
| 5 | Migrations apply to local D1 via `wrangler d1 migrations apply --local` | Command succeeds |
| 6 | `createControlDb(d1)` and `createTenantDb(d1)` factory functions exported | Unit test |
| 7 | All columns use correct SQLite types: `text()`, `integer({ mode: 'timestamp' })` | Schema review |

**Tests:**
- Unit: Schema compilation, factory function instantiation
- Integration: Apply migrations to local D1, insert/query records

---

### US-006: CI/CD Pipeline

**As a** developer,
**I want** GitHub Actions running typecheck → lint → test on every PR
**so that** regressions are caught before merge.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | PR triggers: typecheck, lint, unit tests (all packages) | GitHub Actions workflow |
| 2 | Push to `main` triggers: full build + deploy to staging | Workflow file |
| 3 | Workflow uses Bun (not Node) for install and execution | Workflow config |
| 4 | Failing step blocks merge (branch protection) | Repo settings |
| 5 | Caches `node_modules` / `.bun` for faster runs | Workflow cache step |

---

## Sprint 2 — WhatsApp Engine (Phase 2)

### US-007: Engine Package Scaffold

**As a** developer,
**I want** Baileys forked into `packages/engine` with platform-agnostic adapter interfaces
**so that** the same engine runs on Cloudflare DO and Node.js.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `packages/engine` compiles with TypeScript strict mode | `bun run typecheck` |
| 2 | `ISessionStorage` interface defines: `get`, `set`, `delete`, `getAll` methods | Exported interface |
| 3 | `ISocketProvider` interface defines: `connect`, `send`, `close`, `onMessage`, `onClose` | Exported interface |
| 4 | All platform-specific code routed through adapter interfaces (no direct `fs`, `ws`, `crypto` imports) | Code review / grep |
| 5 | Engine exports `createEngine(config: EngineConfig)` factory | Unit test |

---

### US-008: Node.js Adapter

**As a** desktop app developer,
**I want** a Node.js adapter for the engine (filesystem + ws)
**so that** the Electron desktop app can run WhatsApp sessions locally.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `NodeSessionStorage` implements `ISessionStorage` using filesystem | Unit test |
| 2 | `NodeSocketProvider` implements `ISocketProvider` using `ws` package | Unit test |
| 3 | Engine with Node adapter connects to WhatsApp via WebSocket | Integration test (miniflare or real) |
| 4 | Session credentials persist to disk and survive restart | Integration test |

---

### US-009: Cloudflare DO Adapter

**As a** platform engineer,
**I want** a Cloudflare Durable Object adapter for the engine
**so that** WhatsApp sessions run on the serverless edge with hibernation support.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `DOSessionStorage` implements `ISessionStorage` using DO `state.storage` | Unit test |
| 2 | `DOSocketProvider` implements `ISocketProvider` using native `WebSocket()` | Unit test |
| 3 | Builds successfully for Workers runtime (no Node-only APIs) | `wrangler build` succeeds |
| 4 | Auth state serialized/deserialized correctly across hibernation | Integration test |

---

### US-010: Pure-JS Cryptographic Stack

**As a** platform engineer,
**I want** all Signal Protocol crypto replaced with Web Crypto + @noble/curves
**so that** the engine runs on Cloudflare Workers without native bindings.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Curve25519 ECDH key agreement via `@noble/curves` | Unit test: key exchange produces shared secret |
| 2 | Ed25519 signing/verification via `@noble/curves` | Unit test: sign + verify round-trip |
| 3 | AES-256-GCM/CBC via `crypto.subtle` | Unit test: encrypt + decrypt round-trip |
| 4 | HMAC-SHA256, HKDF-SHA256 via `crypto.subtle` | Unit test: known-answer tests |
| 5 | All crypto is async (no sync `crypto` module usage) | Code review / grep for `require('crypto')` |
| 6 | Crypto tests pass on both Node.js AND Workers runtime (miniflare) | CI matrix |

---

### US-011: QR Code Authentication

**As a** user,
**I want** to connect my WhatsApp by scanning a QR code
**so that** I can link my account to the platform.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Engine emits `qr` event with data string suitable for QR rendering | Unit test |
| 2 | QR auto-rotates after timeout (new QR every ~20s) | Unit test with mocked timers |
| 3 | Successful scan transitions state: `QR_READY` → `SCANNING` → `AUTHENTICATED` → `CONNECTED` | State machine test |
| 4 | Failed/expired QR emits timeout event after max attempts | Unit test |
| 5 | API endpoint `GET /sessions/:id/qr` returns current QR data | e2e: `03-sessions.e2e.ts` |
| 6 | Dashboard displays QR code with auto-refresh | e2e-frontend: `04-sessions.spec.ts` |

**e2e test:** `e2e/tests/03-sessions.e2e.ts` — `GET /sessions/:id/qr returns QR data`
**e2e-frontend test:** `e2e-frontend/tests/04-sessions.spec.ts` — `QR code displays and auto-refreshes`

---

### US-012: Phone Pairing Code Authentication

**As a** user,
**I want** to connect via a pairing code (alternative to QR)
**so that** I can link my account when camera scanning isn't practical.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Engine generates pairing code given a phone number | Unit test |
| 2 | Pairing code displayed to user (6-8 characters) | Unit test |
| 3 | Successful confirmation transitions to `AUTHENTICATED` → `CONNECTED` | State machine test |
| 4 | API endpoint `POST /sessions/:id/pairing-code` returns code | e2e: `03-sessions.e2e.ts` |
| 5 | Dashboard shows pairing code flow as alternative to QR | e2e-frontend: `04-sessions.spec.ts` |

---

### US-013: Send Text Messages

**As a** developer (API consumer),
**I want** to send text messages to WhatsApp contacts via REST API
**so that** my application can communicate with customers programmatically.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `POST /sessions/:id/messages/text` accepts `{ chatId, text }` | e2e: `04-messages.e2e.ts` |
| 2 | Message is E2E encrypted before sending to WA servers | Engine unit test |
| 3 | API returns `{ messageId, timestamp, status: 'sent' }` on success | e2e assertion |
| 4 | Invalid `chatId` format returns 422 with validation error | e2e: `04-messages.e2e.ts` |
| 5 | Sending to disconnected session returns 409 with clear error | e2e: `04-messages.e2e.ts` |
| 6 | Dashboard message tester can send text successfully | e2e-frontend: `08-message-tester.spec.ts` |

**e2e test:** `e2e/tests/04-messages.e2e.ts` — `POST text message` suite
**e2e-frontend test:** `e2e-frontend/tests/08-message-tester.spec.ts` — `Send text message`

---

### US-014: Send Media Messages

**As a** developer (API consumer),
**I want** to send images, videos, audio, and documents via API
**so that** my application can share rich media with contacts.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `POST /sessions/:id/messages/image` accepts `{ chatId, media (base64 or URL), caption? }` | e2e: `04-messages.e2e.ts` |
| 2 | `POST /sessions/:id/messages/video` with same pattern | e2e |
| 3 | `POST /sessions/:id/messages/audio` with same pattern | e2e |
| 4 | `POST /sessions/:id/messages/document` with `{ chatId, media, filename }` | e2e |
| 5 | Media encrypted with random key before upload to WA CDN | Engine unit test |
| 6 | File size > 64MB rejected with 413 error | e2e |
| 7 | Unsupported MIME type rejected with 422 | e2e |
| 8 | Dashboard media tester can send each type | e2e-frontend: `08-message-tester.spec.ts` |

---

### US-015: Receive Incoming Messages

**As a** developer (API consumer),
**I want** incoming WhatsApp messages delivered to my webhook
**so that** my application can process and respond to customer messages.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Engine decrypts incoming messages (text, media, location, contact) | Unit test |
| 2 | Incoming message event enqueued to CF Queue with full payload | Integration test |
| 3 | Webhook receives `POST` with `{ event: 'message.received', data: { ... } }` | e2e: `05-webhooks.e2e.ts` |
| 4 | Payload includes: `messageId`, `chatId`, `sender`, `type`, `content`, `timestamp` | e2e payload assertion |
| 5 | Media messages include download URL (presigned R2 URL, 1hr TTL) | e2e |
| 6 | Dashboard chat view shows incoming messages in real-time | e2e-frontend: `04-sessions.spec.ts` (if chat view exists) |

**e2e test:** `e2e/tests/05-webhooks.e2e.ts` — `Webhook delivery for incoming message`

---

### US-016: Message Operations (Reply, Forward, React, Delete)

**As a** developer (API consumer),
**I want** to reply, forward, react to, and delete messages
**so that** my application supports full conversational interactions.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `POST /sessions/:id/messages/reply` with `{ chatId, quotedMessageId, text }` | e2e: `04-messages.e2e.ts` |
| 2 | `POST /sessions/:id/messages/forward` with `{ chatId, messageId, targetChatId }` | e2e |
| 3 | `POST /sessions/:id/messages/react` with `{ chatId, messageId, emoji }` | e2e |
| 4 | `DELETE /sessions/:id/messages/:messageId?forEveryone=true` | e2e |
| 5 | Non-existent `messageId` returns 404 | e2e |
| 6 | Each operation emits corresponding event to webhook | e2e: `05-webhooks.e2e.ts` |

---

### US-017: Session State Machine

**As a** platform engineer,
**I want** the engine to follow a strict state machine for session lifecycle
**so that** session states are predictable and observable.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Valid states: `CREATED` → `CONNECTING` → `QR_READY` → `SCANNING` → `AUTHENTICATED` → `CONNECTED` → `DISCONNECTED` | Unit test |
| 2 | Invalid transitions rejected (e.g., `CREATED` → `CONNECTED`) | Unit test throws |
| 3 | State transitions emit events with `{ previousState, newState, timestamp }` | Unit test |
| 4 | `GET /sessions/:id` returns current state | e2e: `03-sessions.e2e.ts` |
| 5 | Dashboard shows real-time state indicator per session | e2e-frontend: `04-sessions.spec.ts` |

---

### US-018: Automatic Reconnection

**As a** user,
**I want** disconnected sessions to automatically reconnect
**so that** my WhatsApp connection recovers without manual intervention.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | On disconnect, engine retries with exponential backoff (1s, 2s, 4s, 8s, 16s max) | Unit test with mocked socket |
| 2 | Reconnection uses persisted auth (no re-scan needed) | Integration test |
| 3 | Recovery completes in < 5s for typical disconnects | Performance test |
| 4 | After max retries (5), session enters `DISCONNECTED` state permanently | Unit test |
| 5 | Webhook fires `session.disconnected` event with retry count | e2e: `05-webhooks.e2e.ts` |
| 6 | Dashboard shows "Reconnecting..." indicator | e2e-frontend: `04-sessions.spec.ts` |

---

## Sprint 3 — Infrastructure Layer (Phase 3)

### US-019: Durable Object Session Host

**As a** platform engineer,
**I want** a Durable Object class that hosts one WhatsApp engine per session
**so that** sessions are isolated, hibernatable, and auto-scaling.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | DO class with `fetch()` and `alarm()` handlers deployed to CF | `wrangler deploy` succeeds |
| 2 | DO receives RPC: `start`, `stop`, `logout`, `destroy`, `sendMessage`, `getStatus`, `getQR` | Integration test via stub |
| 3 | Engine state persisted to DO storage on every mutation | Unit test: storage write on state change |
| 4 | After hibernation + wake, session resumes within 5s | Integration test |
| 5 | Memory stays under 128MB (lazy-load contacts/groups) | Memory profiling test |
| 6 | Alarm fires every 25s for keep-alive ping | Integration test |

---

### US-020: Real-Time WebSocket (DO → Dashboard)

**As a** dashboard user,
**I want** real-time updates when messages arrive or session status changes
**so that** I see live information without manual refresh.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | DO accepts WebSocket upgrade on `/ws` path | Integration test |
| 2 | Connection authenticated via session cookie token | Unit test |
| 3 | Events broadcast: `message.received`, `message.sent`, `session.status`, `session.qr` | Integration test |
| 4 | Multiple dashboard tabs receive same events (fan-out) | Integration test |
| 5 | Reconnection on disconnect with queued missed events | Unit test |
| 6 | Dashboard UI updates reactively (TanStack Query invalidation) | e2e-frontend: `04-sessions.spec.ts` |

**e2e-frontend test:** `e2e-frontend/tests/04-sessions.spec.ts` — `Real-time status updates via WebSocket`

---

### US-021: Session CRUD API

**As a** developer (API consumer),
**I want** REST endpoints to create, list, get, and delete WhatsApp sessions
**so that** I can manage sessions programmatically.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `POST /sessions` with `{ name, proxyUrl? }` → 201 with session object | e2e: `03-sessions.e2e.ts` |
| 2 | `GET /sessions` returns paginated list of tenant's sessions | e2e: `03-sessions.e2e.ts` |
| 3 | `GET /sessions/:id` returns session details + current state | e2e: `03-sessions.e2e.ts` |
| 4 | `DELETE /sessions/:id` removes session, cleans up DO and D1 record | e2e: `03-sessions.e2e.ts` |
| 5 | Session name must be unique per tenant (409 on duplicate) | e2e |
| 6 | Creating session beyond plan limit returns 403 | e2e |
| 7 | Cross-tenant session access returns 404 (not 403, to prevent enumeration) | e2e |
| 8 | Audit log entry created for create/delete operations | e2e: `10-audit.e2e.ts` |

**e2e test:** `e2e/tests/03-sessions.e2e.ts` — full CRUD suite
**e2e-frontend test:** `e2e-frontend/tests/04-sessions.spec.ts` — `Create, list, delete sessions`

---

### US-022: Session Lifecycle API

**As a** developer (API consumer),
**I want** endpoints to start, stop, and logout WhatsApp sessions
**so that** I can control the connection lifecycle.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `POST /sessions/:id/start` initiates WA connection → returns QR data or pairing prompt | e2e: `03-sessions.e2e.ts` |
| 2 | `POST /sessions/:id/stop` gracefully disconnects → state becomes `DISCONNECTED` | e2e |
| 3 | `POST /sessions/:id/logout` clears auth credentials → requires re-scan on next start | e2e |
| 4 | Starting already-connected session returns 409 | e2e |
| 5 | Stopping already-stopped session returns 409 | e2e |
| 6 | Each action emits webhook event (`session.started`, `session.stopped`, `session.logged_out`) | e2e: `05-webhooks.e2e.ts` |

---

### US-023: Message Send API (All Types)

**As a** developer (API consumer),
**I want** type-specific endpoints for sending all message types
**so that** I have clear, validated interfaces for each message format.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `POST /sessions/:id/messages/text` — `{ chatId, text }` | e2e: `04-messages.e2e.ts` |
| 2 | `POST /sessions/:id/messages/image` — `{ chatId, media, caption? }` | e2e |
| 3 | `POST /sessions/:id/messages/video` — `{ chatId, media, caption? }` | e2e |
| 4 | `POST /sessions/:id/messages/audio` — `{ chatId, media }` | e2e |
| 5 | `POST /sessions/:id/messages/document` — `{ chatId, media, filename }` | e2e |
| 6 | `POST /sessions/:id/messages/location` — `{ chatId, lat, lng, name? }` | e2e |
| 7 | `POST /sessions/:id/messages/contact` — `{ chatId, vcard }` | e2e |
| 8 | `POST /sessions/:id/messages/sticker` — `{ chatId, media }` | e2e |
| 9 | All endpoints validate payload with Valibot → 422 on invalid | e2e |
| 10 | All endpoints require valid session in `CONNECTED` state → 409 otherwise | e2e |
| 11 | All endpoints return `{ messageId, timestamp, status }` | e2e |

**e2e test:** `e2e/tests/04-messages.e2e.ts` — complete message type suite

---

### US-024: Contact Endpoints

**As a** developer (API consumer),
**I want** REST endpoints to list contacts, check numbers, and manage blocking
**so that** my application can manage WhatsApp contacts.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `GET /sessions/:id/contacts` returns contact list with name, phone, JID | e2e: `06-contacts.e2e.ts` |
| 2 | `GET /sessions/:id/contacts/:jid` returns single contact details | e2e |
| 3 | `POST /sessions/:id/contacts/check` with `{ phones: [...] }` → returns which exist on WA | e2e |
| 4 | `GET /sessions/:id/contacts/:jid/photo` returns profile picture URL | e2e |
| 5 | `POST /sessions/:id/contacts/:jid/block` blocks the contact | e2e |
| 6 | `POST /sessions/:id/contacts/:jid/unblock` unblocks the contact | e2e |
| 7 | Invalid phone format returns 422 | e2e |

**e2e test:** `e2e/tests/06-contacts.e2e.ts` — full contact suite

---

### US-025: Group Endpoints

**As a** developer (API consumer),
**I want** REST endpoints for group management
**so that** my application can create and manage WhatsApp groups.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `GET /sessions/:id/groups` returns list of groups with metadata | e2e: `07-groups.e2e.ts` |
| 2 | `POST /sessions/:id/groups` creates group with `{ subject, participants[] }` | e2e |
| 3 | `GET /sessions/:id/groups/:groupId` returns full group info (subject, desc, participants, admins) | e2e |
| 4 | `PATCH /sessions/:id/groups/:groupId` updates subject/description | e2e |
| 5 | `POST /sessions/:id/groups/:groupId/participants/add` adds participants | e2e |
| 6 | `POST /sessions/:id/groups/:groupId/participants/remove` removes participants | e2e |
| 7 | `GET /sessions/:id/groups/:groupId/invite-link` returns invite link | e2e |
| 8 | Non-admin attempting admin actions returns 403 | e2e |

**e2e test:** `e2e/tests/07-groups.e2e.ts` — full group suite

---

### US-026: API Key Authentication

**As a** developer (API consumer),
**I want** to authenticate via API keys with role-based access
**so that** I can securely access the API with appropriate permissions.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | API keys prefixed with `openwa_sk_` for identification | e2e: `02-auth.e2e.ts` |
| 2 | Keys stored as SHA-256 hash (full key never stored) | Code review + unit test |
| 3 | `X-API-Key` header required on all non-health endpoints | e2e: `02-auth.e2e.ts` |
| 4 | Invalid key returns 401 `{ error: 'Unauthorized' }` | e2e: `02-auth.e2e.ts` |
| 5 | Revoked key returns 401 | e2e: `02-auth.e2e.ts` |
| 6 | Roles: `admin`, `operator`, `viewer` with appropriate access levels | e2e: `02-auth.e2e.ts` |
| 7 | `viewer` cannot perform write operations (POST/PATCH/DELETE) → 403 | e2e |
| 8 | `operator` can manage sessions/messages but not API keys → 403 | e2e |
| 9 | Key creation returns full key ONCE (never retrievable again) | e2e: `02-auth.e2e.ts` |

**e2e test:** `e2e/tests/02-auth.e2e.ts` — full auth suite
**e2e-frontend test:** `e2e-frontend/tests/06-api-keys.spec.ts` — `API key management UI`

---

### US-027: API Key Management

**As an** admin,
**I want** to create, list, and revoke API keys
**so that** I control access to my tenant's resources.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `POST /api-keys` with `{ name, role }` → 201 with `{ id, apiKey, name, role, prefix }` | e2e: `02-auth.e2e.ts` |
| 2 | `GET /api-keys` returns list (prefix + metadata only, never full key) | e2e |
| 3 | `GET /api-keys/:id` returns key details including `lastUsedAt` | e2e |
| 4 | `DELETE /api-keys/:id` soft-deletes (revokes) the key | e2e |
| 5 | Only `admin` role can manage keys | e2e: `02-auth.e2e.ts` |
| 6 | Cannot revoke the last admin key (409) | e2e |
| 7 | Audit log entry on create/revoke | e2e: `10-audit.e2e.ts` |

**e2e-frontend test:** `e2e-frontend/tests/06-api-keys.spec.ts` — `Create, list, revoke API keys`

---

### US-028: Rate Limiting

**As a** platform operator,
**I want** per-key sliding window rate limiting
**so that** no single tenant can overwhelm the platform.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Rate limit applied per API key using KV-backed sliding window | Integration test |
| 2 | Plan-based limits: Free=10/s, Pro=50/s, Business=200/s | Unit test per plan |
| 3 | Exceeded limit returns 429 with `Retry-After` header | e2e: `02-auth.e2e.ts` |
| 4 | Rate limit headers on every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` | e2e |
| 5 | Health endpoints exempt from rate limiting | e2e: `01-health.e2e.ts` |

---

### US-029: Tenant Data Isolation

**As a** tenant,
**I want** my data physically isolated from other tenants
**so that** there's zero risk of data leakage.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Each tenant gets a dedicated D1 database instance | Code: `getTenantDb()` resolves per-tenant binding |
| 2 | API key resolves to tenant → all queries hit tenant's DB only | Integration test |
| 3 | No `tenant_id` column needed (physical isolation) | Schema inspection |
| 4 | Cross-tenant access attempt returns 404 (not 403) | e2e: `03-sessions.e2e.ts` (multi-tenant) |
| 5 | R2 media stored under tenant-prefixed paths | Code review |
| 6 | Webhook payloads never include other tenant's data | e2e: `05-webhooks.e2e.ts` |

---

### US-030: Webhook CRUD

**As a** developer (API consumer),
**I want** to create, update, and delete webhook endpoints per session
**so that** I receive event notifications at my server.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `POST /sessions/:id/webhooks` with `{ url, events[], secret? }` → 201 | e2e: `05-webhooks.e2e.ts` |
| 2 | `GET /sessions/:id/webhooks` returns webhook list for session | e2e |
| 3 | `PATCH /webhooks/:id` updates URL, events, or active status | e2e |
| 4 | `DELETE /webhooks/:id` removes webhook | e2e |
| 5 | URL must be HTTPS (reject HTTP with 422) | e2e |
| 6 | `events` supports wildcard `*` (receive all events) | e2e |
| 7 | Test delivery: `POST /webhooks/:id/test` sends sample payload | e2e |
| 8 | Dashboard webhook management page functional | e2e-frontend: `05-webhooks.spec.ts` |

**e2e test:** `e2e/tests/05-webhooks.e2e.ts` — full webhook CRUD + delivery suite
**e2e-frontend test:** `e2e-frontend/tests/05-webhooks.spec.ts` — `Webhook management UI`

---

### US-031: Webhook Delivery with Retries

**As a** developer (API consumer),
**I want** webhook deliveries retried on failure with exponential backoff
**so that** transient errors don't cause missed events.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Events delivered via CF Queues consumer worker | Architecture test |
| 2 | Delivery includes `X-OpenWA-Signature` (HMAC-SHA256 of body using webhook secret) | e2e: `05-webhooks.e2e.ts` |
| 3 | Delivery includes `X-OpenWA-Event` header with event type | e2e |
| 4 | On 4xx/5xx/timeout: retry up to 3 times (1s, 4s, 16s backoff) | Integration test |
| 5 | After 3 failures: event moves to Dead Letter Queue | Integration test |
| 6 | DLQ queryable via `GET /webhooks/dlq` | e2e |
| 7 | Webhook `lastDeliveryStatus` updated after each attempt | e2e |
| 8 | Delivery timeout: 10 seconds | Integration test |

---

### US-032: Health Endpoints

**As a** ops engineer,
**I want** health check endpoints
**so that** I can monitor service availability.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `GET /health` returns 200 `{ status: 'ok', timestamp, version }` | e2e: `01-health.e2e.ts` |
| 2 | `GET /health/live` returns 200 (liveness probe) | e2e: `01-health.e2e.ts` |
| 3 | `GET /health/ready` checks D1 + DO availability | e2e: `01-health.e2e.ts` |
| 4 | All health endpoints accessible without authentication | e2e: `01-health.e2e.ts` |
| 5 | Health returns valid ISO 8601 timestamp | e2e: `01-health.e2e.ts` |

**e2e test:** `e2e/tests/01-health.e2e.ts` — full health suite

---

### US-033: Audit Logging

**As an** admin,
**I want** all sensitive operations logged in an immutable audit trail
**so that** I can investigate security incidents and track changes.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Audit log entries created for: session CRUD, key create/revoke, webhook changes, login | Integration test |
| 2 | Each entry: `{ id, action, actorId, resource, resourceId, metadata, timestamp }` | Schema test |
| 3 | `GET /audit-logs?action=&from=&to=&limit=` returns paginated logs | e2e: `10-audit.e2e.ts` |
| 4 | Logs are append-only (no update/delete endpoints) | e2e: verify no PATCH/DELETE for audit |
| 5 | Filterable by action, date range, actor | e2e: `10-audit.e2e.ts` |
| 6 | Dashboard logs page shows audit trail with filters | e2e-frontend: `07-logs.spec.ts` |

**e2e test:** `e2e/tests/10-audit.e2e.ts` — audit log suite
**e2e-frontend test:** `e2e-frontend/tests/07-logs.spec.ts` — `Audit log page`

---

## Sprint 4 — Dashboard (Phase 4)

### US-034: Dashboard Authentication (Login/Register)

**As a** dashboard user,
**I want** to log in with email/password or OAuth
**so that** I can securely access my tenant's dashboard.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Login page at `/login` with email + password form | e2e-frontend: `01-login.spec.ts` |
| 2 | OAuth buttons for GitHub + Google | e2e-frontend: `01-login.spec.ts` |
| 3 | Successful login sets httpOnly session cookie (not localStorage) | Security test |
| 4 | Invalid credentials show error message (no account enumeration) | e2e-frontend: `01-login.spec.ts` |
| 5 | Session validated via server function (KV-cached, 5min TTL) | Integration test |
| 6 | Unauthenticated access to dashboard redirects to `/login` | e2e-frontend: `12-auth-persistence.spec.ts` |
| 7 | Logout clears session cookie and redirects to `/login` | e2e-frontend |

**e2e-frontend test:** `e2e-frontend/tests/01-login.spec.ts` — full login suite

---

### US-035: Dashboard Layout & Navigation

**As a** dashboard user,
**I want** a responsive layout with sidebar navigation
**so that** I can easily navigate between sections.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Sidebar with links: Dashboard, Sessions, Webhooks, API Keys, Logs, Settings | e2e-frontend: `02-navigation.spec.ts` |
| 2 | Active route highlighted in sidebar | e2e-frontend |
| 3 | Sidebar collapses on mobile (hamburger menu) | e2e-frontend: `11-theme-responsive.spec.ts` |
| 4 | Header shows tenant name + user menu (settings, logout) | e2e-frontend |
| 5 | Dark/light mode toggle persists preference | e2e-frontend: `11-theme-responsive.spec.ts` |
| 6 | All navigation links resolve without 404 | e2e-frontend: `02-navigation.spec.ts` |

**e2e-frontend test:** `e2e-frontend/tests/02-navigation.spec.ts` — navigation suite

---

### US-036: Dashboard Overview Page

**As a** dashboard user,
**I want** a summary page showing key metrics
**so that** I can see platform health at a glance.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Stats cards: active sessions, messages today, webhook delivery rate | e2e-frontend: `03-dashboard.spec.ts` |
| 2 | Session list with status indicators (connected/disconnected) | e2e-frontend |
| 3 | Data loaded via server function (SSR + hydrate) | Network tab: no external API call |
| 4 | Auto-refreshes every 30s | e2e-frontend (time-based) |
| 5 | Responsive grid layout (1 col mobile, 2-3 col desktop) | e2e-frontend: `11-theme-responsive.spec.ts` |

**e2e-frontend test:** `e2e-frontend/tests/03-dashboard.spec.ts` — dashboard overview suite

---

### US-037: Session Management UI

**As a** dashboard user,
**I want** to create, view, start, stop, and delete sessions from the UI
**so that** I can manage WhatsApp connections without using the API directly.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Session list page shows all sessions with name, status, created date | e2e-frontend: `04-sessions.spec.ts` |
| 2 | "Create Session" button opens form (name field, optional proxy URL) | e2e-frontend |
| 3 | Created session appears in list immediately | e2e-frontend |
| 4 | Click session → detail view with Start/Stop/Logout/Delete actions | e2e-frontend |
| 5 | Start → shows QR code or pairing code | e2e-frontend |
| 6 | Delete requires confirmation dialog | e2e-frontend |
| 7 | Status updates in real-time via WebSocket (no page refresh) | e2e-frontend |
| 8 | Search/filter sessions by name or status | e2e-frontend |

**e2e-frontend test:** `e2e-frontend/tests/04-sessions.spec.ts` — full session management suite

---

### US-038: Webhook Management UI

**As a** dashboard user,
**I want** to manage webhooks through the UI
**so that** I can configure event notifications without API calls.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Webhook list page shows all webhooks with URL, events, active status | e2e-frontend: `05-webhooks.spec.ts` |
| 2 | Create form: URL input, event type checkboxes, secret field | e2e-frontend |
| 3 | Edit inline (URL, events, toggle active) | e2e-frontend |
| 4 | "Test" button sends sample payload and shows result | e2e-frontend |
| 5 | Delete with confirmation | e2e-frontend |
| 6 | Last delivery status badge (success/failure/pending) | e2e-frontend |
| 7 | Validation: URL must be HTTPS, show error for HTTP | e2e-frontend |

**e2e-frontend test:** `e2e-frontend/tests/05-webhooks.spec.ts` — webhook management suite

---

### US-039: API Key Management UI

**As an** admin dashboard user,
**I want** to create and revoke API keys from the UI
**so that** I can manage access without CLI/API knowledge.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | API key list: shows prefix, name, role, created date, last used | e2e-frontend: `06-api-keys.spec.ts` |
| 2 | Create: name + role selector → shows full key ONCE with copy button | e2e-frontend |
| 3 | Revoke button with confirmation dialog | e2e-frontend |
| 4 | Page only accessible to `admin` role (hidden for operator/viewer) | e2e-frontend |
| 5 | Warning displayed when revoking | e2e-frontend |

**e2e-frontend test:** `e2e-frontend/tests/06-api-keys.spec.ts` — API key UI suite

---

### US-040: Audit Log Viewer

**As an** admin dashboard user,
**I want** to view the audit trail in the dashboard
**so that** I can monitor what actions have been taken.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Logs page shows paginated table (action, actor, resource, timestamp) | e2e-frontend: `07-logs.spec.ts` |
| 2 | Filter by action type dropdown | e2e-frontend |
| 3 | Filter by date range picker | e2e-frontend |
| 4 | Sortable by timestamp (newest first default) | e2e-frontend |
| 5 | Click row → expanded detail view with full metadata | e2e-frontend |
| 6 | Pagination: next/prev with page size selector | e2e-frontend |

**e2e-frontend test:** `e2e-frontend/tests/07-logs.spec.ts` — audit log viewer suite

---

### US-041: Message Tester

**As a** dashboard user,
**I want** a message testing tool in the dashboard
**so that** I can quickly send test messages without writing code.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Form: session selector, chat ID input, message type selector | e2e-frontend: `08-message-tester.spec.ts` |
| 2 | Text message: text input → send → show success/error | e2e-frontend |
| 3 | Image: file upload or URL + optional caption → send | e2e-frontend |
| 4 | Video: file upload or URL + optional caption → send | e2e-frontend |
| 5 | Audio: file upload or URL → send | e2e-frontend |
| 6 | Document: file upload + filename → send | e2e-frontend |
| 7 | Response shows: message ID, delivery status | e2e-frontend |
| 8 | Error messages displayed clearly (session not connected, invalid chat) | e2e-frontend |

**e2e-frontend test:** `e2e-frontend/tests/08-message-tester.spec.ts` — message tester suite

---

### US-042: Infrastructure Status Page

**As an** admin dashboard user,
**I want** to see the health of all platform components
**so that** I can diagnose connectivity issues.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Shows status of: D1 database, Durable Objects, Queues, KV, R2 | e2e-frontend: `09-infrastructure.spec.ts` |
| 2 | Each component shows: status (ok/degraded/error), latency, last checked | e2e-frontend |
| 3 | Auto-refreshes every 30s | e2e-frontend |
| 4 | Manual "Check Now" button triggers immediate recheck | e2e-frontend |
| 5 | Only visible to admin role | e2e-frontend |

**e2e-frontend test:** `e2e-frontend/tests/09-infrastructure.spec.ts` — infrastructure status suite

---

## Sprint 5 — Desktop App (Phase 5)

### US-043: Electron App Scaffold

**As a** self-hosted user,
**I want** to download and install a desktop app
**so that** I can run WhatsApp locally without cloud infrastructure.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | App installs on macOS (.dmg), Windows (.exe/NSIS), Linux (.AppImage, .deb) | Build pipeline output |
| 2 | Main process + renderer process architecture | Architecture test |
| 3 | Renderer uses same `@openwa/ui` components as web dashboard | Component import verification |
| 4 | App launches and shows login/setup screen | Manual + smoke test |
| 5 | Window close → minimize to system tray (configurable) | Desktop test |

---

### US-044: Local Engine Manager

**As a** self-hosted user,
**I want** the desktop app to run WhatsApp sessions locally
**so that** I don't need cloud infrastructure.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Engine runs in main process using Node adapter | Process verification |
| 2 | Session credentials stored in app data directory (encrypted) | File system check |
| 3 | Multiple sessions supported simultaneously | Integration test |
| 4 | Start/stop/restart via IPC from renderer | IPC test |
| 5 | Engine consumes < 50MB RAM per session | Memory profiling |

---

### US-045: System Tray & Notifications

**As a** self-hosted user,
**I want** the app to run in the background with native notifications
**so that** I'm alerted to incoming messages without keeping the window open.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | System tray icon shows connection status (green/yellow/red) | Desktop test |
| 2 | Tray menu: Show Window, Sessions (submenu), Quit | Desktop test |
| 3 | Incoming message triggers native OS notification | Notification test |
| 4 | Clicking notification opens chat in app window | Desktop test |
| 5 | Notification preferences configurable (mute, schedule) | Settings test |

---

### US-046: Auto-Updater

**As a** self-hosted user,
**I want** the app to update itself automatically
**so that** I always have the latest features and security fixes.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Checks for updates on startup + every 4 hours | Update check test |
| 2 | Downloads update in background | Network test |
| 3 | Shows notification: "Update available — Restart to apply" | UI test |
| 4 | User can defer update | UI test |
| 5 | Updates served from GitHub Releases | Release pipeline |

---

## Sprint 6 — Multi-Tenant SaaS (Phase 6)

### US-047: Tenant Registration

**As a** new user,
**I want** to register and create a tenant account
**so that** I can start using the platform.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Registration page: name, email, password, tenant name | e2e-frontend (when implemented) |
| 2 | Email verification required before activation | Integration test |
| 3 | On verification: create tenant record in Control Plane D1, provision tenant D1 database | Integration test |
| 4 | Auto-generate first admin API key | Integration test |
| 5 | Redirect to dashboard with onboarding flow | e2e-frontend |
| 6 | Duplicate email returns 409 | e2e |
| 7 | Weak password rejected (min 8 chars, complexity) | e2e |

---

### US-048: Plan-Based Limits

**As a** platform operator,
**I want** plan-based resource limits enforced
**so that** each tier gets appropriate resource allocation.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Plans defined: Free (1 session, 1K msg/day), Pro (3 sessions, 10K msg/day), Business (10 sessions, unlimited) | Config test |
| 2 | Creating session beyond plan limit → 403 with upgrade prompt | e2e |
| 3 | Sending message beyond daily limit → 429 with limit info | e2e |
| 4 | API rate limit scales with plan (10/50/200 req/s) | e2e |
| 5 | Media storage limit enforced per plan | e2e |
| 6 | Dashboard shows current usage vs limits | e2e-frontend |

---

### US-049: Usage Metering

**As a** tenant admin,
**I want** to see my usage metrics
**so that** I know how close I am to plan limits.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Track: active sessions, messages sent (daily/monthly), media storage, API calls | Integration test |
| 2 | `GET /tenant/usage` returns current usage metrics | e2e: `09-stats.e2e.ts` |
| 3 | Usage dashboard page with visual gauges | e2e-frontend |
| 4 | Alert when usage reaches 80% of plan limit | Integration test |
| 5 | Counters reset on billing period (monthly) | Integration test |

**e2e test:** `e2e/tests/09-stats.e2e.ts` — usage stats suite

---

### US-050: Billing Integration

**As a** tenant admin,
**I want** to subscribe to a paid plan via Stripe
**so that** I can unlock higher limits.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Plan selection page with pricing comparison | e2e-frontend |
| 2 | "Upgrade" redirects to Stripe Checkout | Integration test |
| 3 | Successful payment → Stripe webhook → update tenant plan in D1 | Integration test |
| 4 | Cancellation → downgrade at end of period | Integration test |
| 5 | Failed payment → grace period (3 days) → freeze tenant | Integration test |
| 6 | Invoice history viewable in dashboard | e2e-frontend |

---

## Sprint 7 — CRM & Mart (Phase 7)

### US-051: CRM Contact Management

**As a** small business owner,
**I want** to manage contacts with tags and metadata
**so that** I can organize my customer relationships.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `GET /crm/contacts` returns enriched contacts (WA JID + tags + metadata) | e2e |
| 2 | `POST /crm/contacts` creates contact with custom fields | e2e |
| 3 | `PATCH /crm/contacts/:id` updates tags/metadata | e2e |
| 4 | Tag CRUD: `GET/POST/DELETE /crm/tags` | e2e |
| 5 | Filter contacts by tag(s) | e2e |
| 6 | Dashboard contact list with tag filters and search | e2e-frontend |
| 7 | Bulk import from CSV with column mapping | e2e-frontend |
| 8 | Export contacts to CSV | e2e |

---

### US-052: Conversation Management

**As a** small business owner,
**I want** conversations tracked with status and assignment
**so that** my team can manage customer interactions efficiently.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Conversation auto-created on first message from contact | Integration test |
| 2 | `GET /crm/conversations` returns list with `status`, `assignedTo`, `unreadCount`, `lastMessageAt` | e2e |
| 3 | `PATCH /crm/conversations/:id` sets status (open/closed/archived) and assignee | e2e |
| 4 | Filter by status, assignee | e2e |
| 5 | Dashboard inbox view with conversation list | e2e-frontend |
| 6 | Unread count badge in sidebar | e2e-frontend |

---

### US-053: Mart Store Linking

**As a** Mart store owner,
**I want** to link my Mart store to OpenWA
**so that** I can send automated notifications to customers.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `POST /integrations/mart/link` with `{ martOrgId, sharedSecret }` establishes link | e2e |
| 2 | Verification: OpenWA calls Mart API to confirm ownership | Integration test |
| 3 | Linked store visible in dashboard Integrations page | e2e-frontend |
| 4 | Unlink removes all integration data | e2e |

---

### US-054: Order Notifications

**As a** Mart store owner,
**I want** automatic WhatsApp messages sent on order events
**so that** customers receive instant updates.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Incoming `order.placed` webhook from Mart triggers WA message to customer | Integration test |
| 2 | Incoming `shipping.updated` webhook sends tracking info | Integration test |
| 3 | Message templates with variables: `{{order_id}}`, `{{total}}`, `{{tracking_url}}` | Unit test |
| 4 | Template management UI in dashboard | e2e-frontend |
| 5 | Failed delivery logged and retried | Integration test |
| 6 | Customer phone resolved from Mart customer data | Integration test |

---

### US-055: Cart Abandonment Recovery

**As a** Mart store owner,
**I want** recovery messages sent for abandoned carts
**so that** I can recover lost sales.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `cart.abandoned` event from Mart triggers delayed message (configurable: 1hr, 4hr, 24hr) | Integration test |
| 2 | Message includes cart summary and recovery link | Unit test (template) |
| 3 | Opt-out: customer can reply "STOP" to disable future messages | Integration test |
| 4 | Recovery rate tracked (message sent → order placed within 24hr) | Analytics test |
| 5 | Dashboard shows recovery metrics | e2e-frontend |

---

### US-056: Contact Sync (Mart ↔ OpenWA)

**As a** Mart store owner,
**I want** contacts synced between Mart CRM and OpenWA
**so that** customer data is consistent across platforms.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | New Mart customer → auto-create OpenWA CRM contact | Integration test |
| 2 | OpenWA contact tag update → push to Mart CRM tags | Integration test |
| 3 | Sync is bidirectional and conflict-free (last-write-wins for metadata) | Integration test |
| 4 | Sync status visible in dashboard | e2e-frontend |
| 5 | Manual "Sync Now" button for full resync | e2e-frontend |

---

## Sprint 8 — Operations & Launch (Phase 8)

### US-057: Structured Logging

**As a** platform operator,
**I want** all services to emit structured JSON logs
**so that** I can query and alert on production issues.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | All Workers emit JSON logs with: `requestId`, `tenantId`, `sessionId`, `level`, `message` | Code review |
| 2 | Logs queryable in Cloudflare dashboard (Logpush or Workers Logs) | Manual verification |
| 3 | Error logs include stack trace and request context | Integration test |
| 4 | No sensitive data in logs (no API keys, no message content) | Security review |

---

### US-058: Error Tracking

**As a** platform operator,
**I want** unhandled exceptions captured with context
**so that** I can fix bugs before users report them.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Sentry (or equivalent) captures unhandled rejections/exceptions | Integration test |
| 2 | Error includes: stack trace, request metadata, tenant context | Sentry dashboard |
| 3 | Alert fires on error rate > 1% (configurable threshold) | Alert rule config |
| 4 | Source maps uploaded for readable stack traces | Build pipeline |

---

### US-059: Label Management

**As a** developer (API consumer),
**I want** to manage WhatsApp Business labels via API
**so that** my application can organize chats with labels.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `GET /sessions/:id/labels` returns label list | e2e: `13-labels.e2e.ts` |
| 2 | `POST /sessions/:id/labels/:labelId/chats` assigns label to chat | e2e |
| 3 | `DELETE /sessions/:id/labels/:labelId/chats/:chatId` removes label | e2e |
| 4 | Labels synced from WhatsApp Business account | Integration test |

**e2e test:** `e2e/tests/13-labels.e2e.ts` — label management suite

---

### US-060: Status/Stories Endpoints

**As a** developer (API consumer),
**I want** to post and manage WhatsApp Status/Stories
**so that** my application can publish status updates.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `POST /sessions/:id/status/text` with `{ text, backgroundColor? }` | e2e: `12-status.e2e.ts` |
| 2 | `POST /sessions/:id/status/image` with `{ media, caption? }` | e2e |
| 3 | `POST /sessions/:id/status/video` with `{ media, caption? }` | e2e |
| 4 | `GET /sessions/:id/status` returns current statuses | e2e |
| 5 | `DELETE /sessions/:id/status/:statusId` removes a status | e2e |

**e2e test:** `e2e/tests/12-status.e2e.ts` — status management suite

---

### US-061: Eden Treaty Type-Safe SDK

**As a** developer (API consumer),
**I want** a type-safe JavaScript SDK generated from the API types
**so that** I get autocomplete and compile-time validation for API calls.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `@openwa/sdk-js` package published to npm | npm registry check |
| 2 | All Elysia endpoints callable with full type inference | TypeScript compilation test |
| 3 | SDK handles auth (API key injection) automatically | Unit test |
| 4 | SDK handles errors with typed error responses | Unit test |
| 5 | README with quickstart example | Package README |
| 6 | Python SDK (`@openwa/sdk-python`) with async support | PyPI publication |

---

### US-062: API Documentation

**As a** developer (API consumer),
**I want** comprehensive API documentation with examples
**so that** I can integrate quickly without trial and error.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | OpenAPI/Swagger spec auto-generated from Elysia types | Spec file output |
| 2 | Interactive API playground (Swagger UI or Scalar) | Deployed documentation |
| 3 | Every endpoint has request + response examples | Documentation review |
| 4 | Authentication guide with code samples (JS, Python, cURL) | Documentation review |
| 5 | Webhook event reference (all event types + payloads) | Documentation review |
| 6 | Quickstart: register → API key → send message in < 5 minutes | Time-to-first-message test |

---

### US-063: Settings Management

**As a** dashboard user,
**I want** to view and update tenant settings
**so that** I can configure my account.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | `GET /tenant/settings` returns current settings | e2e: `08-settings.e2e.ts` |
| 2 | `PATCH /tenant/settings` updates tenant name, notification preferences | e2e |
| 3 | Dashboard settings page with form | e2e-frontend |
| 4 | Shows current plan + usage summary | e2e-frontend |
| 5 | Only admin can change settings | e2e: role check |

**e2e test:** `e2e/tests/08-settings.e2e.ts` — settings suite

---

### US-064: Plugin Management UI

**As an** admin dashboard user,
**I want** to view and toggle plugins
**so that** I can extend platform functionality.

**Acceptance Criteria:**

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Plugin list page shows installed plugins with status (enabled/disabled) | e2e-frontend: `10-plugins.spec.ts` |
| 2 | Toggle enables/disables plugin | e2e-frontend |
| 3 | Plugin config modal for settings | e2e-frontend |
| 4 | Only admin can manage plugins | e2e-frontend |

**e2e-frontend test:** `e2e-frontend/tests/10-plugins.spec.ts` — plugin management suite

---

## Appendix A: Test File Mapping

| e2e Backend Test | Stories Covered |
|-----------------|----------------|
| `01-health.e2e.ts` | US-032 |
| `02-auth.e2e.ts` | US-026, US-027, US-028 |
| `03-sessions.e2e.ts` | US-011, US-012, US-021, US-022, US-029 |
| `04-messages.e2e.ts` | US-013, US-014, US-016, US-023 |
| `05-webhooks.e2e.ts` | US-015, US-030, US-031 |
| `06-contacts.e2e.ts` | US-024 |
| `07-groups.e2e.ts` | US-025 |
| `08-settings.e2e.ts` | US-063 |
| `09-stats.e2e.ts` | US-049 |
| `10-audit.e2e.ts` | US-033 |
| `11-infra.e2e.ts` | US-042 |
| `12-status.e2e.ts` | US-060 |
| `13-labels.e2e.ts` | US-059 |
| `14-catalog.e2e.ts` | (future: Business catalog) |

| e2e Frontend Test | Stories Covered |
|-------------------|----------------|
| `01-login.spec.ts` | US-034 |
| `02-navigation.spec.ts` | US-035 |
| `03-dashboard.spec.ts` | US-036 |
| `04-sessions.spec.ts` | US-011, US-017, US-020, US-037 |
| `05-webhooks.spec.ts` | US-038 |
| `06-api-keys.spec.ts` | US-039 |
| `07-logs.spec.ts` | US-040 |
| `08-message-tester.spec.ts` | US-013, US-014, US-041 |
| `09-infrastructure.spec.ts` | US-042 |
| `10-plugins.spec.ts` | US-064 |
| `11-theme-responsive.spec.ts` | US-035, US-036 |
| `12-auth-persistence.spec.ts` | US-034 |

---

## Appendix B: Priority Matrix

| Priority | Stories | Sprint Target |
|:--------:|:-------:|:-------------:|
| **P0** | US-001–US-033, US-034–US-042 | Sprint 1–4 (MVP) |
| **P1** | US-043–US-056, US-057–US-062 | Sprint 5–8 (GA) |
| **P2** | US-055 (cart), US-060 (status), US-064 (plugins) | Post-GA |

---

## Appendix C: Story Count Summary

| Phase | Sprint | Stories | Total AC |
|:-----:|:------:|:-------:|:--------:|
| Foundation | 1 | US-001–US-006 | 28 |
| Engine | 2 | US-007–US-018 | 58 |
| Infrastructure | 3 | US-019–US-033 | 92 |
| Dashboard | 4 | US-034–US-042 | 53 |
| Desktop | 5 | US-043–US-046 | 20 |
| SaaS | 6 | US-047–US-050 | 26 |
| CRM & Mart | 7 | US-051–US-056 | 35 |
| Ops & Launch | 8 | US-057–US-064 | 37 |
| **TOTAL** | — | **64 stories** | **349 acceptance criteria** |
