# Technical Discovery Report — OpenWA Serverless Migration

**Date:** 2026-05-28
**Team:** Technical Discovery & Architecture
**Status:** Complete

---

## Team Composition

| Role | Responsibility | Key Findings |
|------|---------------|--------------|
| **Current Architecture Analyst** | Audit existing NestJS codebase | 19 modules, clean interface abstractions, plugin system reusable |
| **WhatsApp Protocol Engineer** | Baileys fork feasibility, crypto on Workers | CONDITIONAL GO — proxy infra required |
| **Cloudflare Platform Specialist** | DO/KV/R2/Queue limits and patterns | $5/mo achievable with hibernation; DO duration is critical cost |
| **Database & API Architect** | TypeORM→Drizzle, NestJS→Elysia migration paths | Clean mapping exists; tenant scoping via Drizzle helper class |
| **Frontend & Desktop Architect** | Dashboard→TanStack Start, shared UI, Electron patterns | Full React SPA with server functions; unified DX |

---

## 1. Executive Summary

### Verdict: **CONDITIONAL GO** ⚠️

The serverless migration is technically feasible. Two critical items require validation before full commitment:

1. **WhatsApp Connection Through Proxy** (MUST VALIDATE): Cloudflare datacenter IPs are likely blocked by WhatsApp. Must validate stable WebSocket connection through residential/mobile proxy from DO. Without proxy, the entire architecture fails.

2. **Signal Protocol Pure-JS Replacement** (5-6 week critical path): Baileys v7 uses native Rust bindings for libsignal. Must be replaced with pure-JS implementation using @noble/curves + Web Crypto API.

### If Both Validate → Full GREEN

The rest of the stack (Drizzle, Elysia, TanStack Start, DOs, Queues, KV, R2, D1) is proven technology with well-documented patterns.

---

## 2. Current Architecture Analysis

### What Exists Today

```
┌─────────────────────────────────────────────┐
│ NestJS 11 Monolith                          │
│                                             │
│  19 Feature Modules (controllers/services)  │
│  TypeORM (SQLite + Postgres dual-DB)        │
│  whatsapp-web.js (Puppeteer/Chromium)       │
│  BullMQ + Redis (webhook delivery)          │
│  Socket.IO (real-time WebSocket)            │
│  Plugin System (engine + hooks)             │
│  Docker + docker-compose orchestration      │
│                                             │
│  RAM: ~512MB+ per session (Chromium)        │
│  Deploy: Docker container + orchestration   │
└─────────────────────────────────────────────┘
```

### What Can Be Reused (Pattern-Level)

| Component | Reuse Level | Notes |
|-----------|:-----------:|-------|
| `IWhatsAppEngine` interface | **Direct** | 40+ method contract, engine-agnostic |
| Hook system (13 events) | **Direct** | Priority chains, early-exit, context injection |
| Plugin architecture | **Pattern** | Manifest + context pattern translates cleanly |
| Entity schemas | **Concepts** | Drizzle rewrite needed but same data model |
| Auth (API key hash) | **Direct** | SHA-256 prefix-indexed pattern reusable |
| Rate limiting (3-tier) | **Pattern** | Same tiers, different backing store (KV/DO) |
| WebSocket gateway | **Pattern** | Room-based → DO-based topic routing |
| Configuration | **Pattern** | env-var loading, same hierarchy |
| Module boundaries | **Pattern** | Each module maps to an Elysia route plugin |
| Audit logging | **Direct** | Same schema, different ORM |

### What Must Be Rewritten

| Component | Reason | Effort |
|-----------|--------|--------|
| WhatsApp engine | Puppeteer → Baileys fork | 5-6 weeks |
| Database layer | TypeORM → Drizzle | 1-2 weeks |
| API framework | NestJS → Elysia on Workers | 2-3 weeks |
| Queue system | BullMQ/Redis → CF Queues | 1 week |
| Real-time | Socket.IO → DO WebSocket | 1 week |
| Storage | Local/S3 → R2 | 0.5 weeks |
| Auth middleware | NestJS guards → Elysia derive() | 0.5 weeks |
| Dashboard | React SPA → TanStack Start (server functions) | 2 weeks |

---

## 3. WhatsApp Engine — Technical Feasibility

### 3.1 Baileys v7 Native Dependencies (BLOCKERS)

| Dependency | Type | Replacement Strategy |
|-----------|------|---------------------|
| `libsignal` v6 | Native (Rust/NAPI) | Pure-JS Signal Protocol via @noble/curves + Web Crypto |
| `whatsapp-rust-bridge` | Native (Rust) | Revert to pure-JS binary node codec from Baileys v5 |
| `ws` | Node WebSocket | Abstract via `ISocketProvider` (native WS in CF, `ws` in Node) |
| `pino` | Node streams | Console/structured logging adapter |

### 3.2 Cryptographic Stack on CF Workers

All WhatsApp crypto requirements are satisfiable:

| Algorithm | Implementation | CF Workers |
|-----------|---------------|:----------:|
| Curve25519 (ECDH) | @noble/curves | ✅ Pure JS, ~1ms |
| Ed25519 (signing) | @noble/curves | ✅ Pure JS |
| AES-256-GCM | crypto.subtle | ✅ Native |
| AES-256-CBC | crypto.subtle | ✅ Native |
| HMAC-SHA256 | crypto.subtle | ✅ Native |
| HKDF-SHA256 | crypto.subtle | ✅ Native |
| SHA-256/512 | crypto.subtle | ✅ Native |

**Critical Note:** Web Crypto is async-only. Baileys' sync crypto paths must be refactored to async/await throughout the engine.

### 3.3 Memory Analysis (DO 128MB Limit)

| Account Size | Estimated RAM | Verdict |
|:------------:|:------------:|:-------:|
| Personal (50 contacts) | ~25 MB | ✅ Safe |
| Small Business (200 contacts) | ~40 MB | ✅ Safe |
| Large Business (500 contacts) | ~65 MB | ⚠️ Tight |
| Enterprise (1000+ contacts) | ~100+ MB | ❌ Risk |

**Mitigations:**
- Lazy-load Signal sessions from DO storage (not all in RAM)
- Disable in-memory message cache (use D1 per-tenant DB)
- Protobuf: static codegen, lazy-load type definitions
- LRU eviction for sender keys

### 3.4 Proxy Requirement (CRITICAL RISK)

**Problem:** WhatsApp blocks datacenter IP ranges. Cloudflare Workers run on datacenter IPs.

**Solution Options:**

| Option | Feasibility | Cost |
|--------|:-----------:|:----:|
| CF `connect()` → SOCKS5 residential proxy | ✅ Best | $10-50/mo per IP |
| Per-session proxy config (user provides) | ✅ Already designed | $0 (user pays) |
| Cloudflare WARP tunnel (residential-like) | ⚠️ Unverified | $0 |
| DO → external proxy server → WA | ✅ Works | $5-20/mo |

**Recommendation:** Design with per-session proxy config from day 1. Offer managed proxy pool as premium feature. The current codebase already has `proxyUrl` and `proxyType` fields on the Session entity.

### 3.5 Signal Protocol Replacement Strategy

**Option A: Port from Baileys v4/v5 (RECOMMENDED)**
- Baileys v4-v5 had a bundled pure-JS Signal Protocol implementation
- Reference code exists in git history
- Already proven to work with WhatsApp
- Effort: 3-4 weeks (port + convert to async + test)

**Option B: @nicktrav/libsignal-protocol-typescript**
- Existing pure-TS implementation
- May need updates for WA-specific extensions
- Effort: 2-3 weeks (integrate + adapt + test)

**Option C: Write from specification**
- Signal Protocol is well-documented
- Most control, most effort
- Effort: 5-6 weeks

**Recommendation:** Option A — port Baileys v4's signal implementation, modernize with @noble/curves and Web Crypto API.

---

## 4. Cloudflare Platform Architecture

### 4.1 Durable Object Design

```
┌─────────────────────────────────────────────────────┐
│ WhatsAppSessionDO (one per WA session)              │
│                                                     │
│  State:                                             │
│  ├── Baileys engine instance (in-memory)            │
│  ├── Outbound WS to wss://web.whatsapp.net         │
│  ├── Inbound WS connections (dashboard clients)     │
│  └── Alarm (25s keep-alive cycle)                   │
│                                                     │
│  Storage (persistent KV):                           │
│  ├── Auth credentials (Noise + Signal keys)         │
│  ├── Signal sessions (per-contact ratchet state)    │
│  ├── Sender keys (per-group)                        │
│  └── Session metadata (phone, pushName, etc.)       │
│                                                     │
│  Event Routing:                                     │
│  ├── → Queue (webhook delivery)                     │
│  ├── → WS broadcast (connected dashboard clients)   │
│  └── → D1 (message persistence, per-tenant DB)     │
└─────────────────────────────────────────────────────┘
```

### 4.2 DO Lifecycle & Hibernation Strategy

```
Session Start:
  1. Worker receives /sessions/:id/start
  2. Worker gets DO stub by session ID
  3. DO.fetch() → initializes engine → connects to WA
  4. Sets first Alarm (25s)
  5. Returns QR/status

Keep-Alive Loop:
  alarm() fires every 25s → sends WA ping → resets alarm
  This prevents hibernation AND satisfies WA keep-alive

Session Disconnect:
  1. WA closes WebSocket OR user calls /stop
  2. DO persists all state to storage
  3. Cancels alarm → DO eligible for hibernation
  4. RAM freed

Session Reconnect (after hibernation):
  1. Any request to DO → wakes it
  2. Reads auth state from storage
  3. Re-initializes engine → reconnects to WA
  4. Resumes alarm loop
```

### 4.3 Cost Model ($5/month Validation)

| Resource | Included (Paid Plan) | Usage (3 sessions) | Cost |
|----------|:---:|:---:|:---:|
| Worker requests | 10M/mo | ~500K/mo | $0 |
| DO requests | 1M/mo | ~300K/mo | $0 |
| DO duration | 400K GB-s/mo | ~240K GB-s (3×30MB×24h×30d) | $0 |
| DO storage | 1GB | ~600KB (3 sessions) | $0 |
| KV reads | 10M/mo | ~200K/mo | $0 |
| KV writes | 1M/mo | ~50K/mo | $0 |
| R2 storage | 10GB | ~1-5GB | $0 |
| R2 operations | 1M Class A, 10M Class B | ~100K/mo | $0 |
| Queues | 1M messages | ~100K/mo | $0 |
| **Total** | | | **$5/mo flat** |

**Breakpoint:** At ~10 active sessions or >1M API requests/month, costs begin exceeding $5/mo. Scale to $10-15/mo for 10 sessions.

### 4.4 KV vs DO for Rate Limiting

**KV: NOT recommended for strict rate limiting**
- Eventually consistent (up to 60s propagation)
- Fine for auth cache (reads heavily, tolerance for staleness)

**DO: RECOMMENDED for rate limiting**
- Strongly consistent within same DO
- Pattern: One rate-limit DO per API key (or shared DO with key-based routing)
- Alternatively: Use `cf` request properties + Workers AI rules

**Hybrid approach:**
```
Request → KV (is key valid?) → Rate Limit DO (within budget?) → Handler
```

---

## 5. Database Migration Strategy

### 5.1 TypeORM → Drizzle Schema Mapping

Current dual-DB architecture (SQLite for boot-critical, Postgres for data) consolidates into Cloudflare D1 with a **database-per-tenant** model:

```typescript
// packages/db/src/control-plane/tenants.ts (Control Plane D1)
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  plan: text('plan').notNull().default('free'),
  maxSessions: integer('max_sessions').notNull().default(1),
  d1DatabaseId: text('d1_database_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
```

### 5.2 Tenant Isolation Pattern

```typescript
// packages/db/src/client.ts — DB-per-tenant (no tenant_id filtering needed!)
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

// Each tenant has their own isolated D1 database
export function createTenantDb(d1Binding: D1Database) {
  return drizzle(d1Binding, { schema });
}

// Control plane DB for auth/tenant resolution
export function createControlDb(d1Binding: D1Database) {
  return drizzle(d1Binding, { schema: controlPlaneSchema });
}

// Queries are simple — no tenant_id scoping needed!
// Example: list sessions for a tenant
async function listSessions(tenantDb: ReturnType<typeof createTenantDb>) {
  return tenantDb.select().from(schema.sessions);
}
```

### 5.3 D1 Binding Integration

```typescript
// packages/db/src/client.ts
import { drizzle } from 'drizzle-orm/d1';

export function createDB(env: { CONTROL_DB: D1Database; TENANT_DB: D1Database }) {
  return {
    control: drizzle(env.CONTROL_DB),
    tenant: drizzle(env.TENANT_DB),
  };
}
```

D1 advantages over Hyperdrive + NeonDB:
- Zero-config binding (no connection strings)
- Sub-millisecond latency (same network)
- No cold start (always warm)
- Physical tenant isolation (separate databases)
- Included in $5/mo Workers Paid plan ($0 extra)

---

## 6. API Migration Strategy

### 6.1 NestJS → Elysia Pattern Mapping

| NestJS Concept | Elysia Equivalent |
|---------------|-------------------|
| `@Controller()` | Route plugin (`app.group('/path', ...)`) |
| `@Injectable()` Service | Plain class or `derive()` context |
| `@UseGuards()` | `derive()` + `beforeHandle` |
| `@UsePipes()` | `t.Object()` body/query/params validation |
| `ValidationPipe` | Elysia type system (auto from schema) |
| `@UseInterceptors()` | `afterHandle` |
| `class-validator` DTOs | Valibot schemas |
| `ConfigService` | `env` bindings (Cloudflare) |
| Module system | Plugin composition |

### 6.2 Elysia Route Structure

```typescript
// services/api/src/routes/sessions.ts
import { Elysia, t } from 'elysia';
import { authPlugin } from '../middleware/auth';
import { tenantPlugin } from '../middleware/tenant';

export const sessionsRoutes = new Elysia({ prefix: '/sessions' })
  .use(authPlugin)
  .use(tenantPlugin)
  .get('/', async ({ tenant, db }) => {
    return db.select().from(sessions).where(eq(sessions.tenantId, tenant.id));
  })
  .post('/', async ({ tenant, body, db, env }) => {
    // Create session record + provision DO
    const session = await db.insert(sessions).values({
      tenantId: tenant.id,
      name: body.name,
    }).returning();
    return session;
  }, {
    body: t.Object({ name: t.String({ minLength: 1, maxLength: 50 }) })
  })
  .post('/:id/start', async ({ params, tenant, env }) => {
    const doId = env.WA_SESSION.idFromName(`${tenant.id}:${params.id}`);
    const stub = env.WA_SESSION.get(doId);
    return stub.fetch('/start', { method: 'POST' });
  });
```

### 6.3 Eden Treaty Client Generation

```typescript
// services/api/src/index.ts
import { Elysia } from 'elysia';
import { sessionsRoutes } from './routes/sessions';
import { messagesRoutes } from './routes/messages';
// ... all routes

const app = new Elysia()
  .use(sessionsRoutes)
  .use(messagesRoutes)
  // ...

export type App = typeof app; // This is the Eden Treaty type

// Client usage (in Mart or any consumer):
// import { treaty } from '@elysiajs/eden';
// import type { App } from '@openwa/api';
// const client = treaty<App>('https://api.openwa.dev');
// const { data } = await client.sessions.index.get(); // fully typed
```

---

## 7. Frontend Migration Strategy

### 7.1 Current Dashboard State

- React 19 SPA (Vite + React Router v7)
- 8 pages: Login, Dashboard, Sessions, Messages, Webhooks, Contacts, Settings, API Keys
- TanStack Query for server state
- Socket.IO for real-time
- Plain CSS per-component
- API key auth stored in sessionStorage

### 7.2 Migration to TanStack Start

```
Current (SPA):
  index.html → App.tsx → Router → Page Component → API fetch

Target (TanStack Start):
  TanStack Router → Route Component → Server Function → D1/DO direct
  (SSR + full hydration, unified React)
```

**What changes:**
- Routing: React Router → TanStack Router (file-based, type-safe)
- Auth: sessionStorage → httpOnly cookie (session-based via better-auth)
- Data fetching: Manual fetch → Server Functions + TanStack Query (built-in)
- API client: For dashboard → server functions (direct D1/DO binding access)
- Real-time: Socket.IO → native WebSocket to DO
- Styling: CSS files → Tailwind (shared with @openwa/ui)

**What stays:**
- React components (direct use, no islands wrapping needed)
- TanStack Query (deeply integrated in TanStack Start)
- Component logic and state management
- UI patterns and layouts

### 7.3 Shared UI Library (`@openwa/ui`)

Extract from current dashboard + add shadcn/ui primitives:

| Layer | Components |
|-------|-----------|
| **Primitives** | Button, Input, Select, Dialog, Dropdown, Card, Badge, Toast, Skeleton |
| **Chat** | MessageBubble, ChatList, ChatInput, MediaPreview, DeliveryStatus |
| **Session** | SessionCard, QRDisplay, StatusBadge, ConnectionIndicator |
| **Layout** | Sidebar, Header, PageContainer, Breadcrumbs |
| **Hooks** | useWebSocket, useSession, useAuth, useRealtime |

Consumed by both TanStack Start dashboard and Electron (direct import in renderer).

---

## 8. Real-Time Architecture

### 8.1 Socket.IO → DO WebSocket Migration

```
Current:
  Browser → Socket.IO → NestJS Gateway → Redis pub/sub → Broadcast

Target:
  Browser → WebSocket → CF Worker → DO (WebSocketRelayDO) → Session events
```

### 8.2 DO WebSocket Protocol

```typescript
// Client → Server
interface ClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'send-message' | 'request-qr';
  sessionId?: string;
  payload?: unknown;
}

// Server → Client
interface ServerMessage {
  type: 'qr' | 'status' | 'message' | 'ack' | 'error' | 'connected';
  sessionId: string;
  data: unknown;
  timestamp: number;
}
```

### 8.3 Reconnection Strategy

The DO WebSocket relay uses the Hibernation API for **inbound** client connections:
- Client disconnects → DO hibernates (saves RAM)
- Client reconnects → DO wakes, resubscribes to session events
- Missed events during disconnection → client requests catch-up from DB

---

## 9. Migration Execution Strategy

### 9.1 Recommended Approach: Parallel Build (Not In-Place Migration)

**Why parallel, not incremental migration:**
- NestJS → Elysia is a full framework change (not compatible)
- TypeORM → Drizzle requires schema rewrite
- Docker → CF Workers is entirely different deployment model
- The existing codebase runs in production; don't destabilize it

**Build the new system alongside, then cut over.**

### 9.2 Validation Sprint (Week 0 — Before Full Build)

**Purpose:** De-risk the two critical unknowns before committing 16 weeks of effort.

| Test | Duration | Success Criteria |
|------|:--------:|-----------------|
| DO → Proxy → WhatsApp WebSocket | 3 days | Stable connection for 24h without ban |
| Noise_XX handshake via @noble/curves in DO | 2 days | Successful handshake + auth frame exchange |
| Signal Protocol (X3DH) in pure JS | 3 days | Key exchange succeeds with WA server |
| Send one text message from DO | 2 days | Message delivered and received |

**If validation sprint succeeds → proceed with full build.**
**If it fails → re-evaluate (consider hybrid: Node.js engine + CF for API/dashboard only).**

### 9.3 Fallback Architecture (If DO Engine Fails)

```
┌─────────────────────────────────────────────────────┐
│ Cloudflare (API + Dashboard + Webhooks)             │
│  Workers: Elysia REST API                           │
│  Pages: TanStack Start Dashboard                    │
│  KV/R2/Queues/D1: Cache, Storage, Webhook, DB      │
├─────────────────────────────────────────────────────┤
│ Fly.io ($3-5/session/month)                         │
│  Micro VMs: Baileys engine (Node.js, ~30MB each)    │
│  Connected to CF via internal API                   │
└─────────────────────────────────────────────────────┘
```

This hybrid keeps 80% of the serverless benefits (API at edge, dashboard on Pages, auth in KV) while running the engine on cheap Node.js VMs where WhatsApp detection is less likely.

---

## 10. Critical Path & Risk Matrix

### 10.1 Critical Path Items

```
Week 0: Validation Sprint (proxy + crypto + handshake)
    ↓ (GO/NO-GO gate)
Week 1-2: Monorepo scaffold + DB schema (E1)
    ↓
Week 3-5: Engine fork + adapters (E2) ← LONGEST SINGLE EPIC
    ↓
Week 5-7: DO + API + Auth (E3, E4, E5) ← can parallelize
    ↓
Week 7-9: Dashboard + UI (E7, E8)
    ↓
Week 9+: Desktop, SaaS, CRM (parallel streams)
```

### 10.2 Risk Matrix

| Risk | Probability | Impact | Mitigation | Owner |
|------|:-----------:|:------:|-----------|-------|
| WhatsApp blocks CF datacenter IPs | **HIGH** | Critical | Per-session proxy; managed proxy pool | Protocol Engineer |
| libsignal pure-JS replacement takes >6 weeks | Medium | High | Use Baileys v4 reference impl; hire specialist | Protocol Engineer |
| DO memory overflow (large accounts) | Low | Medium | Session-state paging; lazy-load signal sessions | Platform Specialist |
| Elysia doesn't perform on Workers | Low | Medium | Benchmark early; Hono as fallback | API Architect |
| D1 10GB limit per tenant | Low | Low | TTL/archival for old messages; DB-per-tenant distributes load | DB Architect |
| Baileys upstream protocol break | Medium | High | Pin version; monitor WA Web updates; community patches | Protocol Engineer |
| Bundle size exceeds 10MB Worker limit | Low | Medium | Code splitting; lazy protobuf loading | Platform Specialist |

---

## 11. Architecture Decision Records (ADRs)

### ADR-001: Engine Strategy — Fork Baileys v5 (Not v7)

**Context:** Baileys v7 introduced native Rust dependencies (libsignal, binary codec) that don't run in CF Workers.

**Decision:** Fork from Baileys v5 (last pure-JS version), then cherry-pick v6/v7 protocol updates.

**Consequences:**
- (+) Pure JS from the start — no native module removal
- (+) Proven Signal Protocol implementation included
- (-) Must manually port any v6/v7 protocol changes
- (-) v5 may be behind on latest WA protocol features

### ADR-002: Rate Limiting — DO-based (Not KV)

**Context:** KV is eventually consistent (up to 60s). Strict rate limiting requires strong consistency.

**Decision:** Use a dedicated Durable Object for rate limiting, keyed by API key prefix.

**Consequences:**
- (+) Strongly consistent counters
- (+) Exact sliding window semantics
- (-) Additional DO cost (~negligible for rate limit checks)
- (-) Slightly higher latency than KV read (~5ms vs ~1ms)

### ADR-003: Proxy Architecture — Per-Session Config

**Context:** WhatsApp blocks datacenter IPs. Not all proxy solutions are equal.

**Decision:** Each session stores its own proxy configuration (URL, type, credentials). Platform offers managed proxy pool as optional add-on.

**Consequences:**
- (+) Flexibility — users bring their own proxy
- (+) Platform doesn't bear proxy cost for all users
- (+) Different sessions can use different geographic endpoints
- (-) Users must understand proxy requirement
- (-) Proxy reliability becomes user's responsibility (unless managed)

### ADR-004: Dashboard — TanStack Start (Not Astro 6 Islands)

**Context:** Dashboard needs server-side rendering for auth plus heavy interactivity for chat views. Team is React-first.

**Decision:** TanStack Start with server functions. Full React SPA with SSR, deploys to CF Workers via @cloudflare/vite-plugin.

**Consequences:**
- (+) Unified React DX — no Astro templates + islands mental model
- (+) Server functions give direct D1/DO binding access (zero API hops for dashboard)
- (+) TanStack Query deeply integrated (SSR prefetch, cache invalidation)
- (+) Shared components work without `client:load` wrappers
- (-) Larger JS bundle than Astro islands (full React hydration)
- (-) TanStack Start is pre-1.0 (RC) — pin version to mitigate
- (-) Slightly slower initial page load vs Astro (offset by instant interactivity)

### ADR-005: Database — Cloudflare D1 DB-Per-Tenant (Not NeonDB)

**Context:** Current system uses SQLite for boot-critical data + Postgres for user data. Need serverless database.

**Decision:** Use Cloudflare D1 (SQLite) with a database-per-tenant model. Control plane D1 for global data (tenants, api_keys). Per-tenant D1 for isolated data (sessions, messages, contacts).

**Consequences:**
- (+) $0 extra cost (included in Workers Paid plan)
- (+) Sub-millisecond latency (native binding, same network)
- (+) Physical tenant isolation (separate databases — stronger than RLS)
- (+) No cold start (unlike NeonDB free tier)
- (+) Simpler schemas (no tenant_id column everywhere)
- (+) 50,000 databases per account (massive multi-tenancy support)
- (-) SQLite dialect (no JSONB indexing, no arrays, no stored procedures)
- (-) Single-threaded writes per DB (~1K qps) — mitigated by per-tenant isolation
- (-) 10GB max per database — sufficient for most tenants, implement TTL for high-volume
- (-) Cross-tenant analytics requires iterating DBs or separate aggregation layer
- (-) Schema migrations must run across all tenant databases

---

## 12. Recommended Next Steps

### Immediate (This Week)

1. **Execute Validation Sprint** — De-risk DO → Proxy → WA connection
2. **Identify Baileys v5 fork point** — Find last pure-JS commit in Baileys git history
3. **Set up monorepo scaffold** — Bun + Turborepo + Biome (non-blocking, can start immediately)

### Week 1-2 (If Validation Passes)

4. **Begin engine fork** — Start with crypto layer (@noble/curves + Web Crypto)
5. **Implement Drizzle schema** — All 9 tables with migrations
6. **Scaffold Elysia API** — Health endpoint + auth middleware as proof of concept

### Ongoing

7. **Monitor WhatsApp protocol changes** — Subscribe to Baileys community channels
8. **Benchmark DO memory** — Track actual usage as engine develops
9. **Document proxy solutions** — Test 2-3 residential proxy providers for reliability

---

## 13. Cost Projection

### Development Cost (16 weeks, solo developer)

| Phase | Weeks | Focus |
|:-----:|:-----:|-------|
| 0 | 0.5 | Validation sprint |
| 1 | 2 | Foundation (monorepo, DB, shared packages) |
| 2 | 3 | Engine fork (critical path) |
| 3 | 2 | DO + API + Auth + Webhooks |
| 4 | 2.5 | Dashboard + UI library |
| 5 | 2 | Desktop app |
| 6 | 2 | SaaS features + billing |
| 7 | 1.5 | CRM + Mart integration |
| 8 | 1 | Polish + launch |

### Operational Cost (Post-Launch)

| Scale | CF Plan | D1 | Proxy | Total |
|:-----:|:-------:|:------:|:-----:|:-----:|
| 1-3 sessions | $5/mo | Included | $10-30/mo | **$15-35/mo** |
| 5-10 sessions | $5/mo | Included | $30-50/mo | **$35-55/mo** |
| 50+ sessions | $10-15/mo | ~$5/mo | $100-200/mo | **$115-220/mo** |

**Note:** The $5/mo target in the PLAN.md excludes proxy costs. With proxy, minimum realistic cost is ~$15-35/mo for a small deployment. Proxy cost is the dominant expense.

---

## Appendix A: Validation Sprint Test Plan

```typescript
// validation/test-do-connection.ts
// Deploy this minimal DO to test WA connectivity

export class ValidationDO extends DurableObject {
  async fetch(request: Request) {
    const proxyUrl = 'socks5://user:pass@residential-proxy:1080';

    // Step 1: Connect through proxy to WhatsApp
    const ws = new WebSocket('wss://web.whatsapp.net/ws/chat', {
      headers: { 'Origin': 'https://web.whatsapp.com' }
    });

    // Step 2: Perform Noise_XX handshake
    // ... (using @noble/curves for Curve25519)

    // Step 3: Send auth frame
    // ... (using Web Crypto for AES-GCM)

    // Step 4: Report success/failure
    return new Response(JSON.stringify({ status: 'connected', latency: ms }));
  }
}
```

---

## Appendix B: Technology Decision Matrix

| Criteria (weight) | Elysia | Hono | itty-router |
|:---:|:---:|:---:|:---:|
| Type safety (30%) | 10 | 7 | 4 |
| CF Workers perf (25%) | 8 | 9 | 10 |
| Ecosystem/plugins (15%) | 7 | 8 | 5 |
| Eden Treaty / client gen (20%) | 10 | 5 | 2 |
| Bundle size (10%) | 7 | 9 | 10 |
| **Weighted Score** | **8.85** | **7.55** | **5.60** |

**Winner: Elysia** — Eden Treaty client generation is uniquely valuable for the Mart integration and SDK story.

---

## Appendix C: Glossary of Key Decisions

| Decision | Choice | Alternative Considered | Reason |
|----------|--------|----------------------|--------|
| Engine | Baileys v5 fork | whatsapp-web.js, write from scratch | Pure JS, proven, ~30MB RAM |
| Runtime | CF Durable Objects | Fly.io, AWS Lambda, containers | Auto-scale, $5/mo, edge-native |
| API | Elysia | Hono, Express | Eden Treaty, end-to-end types |
| DB | Cloudflare D1 + Drizzle | NeonDB, Turso, PlanetScale | $0 extra, sub-ms latency, DB-per-tenant isolation |
| Dashboard | TanStack Start | Next.js, Remix, Astro 6 | Full React SPA + SSR, server functions, CF Workers native |
| Desktop | Electron | Tauri | Full Node.js (engine needs it) |
| Validation | Valibot | Zod, TypeBox | Smaller bundle, tree-shakeable |
| Auth | better-auth + API keys | Auth.js, Lucia | Built for serverless, simple |
| Monorepo | Bun + Turborepo | pnpm + Nx | Faster, native TS, workspace support |
| Lint/Format | Biome | ESLint + Prettier | Single tool, 10x faster |
