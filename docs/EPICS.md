# OpenWA Serverless Rewrite — Epics

## Epic Overview

| Epic | Title | Phase | Priority | Estimated Duration |
|:----:|-------|:-----:|:--------:|:------------------:|
| E1 | Monorepo Foundation & Tooling | Phase 1 | P0 | 2 weeks |
| E2 | WhatsApp Engine (Baileys Fork) | Phase 2 | P0 | 3 weeks |
| E3 | Durable Object Session Host | Phase 3 | P0 | 1.5 weeks |
| E4 | REST API (Elysia) | Phase 3 | P0 | 1.5 weeks |
| E5 | Multi-Tenant Auth & Security | Phase 3 | P0 | 1 week |
| E6 | Webhook Delivery System | Phase 3 | P0 | 1 week |
| E7 | Dashboard (TanStack Start + React) | Phase 4 | P0 | 2.5 weeks |
| E8 | Shared UI Library | Phase 4 | P1 | 1 week |
| E9 | Electron Desktop App | Phase 5 | P1 | 2 weeks |
| E10 | Multi-Tenant SaaS & Billing | Phase 6 | P1 | 2 weeks |
| E11 | CRM Module | Phase 7 | P1 | 1.5 weeks |
| E12 | Mart E-Commerce Integration | Phase 7 | P1 | 1.5 weeks |
| E13 | Observability & Operations | Phase 8 | P1 | 1 week |
| E14 | Documentation & Launch | Phase 8 | P0 | 1 week |

---

## E1: Monorepo Foundation & Tooling

**Goal:** Establish the development infrastructure — monorepo scaffold, build system, CI/CD, shared packages foundation.

**Phase:** 1 (Week 1-2)
**Priority:** P0
**Dependencies:** None

### Stories

| ID | Story | Acceptance Criteria | Points |
|----|-------|-------------------|:------:|
| E1-S01 | Initialize Bun workspace monorepo | `bun install` resolves all workspaces; `turbo.json` configured with build/lint/test pipelines | 3 |
| E1-S02 | Configure Biome (lint + format) | `bun run lint` and `bun run format` pass on all packages; enforces no-default-exports, no-any rules | 2 |
| E1-S03 | Create `packages/shared` | Exports TypeScript types (session status, message types, events), error codes, and config types; builds without errors | 3 |
| E1-S04 | Create `packages/validators` | Valibot schemas for session, message, webhook, contact, tenant entities; unit tests pass | 3 |
| E1-S05 | Create `packages/db` (Drizzle + D1) | Schema tables defined using sqlite-core (sessions, messages, contacts, webhooks, labels, conversations, audit_log); control plane schema (tenants, api_keys); migrations generated; connects to D1 via binding | 5 |
| E1-S06 | Configure TypeScript project references | `bun run typecheck` validates all packages; composite project references resolve cross-package imports | 2 |
| E1-S07 | Set up CI pipeline | GitHub Actions: typecheck → lint → test on PR; build all packages on push to main | 3 |
| E1-S08 | Create `.dev.vars` template and environment setup | Document local development setup; wrangler dev works with local bindings | 2 |

**Total Points:** 23
**Exit Criteria:** All packages build, lint, and typecheck cleanly. Database migrations apply to D1 successfully (control plane + sample tenant DB). CI green on main.

---

## E2: WhatsApp Engine (Baileys Fork)

**Goal:** Fork Baileys and restructure into a platform-agnostic engine with dual adapters (Cloudflare DO + Node.js).

**Phase:** 2 (Week 3-5)
**Priority:** P0
**Dependencies:** E1 (shared types, validators)

### Stories

| ID | Story | Acceptance Criteria | Points |
|----|-------|-------------------|:------:|
| E2-S01 | Fork Baileys and create `packages/engine` structure | Source ported into engine package; compiles with TypeScript strict mode; existing Node-only code identified | 5 |
| E2-S02 | Define adapter interfaces (`ISessionStorage`, `ISocketProvider`) | Interfaces documented and exported; all platform-specific code flows through adapters | 3 |
| E2-S03 | Implement Node adapter (filesystem + ws) | Session credentials stored on filesystem; `ws` WebSocket connects to WA; all Baileys tests pass with Node adapter | 5 |
| E2-S04 | Implement Cloudflare adapter (DO storage + native WS) | Session credentials stored in DO state.storage; CF native WebSocket connects to WA; builds for Workers runtime | 8 |
| E2-S05 | Replace Node crypto with Web Crypto / @noble/curves | Curve25519, Ed25519 via @noble/curves; AES-GCM/CBC, HMAC, HKDF via Web Crypto API; all crypto tests pass on both platforms | 8 |
| E2-S06 | QR code authentication flow | Engine emits QR event with data string; QR rotates on timeout; successful scan transitions to AUTHENTICATED state | 5 |
| E2-S07 | Phone pairing code authentication flow | Given a phone number, engine generates and returns pairing code; device confirms; transitions to AUTHENTICATED | 5 |
| E2-S08 | Send/receive text messages (proof of concept) | Can send text to a JID and receive incoming text messages via event handler; messages E2E encrypted | 8 |
| E2-S09 | Media upload (encrypt + upload to WA CDN) | Images, videos, audio, documents upload correctly; media encrypted with random key; upload URL returned | 5 |
| E2-S10 | Media download (download + decrypt from WA CDN) | Incoming media messages: download from CDN URL, decrypt with provided keys, return Buffer/Uint8Array | 5 |
| E2-S11 | Session state machine (lifecycle management) | States: CREATED → CONNECTING → QR_READY → SCANNING → AUTHENTICATED → CONNECTED → DISCONNECTED; events emitted on transitions | 5 |
| E2-S12 | Automatic reconnection with exponential backoff | On disconnect, engine retries connection with backoff; auth state persisted survives reconnect; < 5s typical recovery | 5 |
| E2-S13 | Contact and group data retrieval | `getContacts()` returns contact list; `getGroups()` returns groups; `getGroupInfo()` returns metadata | 3 |
| E2-S14 | Message operations (reply, forward, react, delete) | All four operations work correctly via engine interface; receipts updated | 3 |

**Total Points:** 73
**Exit Criteria:** Engine connects to WhatsApp, sends/receives text and media messages on both Node.js and Cloudflare Workers (via miniflare for local testing). All cryptographic operations verified.

---

## E3: Durable Object Session Host

**Goal:** Create the Durable Object that hosts one WhatsApp engine instance per session, manages lifecycle, and relays events.

**Phase:** 3 (Week 5-6)
**Priority:** P0
**Dependencies:** E2 (engine with CF adapter)

### Stories

| ID | Story | Acceptance Criteria | Points |
|----|-------|-------------------|:------:|
| E3-S01 | Create `workers/wa-session` DO scaffold | DO class defined with `fetch()` and `alarm()` handlers; wrangler config with DO binding; deploys to CF | 3 |
| E3-S02 | Session lifecycle state machine in DO | DO receives RPC commands (start, stop, logout, destroy); manages engine lifecycle; persists state across hibernation | 8 |
| E3-S03 | Keep-alive via Alarm API | Alarm fires every 25s; sends ping to WhatsApp; resets alarm; logs missed pings | 3 |
| E3-S04 | Hibernation-aware reconnection | After DO eviction: alarm fires → restores auth from storage → reconnects engine → resumes operation in < 5s | 5 |
| E3-S05 | Inbound WebSocket support (dashboard clients) | DO accepts WebSocket upgrade; authenticates connection; broadcasts WA events to all connected clients | 5 |
| E3-S06 | Event routing to Cloudflare Queue | Incoming messages, acks, status changes enqueued for webhook delivery; events serialized as JSON with metadata | 3 |
| E3-S07 | RPC interface (Worker ↔ DO) | Type-safe RPC methods: sendMessage, getStatus, getQR, getContacts, getGroups; Worker calls DO via stub | 5 |
| E3-S08 | Memory management and lazy loading | Contacts/groups not cached in memory; loaded from DB on-demand; engine stays under 128MB | 3 |
| E3-S09 | Graceful shutdown on stop/logout | On stop: close WA WebSocket, notify connected dashboard clients, persist final state; on logout: clear all auth data | 3 |

**Total Points:** 38
**Exit Criteria:** DO hosts a WhatsApp session, survives hibernation, broadcasts events to connected WebSocket clients, and stays within 128MB memory.

---

## E4: REST API (Elysia)

**Goal:** Build the full REST API surface using Elysia on Cloudflare Workers with end-to-end type safety.

**Phase:** 3 (Week 6-7)
**Priority:** P0
**Dependencies:** E3 (DO RPC), E1 (db, validators)

### Stories

| ID | Story | Acceptance Criteria | Points |
|----|-------|-------------------|:------:|
| E4-S01 | Create `services/api` Elysia worker scaffold | Worker entry point; Elysia app with CORS, error handling; deploys to CF; health endpoint responds | 3 |
| E4-S02 | Session CRUD endpoints | GET/POST/DELETE `/sessions`; creates DB record + provisions DO; validates with Valibot | 5 |
| E4-S03 | Session lifecycle endpoints | POST `/sessions/:id/start|stop|logout`; GET `/sessions/:id/qr`; POST `/sessions/:id/pairing-code`; communicates with DO via RPC | 5 |
| E4-S04 | Message send endpoints (all types) | POST endpoints for text, image, video, audio, document, location, contact, sticker; validates payload; routes to DO; returns message result | 8 |
| E4-S05 | Message operations endpoints | POST reply, forward, reaction; DELETE message; validates existence; routes to DO | 3 |
| E4-S06 | Bulk message endpoint | POST `/sessions/:id/messages/bulk`; queues messages for sequential send with delays; returns job ID | 5 |
| E4-S07 | Contact endpoints | GET contacts list, GET by JID, POST check number, GET profile photo, POST block/unblock | 3 |
| E4-S08 | Group endpoints | Full CRUD: list, create, get info, update, leave; participant management (add, remove, promote, demote); invite links | 5 |
| E4-S09 | Webhook CRUD endpoints | GET/POST/PATCH/DELETE `/sessions/:id/webhooks`; validates URL reachability; stores secret | 3 |
| E4-S10 | Label endpoints | GET labels, POST/DELETE label-to-chat assignments | 2 |
| E4-S11 | Status/Stories endpoints | GET/POST/DELETE status; media upload for image/video status | 3 |
| E4-S12 | Channel endpoints | GET channels, POST subscribe/unsubscribe | 2 |
| E4-S13 | Message history endpoint | GET `/sessions/:id/messages?chatId=&limit=&before=`; paginated; returns from D1 tenant database | 3 |
| E4-S14 | Eden Treaty type export | Export Elysia app type for Eden Treaty client generation; verify client can call all endpoints type-safely | 3 |

**Total Points:** 53
**Exit Criteria:** All API endpoints functional, validated, returning proper error codes. Eden Treaty client generated. Swagger/OpenAPI docs auto-generated.

---

## E5: Multi-Tenant Auth & Security

**Goal:** Implement API key authentication, tenant resolution, rate limiting, and security middleware.

**Phase:** 3 (Week 6-7)
**Priority:** P0
**Dependencies:** E1 (db), E4 (API routes)

### Stories

| ID | Story | Acceptance Criteria | Points |
|----|-------|-------------------|:------:|
| E5-S01 | API key generation and hashing | Generate `openwa_sk_` prefixed keys; store SHA-256 hash + prefix in DB; return full key only once on creation | 3 |
| E5-S02 | API key auth middleware | Extract `X-API-Key` header; lookup prefix in KV → hash → verify; resolve tenant_id; reject invalid/expired keys | 5 |
| E5-S03 | KV-based API key cache | On first validation, cache tenant resolution in KV (5min TTL); invalidate on key revoke | 3 |
| E5-S04 | Tenant isolation middleware | Inject `tenantId` into request context; all DB queries automatically scoped; verify no cross-tenant data leaks | 5 |
| E5-S05 | Rate limiting (sliding window) | KV-based per-API-key sliding window; configurable limits per plan (10/50/200 req/s); return 429 with retry-after | 5 |
| E5-S06 | Plan limit enforcement | Check session count, message storage, media storage against plan limits; reject operations exceeding limits with clear error | 3 |
| E5-S07 | Webhook payload signing | Sign every webhook delivery with HMAC-SHA256 using per-webhook secret; include signature in `X-OpenWA-Signature` header | 3 |
| E5-S08 | Input validation on all routes | Valibot schemas applied to every request body, query param, and path param; reject malformed input with 422 | 3 |
| E5-S09 | Audit logging | Log all sensitive operations (session create/delete, key create/revoke, webhook changes) to audit_log table | 3 |
| E5-S10 | Media access control (presigned URLs) | R2 presigned URLs scoped to tenant path; time-limited (1 hour); reject cross-tenant media access | 3 |

**Total Points:** 36
**Exit Criteria:** No API endpoint accessible without valid API key. Tenant data strictly isolated. Rate limiting enforced. All inputs validated. Audit trail complete.

---

## E6: Webhook Delivery System

**Goal:** Reliable webhook delivery with retries via Cloudflare Queues, dead-letter queue for failures.

**Phase:** 3 (Week 6-7)
**Priority:** P0
**Dependencies:** E3 (event routing), E5 (signing)

### Stories

| ID | Story | Acceptance Criteria | Points |
|----|-------|-------------------|:------:|
| E6-S01 | Queue producer (DO → Queue) | DO publishes events to `WEBHOOK_QUEUE` with event type, session ID, tenant ID, payload | 3 |
| E6-S02 | Queue consumer worker | Consumer receives batched messages; for each event, lookup matching webhooks (by session + event type); fan out deliveries | 5 |
| E6-S03 | Webhook delivery with HMAC signing | POST to webhook URL; include `X-OpenWA-Signature` header; include `X-OpenWA-Event` header; set timeout (10s) | 3 |
| E6-S04 | Retry logic (3 attempts) | On 4xx/5xx/timeout: retry up to 3 times with exponential backoff; on final failure: send to DLQ | 3 |
| E6-S05 | Dead-letter queue and failure logging | Failed deliveries stored in DLQ; queryable via API; include original event, attempts, error details | 3 |
| E6-S06 | Event filtering by webhook config | Each webhook has `events[]` array; only matching events delivered; support wildcard `*` | 2 |
| E6-S07 | Webhook delivery status tracking | Track last delivery status per webhook (success/failure/timestamp); expose in API and dashboard | 2 |

**Total Points:** 21
**Exit Criteria:** Events from WhatsApp sessions reliably delivered to configured webhook URLs within 5s. Failed deliveries retried. DLQ captures permanent failures.

---

## E7: Dashboard (TanStack Start + React)

**Goal:** Build the web-based management dashboard using TanStack Start on Cloudflare Pages with server functions for direct D1/DO access.

**Phase:** 4 (Week 7-9)
**Priority:** P0
**Dependencies:** E4 (API), E5 (auth), E8 (UI library)

### Stories

| ID | Story | Acceptance Criteria | Points |
|----|-------|-------------------|:------:|
| E7-S01 | TanStack Start project setup with @cloudflare/vite-plugin | Project scaffolded; TanStack Router + Query configured; deploys to CF Pages via Workers; dev server runs locally with Vite | 3 |
| E7-S02 | Authentication pages (login, register, OAuth) | better-auth integration; email/password + GitHub/Google OAuth; session cookie; redirect to dashboard on success | 5 |
| E7-S03 | Dashboard layout (sidebar, header, routing) | Responsive layout with navigation; sidebar shows sessions list; header shows user menu; dark/light toggle | 3 |
| E7-S04 | Session management page | List sessions with status indicator via server functions + TanStack Query; create new session form; delete confirmation; real-time status updates | 5 |
| E7-S05 | QR code scanning flow | Full-screen QR display on session start; auto-refreshes on expiry; transitions to connected state on success; fallback to pairing code | 5 |
| E7-S06 | Conversation list view | List all chats for a session; show last message, timestamp, unread count; search/filter; real-time new message indicators | 5 |
| E7-S07 | Chat view (send/receive messages) | Open chat: display message history; send text via server function → DO; show delivery status; receive messages in real-time via WebSocket; media display | 8 |
| E7-S08 | WebSocket integration (real-time events) | Connect to WS_RELAY DO via native WebSocket; receive message, ack, status events; update UI reactively via TanStack Query invalidation; reconnect on disconnect | 5 |
| E7-S09 | Webhook management page | List webhooks; create/edit form (URL, events, secret); test delivery button; show last delivery status | 3 |
| E7-S10 | API key management page | List keys (show prefix, created date, last used); create new key (show full key once); revoke with confirmation | 3 |
| E7-S11 | Tenant settings page | View/edit tenant name; view current plan and usage metrics; upgrade plan link | 3 |
| E7-S12 | Contact list with CRM tagging | List contacts; search by name/phone; add/remove tags; view contact metadata; link to conversation | 3 |

**Total Points:** 51
**Exit Criteria:** Dashboard fully functional for managing sessions, viewing conversations, sending messages, and configuring webhooks/API keys. Real-time updates working.

---

## E8: Shared UI Library

**Goal:** Create the shared React component library used by both dashboard and desktop app.

**Phase:** 4 (Week 7-8)
**Priority:** P1
**Dependencies:** E1 (monorepo)

### Stories

| ID | Story | Acceptance Criteria | Points |
|----|-------|-------------------|:------:|
| E8-S01 | Initialize `packages/ui` with shadcn/ui base | Package configured; Tailwind CSS theme; base components (Button, Input, Card, Dialog, etc.) available | 3 |
| E8-S02 | Chat components (MessageBubble, ChatList, ChatInput) | Reusable chat UI components; support text, media, system messages; timestamp display; delivery status icons | 5 |
| E8-S03 | Session components (SessionCard, QRDisplay, StatusBadge) | Session management UI atoms; QR code renderer; status color badges; connection indicator | 3 |
| E8-S04 | Form components (WebhookForm, APIKeyDisplay, SettingsForm) | Pre-built form components for common CRUD operations; validation integration | 3 |
| E8-S05 | Layout components (Sidebar, Header, PageContainer) | Responsive layout primitives; collapsible sidebar; breadcrumbs; mobile-friendly | 3 |
| E8-S06 | Shared hooks (useWebSocket, useSession, useAuth) | React hooks for WebSocket connection, session state management, auth context | 5 |

**Total Points:** 22
**Exit Criteria:** UI library provides all components needed by dashboard and desktop app. Components are themeable and responsive.

---

## E9: Electron Desktop App

**Goal:** Build cross-platform desktop application that runs the WhatsApp engine locally with the same UI as the web dashboard.

**Phase:** 5 (Week 9-11)
**Priority:** P1
**Dependencies:** E2 (engine Node adapter), E8 (UI library)

### Stories

| ID | Story | Acceptance Criteria | Points |
|----|-------|-------------------|:------:|
| E9-S01 | Electron project scaffold | Main + renderer process; React renderer using @openwa/ui; electron-builder config for Mac/Win/Linux | 3 |
| E9-S02 | Engine manager (local session lifecycle) | Main process manages Baileys sessions via Node adapter; start/stop/restart; multi-session support | 5 |
| E9-S03 | IPC bridge (renderer ↔ main) | ipcMain handlers for all engine operations; renderer can call engine via preload script; type-safe channel definitions | 5 |
| E9-S04 | System tray integration | App minimizes to system tray; tray menu (show/quit); continues running when window closed; tray icon shows connection status | 3 |
| E9-S05 | Native OS notifications | Incoming messages trigger native notification; click notification opens chat; notification preferences configurable | 3 |
| E9-S06 | Local SQLite message cache | Messages stored locally for offline history; searchable; syncs on reconnect | 5 |
| E9-S07 | Auto-updater (GitHub Releases) | Check for updates on startup and periodically; download + install update; show changelog; user can defer | 3 |
| E9-S08 | Auto-start on boot (optional) | Configurable in settings; uses platform-appropriate mechanism (login items / registry / autostart) | 2 |
| E9-S09 | Cross-platform build pipeline | GitHub Actions: build for macOS (dmg), Windows (nsis), Linux (AppImage, deb); code sign macOS/Windows | 5 |
| E9-S10 | Optional cloud sync | Settings toggle to sync contacts/messages to cloud D1 via Elysia API; uses same API (acts as a tenant); conflict resolution | 5 |
| E9-S11 | Drag-and-drop media sending | Drop files onto chat view to send as media; preview before send; support image/video/audio/document | 2 |

**Total Points:** 41
**Exit Criteria:** Desktop app installs and runs on all three platforms. Engine connects to WhatsApp locally. Full chat functionality. Auto-updates working.

---

## E10: Multi-Tenant SaaS & Billing

**Goal:** Implement tenant onboarding, plan management, usage metering, and billing integration.

**Phase:** 6 (Week 11-13)
**Priority:** P1
**Dependencies:** E5 (tenancy), E7 (dashboard)

### Stories

| ID | Story | Acceptance Criteria | Points |
|----|-------|-------------------|:------:|
| E10-S01 | Tenant registration flow | Sign up → create tenant → generate first API key → redirect to dashboard; email verification | 5 |
| E10-S02 | Plan definition and limits | Three plans (Free/Pro/Business) with configurable limits; stored in tenant record; enforced globally | 3 |
| E10-S03 | Usage metering | Track: active sessions, messages sent/stored, media storage used, API calls; per-tenant counters in KV | 5 |
| E10-S04 | Usage dashboard | Visual display of current usage vs. plan limits; usage history graphs; alerts when approaching limits | 3 |
| E10-S05 | Billing integration (Stripe/LemonSqueezy) | Plan selection → checkout → subscription active; webhook from provider updates tenant plan; cancellation flow | 8 |
| E10-S06 | Plan upgrade/downgrade | Self-serve plan change; immediate effect (upgrade) or end-of-period (downgrade); prorated billing | 3 |
| E10-S07 | Super-admin panel | List all tenants; view usage; force plan change; disable tenant; view audit logs; impersonate | 5 |
| E10-S08 | Tenant-scoped resource cleanup | On tenant deletion: cascade delete sessions, messages, contacts, media (R2); GDPR data export | 3 |

**Total Points:** 35
**Exit Criteria:** New users can self-register, select a plan, pay, and start using the platform. Usage tracked and limits enforced. Admin can manage all tenants.

---

## E11: CRM Module

**Goal:** Add CRM capabilities — enriched contacts, conversation management, tagging, and agent assignment.

**Phase:** 7 (Week 13-14)
**Priority:** P1
**Dependencies:** E4 (API), E7 (dashboard)

### Stories

| ID | Story | Acceptance Criteria | Points |
|----|-------|-------------------|:------:|
| E11-S01 | CRM contacts API | GET/POST/PATCH `/crm/contacts`; enriched with tags, custom metadata fields, link to WA JID | 3 |
| E11-S02 | Contact tagging system | Create/list tags per tenant; assign multiple tags to contacts; filter contacts by tags | 3 |
| E11-S03 | Conversation aggregation | Auto-create conversation record on first message; track unread count, last message time, status | 3 |
| E11-S04 | Conversation management API | GET/PATCH `/crm/conversations`; set status (open/closed/archived); assign to agent; filter by status | 3 |
| E11-S05 | CRM dashboard views | Contact list with tag filters; conversation inbox with assignment; quick actions (close, archive, tag) | 5 |
| E11-S06 | Contact import/export | Bulk import contacts from CSV; export contacts to CSV; map columns to fields | 3 |
| E11-S07 | Contact merge/dedup | Detect duplicate contacts (by phone); merge interface; preserve tags and metadata from both | 3 |

**Total Points:** 23
**Exit Criteria:** Users can manage contacts with tags and metadata, view conversations with assignment/status, and import/export contact lists.

---

## E12: Mart E-Commerce Integration

**Goal:** Bridge OpenWA with the Mart e-commerce platform for automated notifications and CRM sync.

**Phase:** 7 (Week 14-15)
**Priority:** P1
**Dependencies:** E4 (API), E11 (CRM), E6 (webhooks)

### Stories

| ID | Story | Acceptance Criteria | Points |
|----|-------|-------------------|:------:|
| E12-S01 | Shared tenant linking (Mart org → OpenWA tenant) | API endpoint to link Mart organization with OpenWA tenant via shared secret; verify ownership | 3 |
| E12-S02 | Order notification webhook handler | Receive order.placed event from Mart; format message with order details; send via OpenWA session | 5 |
| E12-S03 | Shipping update notifications | Receive shipping.updated event; send tracking info to customer WhatsApp | 3 |
| E12-S04 | Cart abandonment recovery | Receive cart.abandoned event; send recovery message after configurable delay; track recovery rate | 5 |
| E12-S05 | Incoming message → Mart ticket bridge | On customer WA reply: forward to Mart ticket system via webhook; include conversation context | 3 |
| E12-S06 | Contact sync (bidirectional) | New Mart customer → create OpenWA CRM contact; OpenWA contact update → push to Mart CRM | 5 |
| E12-S07 | Template messages with variables | Define message templates with `{{order_id}}`, `{{total}}`, `{{tracking_url}}`; substitute on send | 3 |
| E12-S08 | Eden Treaty type-safe client package | Publish `@openwa/client` package with Eden Treaty types; Mart uses for type-safe API calls | 3 |
| E12-S09 | Integration dashboard page | View linked Mart store; message stats (sent/delivered/read); template management; test send | 3 |

**Total Points:** 33
**Exit Criteria:** Mart stores can link to OpenWA, automatically send order/shipping notifications, receive customer replies, and sync contacts bidirectionally.

---

## E13: Observability & Operations

**Goal:** Add error tracking, logging, monitoring, and operational tooling for production readiness.

**Phase:** 8 (Week 15)
**Priority:** P1
**Dependencies:** All previous epics

### Stories

| ID | Story | Acceptance Criteria | Points |
|----|-------|-------------------|:------:|
| E13-S01 | Structured logging | All workers emit structured JSON logs; include request ID, tenant ID, session ID; queryable in CF dashboard | 3 |
| E13-S02 | Error tracking (Sentry or CF Logpush) | Unhandled exceptions captured with context; alert on error rate spike; stack traces in production | 3 |
| E13-S03 | Health and readiness endpoints | `/health` returns 200 + version; `/health/ready` checks DB connectivity + DO availability | 2 |
| E13-S04 | Session health monitoring | Periodic check of all active sessions; detect stale connections; auto-restart unhealthy sessions | 3 |
| E13-S05 | Rate limit dashboard | Admin view of rate limit metrics; top consumers; blocked requests count | 2 |
| E13-S06 | Webhook delivery monitoring | Dashboard showing delivery success rate, avg latency, failures per webhook; DLQ viewer | 3 |
| E13-S07 | Status page | Public status page showing API, engine, dashboard health; incident history; subscribe to updates | 3 |

**Total Points:** 19
**Exit Criteria:** Production issues are detectable, diagnosable, and alertable. Operational health visible to both team and users.

---

## E14: Documentation & Launch

**Goal:** Create comprehensive documentation, landing page, and prepare for public beta launch.

**Phase:** 8 (Week 15-16)
**Priority:** P0
**Dependencies:** E4 (API finalized), E7 (dashboard complete)

### Stories

| ID | Story | Acceptance Criteria | Points |
|----|-------|-------------------|:------:|
| E14-S01 | API reference documentation | Auto-generated from Elysia types; all endpoints documented with request/response examples; interactive playground | 5 |
| E14-S02 | Quickstart guide | Step-by-step: register → create session → scan QR → send first message; under 5 minutes | 3 |
| E14-S03 | Integration guides | Guides for: Node.js, Python, PHP; webhook setup; Mart integration; desktop app setup | 5 |
| E14-S04 | SDK packages (`@openwa/sdk-js`, `@openwa/sdk-python`) | Type-safe JavaScript SDK (Eden Treaty wrapper); Python SDK with async support; published to npm/PyPI | 5 |
| E14-S05 | Landing page | Product overview; feature highlights; pricing table; quickstart CTA; deployed to root domain | 3 |
| E14-S06 | Security audit | Review all auth flows, tenant isolation, input validation, crypto; fix any findings; document security model | 5 |
| E14-S07 | Load testing | Simulate 100+ concurrent sessions; 1000+ req/s API load; identify and fix bottlenecks; document limits | 3 |
| E14-S08 | Beta launch checklist | DNS configured; secrets rotated; monitoring active; backup verified; changelog published; announce to community | 2 |

**Total Points:** 31
**Exit Criteria:** Users can self-serve from documentation. API reference complete. SDKs published. Load tested. Security audited. Ready for public beta.

---

## Epic Dependency Graph

```
E1 (Foundation)
├── E2 (Engine)
│   ├── E3 (Durable Objects)
│   │   ├── E4 (REST API)
│   │   │   ├── E5 (Auth & Security)
│   │   │   │   ├── E6 (Webhooks)
│   │   │   │   ├── E7 (Dashboard)
│   │   │   │   │   ├── E10 (SaaS & Billing)
│   │   │   │   │   ├── E11 (CRM)
│   │   │   │   │   │   └── E12 (Mart Integration)
│   │   │   │   │   └── E13 (Observability)
│   │   │   │   └── E14 (Docs & Launch)
│   │   │   └── E8 (UI Library)
│   │   │       └── E7 (Dashboard)
│   │   │       └── E9 (Desktop)
│   └── E9 (Desktop App)
```

---

## Velocity & Timeline Summary

| Phase | Epics | Total Points | Duration |
|:-----:|-------|:------------:|:--------:|
| 1 | E1 | 23 | Week 1-2 |
| 2 | E2 | 73 | Week 3-5 |
| 3 | E3, E4, E5, E6 | 148 | Week 5-7 |
| 4 | E7, E8 | 73 | Week 7-9 |
| 5 | E9 | 41 | Week 9-11 |
| 6 | E10 | 35 | Week 11-13 |
| 7 | E11, E12 | 56 | Week 13-15 |
| 8 | E13, E14 | 50 | Week 15-16 |
| **Total** | **14 Epics** | **499 points** | **16 weeks** |

---

## Risk Register (Epic-Level)

| Risk | Affected Epics | Likelihood | Impact | Mitigation |
|------|:---:|:---:|:---:|-----------|
| Baileys fork crypto fails on CF Workers | E2, E3 | Medium | Critical | Spike @noble/curves on Workers early (Week 1); fallback: SubtleCrypto polyfill |
| DO 128MB not enough for large groups | E3 | Low | High | Lazy-load group members; paginate contacts; monitor memory in production |
| WhatsApp protocol change breaks engine | E2 | Medium | Critical | Pin Baileys version; maintain active monitoring; community patch tracking |
| Elysia performance on Workers | E4 | Low | Medium | Benchmark early; fallback to Hono if needed (similar API surface) |
| NeonDB free tier insufficient | E1, E5 | Low | Low | Upgrade to paid ($19/mo); budget already accounts for this |
| Electron code signing costs | E9 | Low | Low | Use GitHub Actions + free Apple Developer account for open-source |
| Stripe/billing complexity delays SaaS | E10 | Medium | Medium | Ship without billing initially (free tier only); add billing async |

---

## Definition of Done (Global)

Every story is considered done when:

1. Code implements the acceptance criteria
2. TypeScript compiles without errors (`bun run typecheck`)
3. Biome lint passes (`bun run lint`)
4. Unit tests written and passing (Vitest)
5. Integration test (if applicable) passing
6. No security vulnerabilities (OWASP Top 10 checked)
7. Code reviewed by at least one team member
8. Deployed to staging environment (wrangler dev or preview)
9. Feature works end-to-end in staging
