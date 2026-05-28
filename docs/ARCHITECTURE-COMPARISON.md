# Architecture Comparison: D1 + TanStack Start vs NeonDB + Astro 6

**Date:** 2026-05-28
**Purpose:** Evaluate alternative stack (D1 + TanStack Start) against the original plan (NeonDB + Astro 6)

---

## 1. Overview of Both Options

### Option A: Original Plan (NeonDB + Astro 6 + Elysia)

```
CF Workers ─── Elysia REST API ─── Hyperdrive ─── NeonDB (PostgreSQL)
CF Pages  ─── Astro 6 (SSR + React Islands)
CF DO     ─── WhatsApp Engine Sessions
CF KV     ─── Auth cache, rate limiting
CF R2     ─── Media storage
CF Queues ─── Webhook delivery
```

### Option B: Proposed Alternative (D1 + TanStack Start + Elysia)

```
CF Workers ─── Elysia REST API ─── D1 (SQLite)
CF Pages  ─── TanStack Start (Full React SPA + Server Functions)
CF DO     ─── WhatsApp Engine Sessions
CF KV     ─── Auth cache, rate limiting
CF R2     ─── Media storage
CF Queues ─── Webhook delivery
```

---

## 2. D1 vs NeonDB — Deep Comparison

| Criteria | D1 (SQLite) | NeonDB (PostgreSQL) |
|----------|:-----------:|:-------------------:|
| **Max DB size** | 10 GB | Unlimited |
| **Concurrent writes** | Single-threaded (~1K qps) | Highly concurrent (10K+ qps) |
| **Read throughput** | ~1K qps per replica | Unlimited (connection pooled) |
| **Latency (from Worker)** | <1ms (same network) | 5-20ms (via Hyperdrive) |
| **Cold start** | None (always warm) | 2-5s (free tier, mitigated by Hyperdrive) |
| **JSON support** | TEXT + `json_extract()` | Native JSONB (indexable) |
| **Array columns** | Not supported | Native `TEXT[]`, `INTEGER[]` |
| **UUID type** | TEXT (store as string) | Native `UUID` with `gen_random_uuid()` |
| **Enums** | TEXT + CHECK constraint | Native `pgEnum` |
| **Full-text search** | FTS5 (basic) | `tsvector` + GIN indexes (powerful) |
| **Row-Level Security** | Not supported | Supported (defense-in-depth) |
| **Transactions** | `batch()` API (implicit) | Full ACID transactions |
| **Connection model** | Binding (zero-config) | Connection string (via Hyperdrive) |
| **Drizzle ORM** | ✅ `drizzle-orm/d1` (sqlite-core) | ✅ `drizzle-orm/postgres-js` |
| **Multi-tenant pattern** | Per-tenant DB (recommended by CF) | Single DB with tenant_id scoping |
| **Cost (Workers Paid)** | Included ($5/mo) | Free tier → $19/mo (paid) |
| **Backups** | Time Travel (30 day PITR) | Branching + PITR |
| **Global distribution** | Read replicas (eventual consistency) | Single region (via Hyperdrive) |
| **Max DBs per account** | 50,000 | N/A (external service) |

### D1 Multi-Tenant Model: Database-Per-Tenant

D1's **key advantage** is that Cloudflare explicitly recommends and prices for a **database-per-tenant** model. You can have 50,000 databases on the paid plan at no extra cost.

```
Tenant A → d1-tenant-a (isolated 10GB SQLite)
Tenant B → d1-tenant-b (isolated 10GB SQLite)
Tenant C → d1-tenant-c (isolated 10GB SQLite)
```

**Pros of DB-per-tenant:**
- Perfect isolation (no accidental data leaks — physically separate)
- No `tenant_id` filtering needed on every query
- Independent backups/restores per tenant
- Per-tenant performance isolation (one busy tenant can't slow others)
- Simpler schema (no tenant_id column everywhere)

**Cons of DB-per-tenant:**
- Schema migrations must run across ALL tenant DBs
- Cross-tenant queries impossible (analytics, admin panel)
- Need a "control plane" DB for tenant registry
- Dynamic DB binding resolution at runtime

### D1 Architecture Pattern

```
┌─────────────────────────────────────────────────────────┐
│ Control Plane (D1 - single DB)                          │
│  tenants, api_keys, plans, billing                      │
└────────────────────────┬────────────────────────────────┘
                         │ (resolve tenant → get DB name)
                         ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│ D1: t-001 │  │ D1: t-002 │  │ D1: t-003 │  ← Per-tenant
│ sessions  │  │ sessions  │  │ sessions  │
│ messages  │  │ messages  │  │ messages  │
│ contacts  │  │ contacts  │  │ contacts  │
│ webhooks  │  │ webhooks  │  │ webhooks  │
└──────────┘  └──────────┘  └──────────┘
```

---

## 3. TanStack Start vs Astro 6 — Deep Comparison

| Criteria | TanStack Start | Astro 6 + @astrojs/cloudflare |
|----------|:--------------:|:-----------------------------:|
| **Rendering model** | Full React SPA + SSR hydration | Islands (selective hydration) |
| **Routing** | File-based (TanStack Router) | File-based (Astro pages) |
| **Data fetching** | TanStack Query (built-in) | Any (fetch, Query, Eden) |
| **Server functions** | ✅ Type-safe RPC (`createServerFn`) | ❌ (use separate API) |
| **Server components** | Experimental (React 19 RSC) | React islands (`client:load`) |
| **CF Workers deploy** | ✅ via `@cloudflare/vite-plugin` | ✅ via `@astrojs/cloudflare` |
| **CF bindings access** | ✅ from server functions | ✅ from Astro middleware/endpoints |
| **Bundle size** | Larger (full React runtime always) | Smaller (islands load React only where needed) |
| **Initial page load** | Slower (full SPA hydration) | Faster (minimal JS, progressive) |
| **Interactivity** | Instant (already hydrated) | Slightly slower (island hydration) |
| **DX for React devs** | Excellent (all React, all the time) | Mixed (Astro templates + React islands) |
| **Maturity** | RC (pre-1.0, API stabilizing) | Stable (v6, production-proven) |
| **Type safety** | Excellent (router + query + server fns) | Good (Astro types + manual) |
| **Real-time (WebSocket)** | Standard React hooks | Same (hooks in islands) |
| **SEO / first paint** | SSR (but full hydration after) | Excellent (minimal JS) |
| **Shared components** | Direct import (all React) | Must wrap in `client:load` |

### TanStack Start Architecture for OpenWA

```typescript
// app/routes/sessions.tsx — Full page with server function
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start/server';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';

// Server function — runs on CF Worker, has access to D1 binding
const getSessions = createServerFn({ method: 'GET' })
  .handler(async ({ context }) => {
    const db = context.env.DB; // D1 binding
    return await db.prepare('SELECT * FROM sessions').all();
  });

// Query option for React Query integration
const sessionsQueryOptions = queryOptions({
  queryKey: ['sessions'],
  queryFn: () => getSessions(),
});

// Route component — full React, server-rendered + hydrated
export const Route = createFileRoute('/sessions')({
  loader: ({ context }) => context.queryClient.ensureQueryData(sessionsQueryOptions),
  component: SessionsPage,
});

function SessionsPage() {
  const { data: sessions } = useSuspenseQuery(sessionsQueryOptions);
  // Full interactive React — no islands needed
  return <SessionList sessions={sessions} />;
}
```

### Key Advantage: Server Functions Replace Dashboard API Calls

With TanStack Start, the dashboard doesn't need to call the Elysia API for its own operations. Server functions run directly on the Worker and can access D1/KV/R2/DO bindings directly:

```
Current Plan:  Browser → Elysia API → NeonDB
                                     → DO (engine ops)

TanStack Plan: Browser → Server Function → D1 (direct binding)
                                         → DO (direct stub access)
               External:  SDK/Mart → Elysia API → D1 → DO
```

This means:
- **Dashboard operations**: Zero network hops (server function → D1 binding)
- **External API**: Still goes through Elysia (for SDK consumers, Mart, webhooks)
- **Result**: Faster dashboard, simpler auth (session cookies vs API keys)

---

## 4. Combined Architecture: D1 + TanStack Start

```
┌─────────────────────────────────────────────────────────────────────┐
│ Cloudflare ($5/month Workers Paid Plan)                             │
│                                                                     │
│  Pages ──────────── TanStack Start (Full React SPA + Server Fns)    │
│  Workers ─────────── Elysia REST API (external consumers only)      │
│  Durable Objects ─── WhatsApp Engine (Baileys fork, 1 DO/session)   │
│  D1 ─────────────── Control Plane DB (tenants, api_keys, plans)     │
│  D1 (×N) ────────── Per-Tenant DBs (sessions, messages, contacts)   │
│  Queues ──────────── Webhook delivery (with retries)                │
│  KV ─────────────── Auth cache, rate limiting, session tokens       │
│  R2 ─────────────── Media storage (images, videos, documents)       │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow Comparison

| Operation | Option A (NeonDB + Astro) | Option B (D1 + TanStack) |
|-----------|--------------------------|--------------------------|
| Dashboard loads sessions | Astro SSR → Elysia API → Hyperdrive → NeonDB | Server fn → D1 binding (0 hops) |
| Dashboard sends message | React island → Elysia → DO | Server fn → DO stub (0 hops) |
| SDK sends message | HTTP → Elysia → Hyperdrive → NeonDB + DO | HTTP → Elysia → D1 + DO |
| Webhook delivery | Queue consumer → NeonDB → HTTP POST | Queue consumer → D1 → HTTP POST |
| Auth validation | KV cache → NeonDB (miss) | KV cache → D1 control plane (miss) |

---

## 5. Schema Changes for D1 (SQLite Dialect)

```typescript
// packages/db/src/schema/sessions.ts (D1 version)
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// No pgEnum — use text with CHECK or just text
// No UUID type — use text with generated UUID
// No JSONB — use text (serialize/deserialize in app)
// No arrays — use JSON text or junction tables
// No timestamp with timezone — use integer (unix epoch) or text (ISO)

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  phone: text('phone'),
  status: text('status', {
    enum: ['created', 'initializing', 'qr_ready', 'authenticating', 'ready', 'disconnected', 'failed']
  }).notNull().default('created'),
  doId: text('do_id'),
  pushName: text('push_name'),
  config: text('config', { mode: 'json' }),        // JSON serialized
  proxyUrl: text('proxy_url'),
  proxyType: text('proxy_type'),
  connectedAt: integer('connected_at', { mode: 'timestamp' }),
  lastActiveAt: integer('last_active_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  waMessageId: text('wa_message_id').notNull(),
  chatId: text('chat_id').notNull(),
  fromJid: text('from_jid'),
  toJid: text('to_jid'),
  body: text('body'),
  type: text('type').notNull(),          // text|image|video|audio|document|location|contact|sticker
  direction: text('direction').notNull(), // incoming|outgoing
  status: text('status').default('sent'), // pending|sent|delivered|read|failed
  mediaUrl: text('media_url'),
  mediaMime: text('media_mime'),
  metadata: text('metadata', { mode: 'json' }),
  waTimestamp: integer('wa_timestamp').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const contacts = sqliteTable('contacts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  waId: text('wa_id').notNull().unique(),
  phone: text('phone').notNull(),
  name: text('name'),
  pushName: text('push_name'),
  tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),  // JSON array
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Note: No tenant_id columns needed! Each tenant has their own DB.
```

**Key difference:** With DB-per-tenant, schemas are simpler — no `tenant_id` anywhere. Isolation is physical, not logical.

---

## 6. Validation Assessment

### ✅ What Works Well

| Aspect | Assessment |
|--------|-----------|
| **D1 latency** | Sub-millisecond from Workers — faster than NeonDB even with Hyperdrive |
| **D1 cost** | $0 extra (included in $5/mo plan) vs $0-19/mo for NeonDB |
| **DB-per-tenant isolation** | Superior to row-level filtering — zero risk of data leaks |
| **TanStack Start DX** | Excellent for React-heavy teams — unified mental model |
| **Server functions** | Eliminate dashboard→API round-trip — direct D1/DO access |
| **Type safety** | TanStack Router + Query + Server Fns = end-to-end types |
| **CF-native deployment** | Both D1 and TanStack Start are first-class CF citizens |
| **10GB per tenant** | More than enough for most tenants (messages + contacts) |
| **50K DBs per account** | Supports massive multi-tenancy |

### ⚠️ Concerns & Trade-offs

| Concern | Severity | Mitigation |
|---------|:--------:|-----------|
| **D1 write throughput (1K qps)** | Medium | Per-tenant DB means write load is distributed; unlikely one tenant hits 1K writes/sec |
| **No JSONB indexing** | Low | Use separate columns for frequently-queried fields; `json_extract()` for rare queries |
| **Schema migration across N DBs** | Medium | Build migration runner that iterates all tenant DBs; CF provides `d1 migrations apply --remote` |
| **Cross-tenant analytics** | High | Need separate analytics D1 or aggregate data to a reporting store |
| **TanStack Start maturity (RC)** | Medium | API is stable; risk is edge-case bugs, not breaking changes. Can pin version |
| **No RLS defense-in-depth** | Low | Physical isolation (separate DBs) is stronger than RLS |
| **Full SPA bundle size** | Low | TanStack Start does code splitting per route; React is loaded once |
| **Admin panel (cross-tenant view)** | Medium | Control plane DB has tenant metadata; per-tenant data requires DB iteration |

### ❌ Potential Blockers

| Blocker | Risk | Resolution |
|---------|:----:|-----------|
| **D1 10GB limit per DB** | Low | For WhatsApp: 10GB ≈ millions of messages. Implement TTL/archival for old messages |
| **D1 single-writer bottleneck** | Low | Each tenant is isolated; burst writes (bulk messaging) should batch via `db.batch()` |
| **TanStack Start + CF bindings** | Low | Officially supported via `@cloudflare/vite-plugin`; documented pattern |
| **Server function auth** | Low | Use `better-auth` with session cookies; validate in server fn middleware |

---

## 7. Final Comparison Matrix

| Criteria (Weight) | Option A: NeonDB + Astro 6 | Option B: D1 + TanStack Start |
|:-:|:-:|:-:|
| **Cost** (15%) | $5-24/mo (NeonDB adds $0-19) | $5/mo flat (D1 included) |
| **Latency** (15%) | 5-20ms DB queries | <1ms DB queries |
| **Multi-tenancy isolation** (15%) | Logical (tenant_id filter) | Physical (separate DBs) |
| **SQL features** (10%) | Full PostgreSQL (JSONB, arrays, FTS) | SQLite subset (limited) |
| **Frontend DX** (10%) | Mixed (Astro + React islands) | Unified React (TanStack) |
| **Scalability** (10%) | Excellent (Postgres scales vertically) | Horizontal (DB-per-tenant) |
| **Admin/Analytics** (10%) | Easy (single DB, SQL joins) | Hard (cross-DB aggregation) |
| **Maturity** (5%) | Production-proven (Astro 6, NeonDB) | RC / newer (TanStack Start) |
| **Type safety** (5%) | Good (Eden Treaty + Astro types) | Excellent (integrated stack) |
| **CF-native** (5%) | Partial (NeonDB is external) | Fully native (D1 is CF) |

### Weighted Scores

| Option | Score | Best For |
|--------|:-----:|---------|
| **A: NeonDB + Astro 6** | 7.5/10 | Complex queries, large tenants, analytics, proven stack |
| **B: D1 + TanStack Start** | 8.2/10 | Cost-optimized, React teams, strict isolation, CF-native |

---

## 8. Recommended Hybrid: Option B with Adjustments

### Architecture Decision

**Use D1 + TanStack Start** as the primary architecture, with these adjustments:

1. **D1 (DB-per-tenant)** for all tenant data (sessions, messages, contacts, webhooks, labels, conversations)
2. **D1 (control plane)** for platform data (tenants, api_keys, plans, billing)
3. **TanStack Start** for the dashboard (full React SPA with server functions)
4. **Elysia** remains for external REST API (SDK consumers, Mart integration, webhooks)
5. **Keep NeonDB as optional upgrade path** for enterprise tenants who need advanced SQL

### Updated Monorepo Structure

```
openwa/
├── apps/
│   ├── dashboard/              → TanStack Start (CF Pages, full React SPA)
│   │   ├── app/
│   │   │   ├── routes/         → File-based routes (TanStack Router)
│   │   │   ├── server/         → Server functions (D1/DO access)
│   │   │   └── components/     → React components
│   │   ├── vite.config.ts      → @cloudflare/vite-plugin
│   │   └── wrangler.jsonc
│   │
│   └── desktop/                → Electron (same as before)
│
├── services/
│   └── api/                    → Elysia (external REST API only)
│       ├── src/routes/
│       └── wrangler.jsonc
│
├── workers/
│   └── wa-session/             → Durable Object (unchanged)
│
├── packages/
│   ├── engine/                 → Baileys fork (unchanged)
│   ├── db/                     → Drizzle ORM + D1 (sqlite-core dialect)
│   │   ├── src/schema/         → SQLite schemas (no tenant_id!)
│   │   ├── src/control-plane/  → Control plane schema (tenants, keys)
│   │   └── src/client.ts       → D1 binding wrapper
│   ├── ui/                     → Shared React components (unchanged)
│   ├── validators/             → Valibot (unchanged)
│   └── shared/                 → Types & constants (unchanged)
```

### Key Changes from Original Plan

| Change | Why |
|--------|-----|
| NeonDB → D1 | $0 extra cost, sub-ms latency, physical tenant isolation |
| Astro 6 → TanStack Start | Unified React DX, server functions, no islands complexity |
| Single DB → DB-per-tenant | D1's recommended pattern; stronger isolation |
| Hyperdrive removed | Not needed (D1 is native binding) |
| Schema simplification | No `tenant_id` columns; no pgEnum; SQLite types |
| Dashboard server functions | Direct D1/DO access, no API round-trip for dashboard |
| Elysia scope reduced | Only external API consumers (SDK, Mart, webhooks) |

### Migration Runner (Cross-DB Migrations)

```typescript
// packages/db/src/migrate-all.ts
import { drizzle } from 'drizzle-orm/d1';
import { migrate } from 'drizzle-orm/d1/migrator';

export async function migrateAllTenantDbs(env: Env) {
  // 1. Get all tenant DB names from control plane
  const controlDb = drizzle(env.CONTROL_DB);
  const tenants = await controlDb.select().from(tenantsTable);

  // 2. Apply migrations to each tenant DB
  for (const tenant of tenants) {
    const tenantDb = env[`TENANT_DB_${tenant.slug}`]; // Dynamic binding
    // OR use the D1 REST API to access DBs by ID
    await migrate(drizzle(tenantDb), { migrationsFolder: './drizzle' });
  }
}
```

---

## 9. When to Choose Option A (NeonDB) Instead

Choose NeonDB + Astro if:

- You need **complex SQL queries** (window functions, CTEs, recursive queries)
- You need **cross-tenant analytics** in a single query
- Tenants will have **>10GB data** (high-volume messaging)
- You need **JSONB indexing** for metadata queries
- You prefer a **proven production stack** with lower risk
- You need **Row-Level Security** as a compliance requirement
- The **admin panel** needs cross-tenant views with SQL joins

Choose D1 + TanStack Start if:

- **$5/month hard cap** is a strict requirement (no external DB cost)
- You want **sub-millisecond DB latency** from Workers
- You prefer **physical tenant isolation** over logical
- Your team is **React-first** (no Astro learning curve)
- Most tenants are **small-medium** (<10GB, <1K writes/sec)
- You want **maximum CF-native** integration (no external services)
- You value **server functions** over API-call pattern for dashboard

---

## 10. Final Verdict

### **Option B (D1 + TanStack Start) is VALID** ✅

It's a legitimate architecture that trades SQL power for cost, latency, and isolation benefits. The main trade-off is:

**You gain:** $0 DB cost, <1ms queries, physical isolation, unified React DX
**You lose:** JSONB indexing, cross-tenant analytics, SQL power, proven maturity

### Recommendation: **GO with Option B** for the initial launch

- D1's per-tenant model is actually **better** for a multi-tenant SaaS at small-medium scale
- TanStack Start's server functions **eliminate complexity** (no dashboard→API hop)
- If enterprise tenants need more → offer NeonDB as a "bring your own Postgres" upgrade
- The WhatsApp engine (DO) and Elysia external API are **unchanged** between options

### One Important Caveat

**TanStack Start is pre-1.0 (RC).** If shipping to production in <16 weeks:
- Pin the version and don't upgrade during development
- Have a fallback plan (swap to Vite + React Router if Start has critical bugs)
- The server functions pattern is stable; routing is stable; risk is in edge cases
