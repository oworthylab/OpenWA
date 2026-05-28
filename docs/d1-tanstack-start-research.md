# Cloudflare D1 & TanStack Start Research Report

**Date:** 2026-05-28
**Context:** OpenWA platform migration feasibility
**Sources:** Cloudflare official docs, TanStack Start docs, Drizzle ORM docs

---

## Part 1: Cloudflare D1 Limitations & Capabilities

### 1.1 Core Limits Table

| Constraint | Free Plan | Workers Paid ($5/mo) |
|---|---|---|
| **Max database size** | 500 MB | **10 GB** (hard cap, cannot be increased) |
| **Max storage per account** | 5 GB | **1 TB** |
| **Databases per account** | 10 | **50,000** |
| **Queries per Worker invocation** | 50 | **1,000** |
| **Max columns per table** | 100 | 100 |
| **Max row/BLOB size** | 2 MB | 2 MB |
| **Max SQL statement length** | 100 KB | 100 KB |
| **Max bound parameters per query** | 100 | 100 |
| **Max SQL query duration** | 30 seconds | 30 seconds |
| **Max arguments per SQL function** | 32 | 32 |
| **LIKE/GLOB pattern length** | 50 bytes | 50 bytes |
| **Max bindings per Worker script** | ~5,000 | ~5,000 |
| **Max simultaneous D1 connections per Worker** | 6 | 6 |

### 1.2 Concurrent Write Limits

| Property | Detail |
|---|---|
| **Threading model** | **Single-threaded** — each D1 database processes queries one at a time |
| **Throughput (1ms queries)** | ~1,000 queries/sec |
| **Throughput (100ms queries)** | ~10 queries/sec |
| **Overload behavior** | Queues requests → returns "overloaded" error if queue is full |
| **Write duration** | Several ms per write (INSERT/UPDATE), must be durably persisted across locations |
| **Batch data migrations** | Must be chunked to ~1,000 rows at a time to avoid execution limits |
| **Horizontal scaling pattern** | Design for per-tenant/per-user databases (50K DBs per account) |

**Critical limitation:** D1 is backed by a single Durable Object. There is NO concurrent write parallelism within a single database. All writes are serialized.

### 1.3 SQLite Dialect Restrictions

| Feature | Status | Workaround |
|---|---|---|
| **JSONB type** | ❌ Not available (SQLite has no JSONB) | Use `TEXT` + `json()` / `json_extract()` functions |
| **Native arrays** | ❌ Not supported | Use JSON arrays in TEXT columns, or junction tables |
| **UUID type** | ❌ No native type | Use `TEXT` column with application-generated UUIDs |
| **ENUM type** | ❌ Not supported | Use `TEXT` with CHECK constraints |
| **Full-text search** | ✅ FTS5 available | |
| **JSON functions** | ✅ `json()`, `json_extract()`, `json_array()` etc. | |
| **Generated columns** | ✅ Supported | |
| **Common Table Expressions** | ✅ Supported | |
| **Window functions** | ✅ Supported | |
| **RETURNING clause** | ✅ Supported | |

### 1.4 Read/Write Latency from Workers

| Scenario | Latency |
|---|---|
| **Read (indexed, co-located)** | **<1ms** SQL duration |
| **Read (indexed, cross-region)** | **10-50ms** (network RTT to primary) |
| **Read (with read replication, nearby replica)** | **<5ms** |
| **Write (simple INSERT/UPDATE)** | **Several ms** (must persist durably) |
| **Full table scan** | Proportional to table size (avoid!) |
| **Batch of 100 statements** | Single round-trip (reduced latency vs. individual calls) |

### 1.5 Pricing on $5/mo Workers Paid Plan

| Metric | Monthly Included | Overage |
|---|---|---|
| **Rows read** | 25 billion | $0.001/million rows |
| **Rows written** | 50 million | $1.00/million rows |
| **Storage** | 5 GB | $0.75/GB-month |
| **Data transfer / egress** | **Free** | N/A |
| **Read replication** | **No extra cost** | Same billing as without replicas |

Daily limits on Free plan: 5M reads/day, 100K writes/day.

### 1.6 Drizzle ORM Support for D1

| Aspect | Status |
|---|---|
| **Official support** | ✅ First-class `drizzle-orm/d1` driver |
| **Dialect** | `sqlite` (uses `drizzle-orm/sqlite-core`) |
| **Drizzle Kit driver** | `d1-http` for remote, local for dev |
| **Schema push** | ✅ `drizzle-kit push` |
| **Migrations** | ✅ `drizzle-kit generate` + `drizzle-kit migrate` |
| **Connection pattern** | `const db = drizzle(env.DB)` from Worker binding |
| **Relational queries** | ✅ Supported |
| **Type generation** | ✅ Via `wrangler types` |

```typescript
// Example: Drizzle + D1 in a Worker
import { drizzle } from 'drizzle-orm/d1';

export default {
  async fetch(request: Request, env: Env) {
    const db = drizzle(env.DB);
    const result = await db.select().from(users).all();
    return Response.json(result);
  },
};
```

### 1.7 Transaction Support

| Method | Transaction Behavior |
|---|---|
| **`db.batch([...])`** | ✅ **Implicit transaction** — all statements execute atomically. If any fails, entire batch rolls back |
| **Explicit `BEGIN`/`COMMIT`** | ✅ Supported via `db.exec()` |
| **Drizzle `db.transaction()`** | ⚠️ Uses batch API under the hood for D1 |
| **Nested transactions** | ❌ Not supported (SQLite savepoints not exposed) |
| **Isolation level** | Serializable (single-writer, single-threaded) |

**Key detail:** D1 operates in **auto-commit mode**. The `batch()` API is the primary transactional mechanism. Batched statements execute sequentially, non-concurrently, within an implicit transaction.

### 1.8 Maximum Rows per Query/Batch

| Constraint | Value |
|---|---|
| **Max rows per table** | Unlimited (limited only by 10 GB storage) |
| **Max rows returned per query** | No explicit limit (bounded by CPU/memory limits) |
| **Max statements per batch** | No documented hard limit (individual limits apply per statement) |
| **Recommended batch mutation size** | ~1,000 rows per statement for data migrations |
| **Batch size for `db.batch()`** | Limited by 100 KB per statement × 1,000 queries per invocation |

### 1.9 Replication Model

| Aspect | Detail |
|---|---|
| **Default (no replication)** | All queries go to single primary instance. **Strongly consistent.** |
| **With read replication** | Writes → primary. Reads → nearest replica. **Eventually consistent** without Sessions API. |
| **Sessions API** | Provides **sequential consistency** via bookmarks |
| **Replica locations** | 6 global regions: ENAM, WNAM, WEUR, EEUR, APAC, OC |
| **Replica lag** | Variable, non-deterministic |
| **"Read your own writes"** | ✅ Guaranteed within a Session |
| **Cross-session consistency** | Requires passing bookmarks between sessions |
| **Extra cost for replicas** | None — same billing |

**Consistency model summary:**
- Without Sessions API: Eventually consistent reads from replicas
- With Sessions API: Sequential consistency (monotonic reads, monotonic writes, read-your-writes)
- Writes are always consistent (single primary)

### 1.10 D1 vs NeonDB PostgreSQL for Multi-Tenant SaaS

| Dimension | Cloudflare D1 | NeonDB PostgreSQL |
|---|---|---|
| **Database model** | SQLite (per-tenant DB encouraged) | PostgreSQL (single DB, RLS for isolation) |
| **Max DB size** | 10 GB per DB | 50 GB+ (varies by plan) |
| **SQL features** | SQLite subset (no JSONB, no arrays, no stored procedures) | Full PostgreSQL (JSONB, arrays, CTEs, extensions) |
| **Multi-tenant pattern** | 50K databases per account (DB-per-tenant) | Single DB with `tenant_id` + Row-Level Security |
| **Concurrent writes** | Single-threaded per DB (serialized) | Full MVCC, parallel writes |
| **Transactions** | Batch-based, serializable | Full ACID, multiple isolation levels |
| **Global read latency** | Read replicas in 6 regions (<5ms nearby) | Single region (unless Neon Read Replicas) |
| **Connection from Workers** | Native binding (zero latency) | Via Hyperdrive (connection pooling) |
| **Cold start impact** | None (binding is instant) | Hyperdrive eliminates TCP/TLS overhead |
| **ORM support** | Drizzle (sqlite-core) | Drizzle (pg-core), Prisma, TypeORM, etc. |
| **Schema migrations** | Drizzle Kit | Drizzle Kit, Prisma Migrate, raw SQL |
| **Cost at small scale** | Included in $5/mo Workers plan | Free tier: 0.5 GB storage, 190 compute-hours |
| **Branching / preview** | Time Travel (30-day PITR) | Database branching (for dev/preview) |
| **Full-text search** | FTS5 (basic) | `tsvector`/`tsquery` (advanced) |
| **JSON queries** | `json_extract()` (functional but limited) | `->`, `->>`, `@>`, GIN indexes (powerful) |

**Verdict for OpenWA multi-tenant SaaS:**

| Factor | Winner | Why |
|---|---|---|
| Schema complexity | **NeonDB** | OpenWA needs JSONB for message metadata, complex queries, RLS |
| Concurrent writes | **NeonDB** | D1's single-threaded model bottlenecks at scale |
| Global read latency | **D1** | Native replicas in 6 regions; Neon is single-region by default |
| Cost at small scale | **D1** | Fully included in $5/mo plan |
| Ecosystem / tooling | **NeonDB** | Full Postgres ecosystem, pg_extensions, etc. |
| Multi-tenant isolation | **Tie** | D1: DB-per-tenant. Neon: RLS. Both work. |

**Recommendation:** NeonDB remains the correct choice for OpenWA (as per existing architecture). D1 is unsuitable as the primary database due to SQLite limitations (no JSONB, single-threaded writes), but is excellent for per-session or per-tenant edge state (which is what Durable Objects SQLite already provides).

---

## Part 2: TanStack Start Deployment to Cloudflare

### 2.1 Cloudflare Support Status

| Aspect | Status |
|---|---|
| **Official CF Workers support** | ✅ **Yes** — Cloudflare is an Official Hosting Partner |
| **Deployment target** | Cloudflare Workers (not Pages Functions) |
| **Plugin** | `@cloudflare/vite-plugin` |
| **Official example** | [start-basic-cloudflare](https://github.com/TanStack/router/tree/main/examples/react/start-basic-cloudflare) |
| **Framework maturity** | Release Candidate (RC) — feature-complete, API stable |

### 2.2 Build System

| Component | Technology |
|---|---|
| **Build tool** | **Vite** (native — no Vinxi anymore) |
| **Server runtime** | **Nitro** (optional) OR **@cloudflare/vite-plugin** (for CF) |
| **Plugin architecture** | Vite plugins: `tanstackStart()` + platform plugin |
| **Previous build system** | Vinxi (deprecated in favor of direct Vite integration) |
| **CF-specific build** | `@cloudflare/vite-plugin` with `viteEnvironment: { name: 'ssr' }` |

**Configuration:**
```typescript
// vite.config.ts for Cloudflare Workers
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    viteReact(),
  ],
})
```

**wrangler.jsonc:**
```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "tanstack-start-app",
  "compatibility_date": "2025-09-02",
  "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry"
}
```

### 2.3 Access to CF Bindings (D1, KV, R2, DO)

| Binding | Accessible from Server Functions? | Pattern |
|---|---|---|
| **D1** | ✅ Yes | Via `getRequestEvent()` → `event.nativeEvent.env.DB` |
| **KV** | ✅ Yes | Same pattern via Worker env |
| **R2** | ✅ Yes | Same pattern via Worker env |
| **Durable Objects** | ✅ Yes | Same pattern via Worker env |
| **Queues** | ✅ Yes | Same pattern via Worker env |

**Access pattern in server functions:**
```typescript
// In a TanStack Start server function
import { createServerFn } from '@tanstack/react-start'
import { getWebRequest } from '@tanstack/react-start/server'

const getUsers = createServerFn({ method: 'GET' }).handler(async () => {
  // Access CF bindings through the platform event
  // Pattern depends on the CF Vite plugin exposing env
  const env = getCloudflareEnv() // via middleware or platform adapter
  const db = drizzle(env.DB)
  return db.select().from(users).all()
})
```

**Note:** The exact binding access pattern requires using the Cloudflare Vite plugin's environment injection. The `@cloudflare/vite-plugin` handles making `env` available in the SSR context.

### 2.4 Server Components / Server Actions

| Feature | Status |
|---|---|
| **Server Functions (RPC)** | ✅ Stable — type-safe RPC between client and server |
| **Server Components (RSC)** | ⚠️ **Experimental** — available but not stable |
| **Server Routes / API Routes** | ✅ Stable — build backend endpoints |
| **Middleware** | ✅ Stable — request/response handling with context injection |
| **Static Server Functions** | ✅ Stable — precomputed at build time |
| **Environment Functions** | ✅ Stable — run in specific environments |
| **SSR Streaming** | ✅ Stable |
| **Full-document SSR** | ✅ Stable |
| **ISR (Incremental Static Regeneration)** | ✅ Stable |

**Server Functions pattern:**
```typescript
import { createServerFn } from '@tanstack/react-start'

// Type-safe server function (similar to tRPC)
const fetchPosts = createServerFn({ method: 'GET' })
  .validator(z.object({ limit: z.number() }))
  .handler(async ({ data }) => {
    const posts = await db.select().from(postsTable).limit(data.limit)
    return posts
  })

// Called from client components
function PostList() {
  const posts = useSuspenseQuery({
    queryKey: ['posts'],
    queryFn: () => fetchPosts({ data: { limit: 10 } }),
  })
}
```

### 2.5 TanStack Start vs Astro 6 for Cloudflare Deployment

| Dimension | TanStack Start | Astro 6 |
|---|---|---|
| **CF deployment** | ✅ Official partner, `@cloudflare/vite-plugin` | ✅ Official `@astrojs/cloudflare` adapter |
| **Build tool** | Vite (native) | Vite (native) |
| **Rendering model** | Full React SSR + Client hydration | Islands architecture (partial hydration) |
| **React support** | ✅ Native (first-class React framework) | ✅ Via integration (`@astrojs/react`) |
| **Server functions** | `createServerFn()` — type-safe RPC | API routes + Astro actions |
| **CF bindings access** | Via Vite plugin env injection | Via `Astro.locals.runtime.env` |
| **Bundle size** | Larger (full React SSR) | Smaller (only hydrated islands ship JS) |
| **Type safety (end-to-end)** | ✅ Excellent (TypeScript throughout, typed routes) | Good (TypeScript, but less end-to-end) |
| **Data loading** | TanStack Router loaders + React Query | `getStaticPaths` / `Astro.props` / fetch |
| **Real-time (WebSocket)** | Not built-in (use separate Worker) | Not built-in (use separate Worker) |
| **Maturity** | RC (pre-v1.0) | Stable (v6.x) |
| **Community/ecosystem** | Growing rapidly, TanStack ecosystem | Large, established |
| **Server Components** | Experimental | ❌ Not applicable (different model) |
| **Static generation** | ✅ Supported | ✅ Excellent (primary mode) |
| **Content-heavy sites** | Possible but not primary use case | ✅ Primary use case |
| **SPA-like interactivity** | ✅ Primary use case (dashboard, apps) | Requires islands, more configuration |

### 2.6 Deployment Feasibility Assessment

| Criterion | TanStack Start on CF | Assessment |
|---|---|---|
| **Can deploy to Workers?** | ✅ Yes | Official partner with dedicated plugin |
| **Can access D1?** | ✅ Yes | Via CF Vite plugin env injection |
| **Can access KV/R2/DO?** | ✅ Yes | Same mechanism |
| **Worker script size limit** | 10 MB compressed | TanStack Start builds typically 2-5 MB ✅ |
| **nodejs_compat needed?** | Yes | Configured via compatibility_flags |
| **Cold start impact** | ~50-100ms (Worker isolate creation) | Acceptable for dashboard |
| **Long-lived WebSocket** | ❌ Not from Pages/SSR Worker | Must use separate API Worker (same as Astro) |
| **Production readiness** | ⚠️ RC status | API is stable but pre-v1.0 |

---

## Part 3: Relevance to OpenWA Project

### Current TanStack Usage in Workspace

| Package | Version | Location |
|---|---|---|
| `@tanstack/react-query` | ^5.100.10 | dashboard/package.json |
| `@tanstack/react-table` | ^8.21.3 | dashboard/package.json |
| `@tanstack/start` | **Not present** | — |

The dashboard currently uses TanStack Query and Table as a **Vite + React SPA** (client-side only, no SSR). There is no TanStack Start dependency.

### Architecture Decision Context

The existing cloudflare-platform-report.md already recommends:
- **Astro 6** for the dashboard (Pages + SSR with islands)
- **NeonDB + Hyperdrive** for the primary database (not D1)
- **Durable Objects** for per-session state (which uses DO-internal SQLite, not D1)

### Recommendation Summary

| Decision | Recommendation | Rationale |
|---|---|---|
| **Primary database** | **NeonDB** (keep current plan) | D1's single-threaded writes and SQLite limitations make it unsuitable for multi-tenant SaaS with complex queries |
| **D1 use case** | Per-tenant config/metadata edge cache OR not at all | The DO SQLite storage already serves per-session needs |
| **Dashboard framework** | **Astro 6** (keep current plan) OR consider TanStack Start | Astro is more mature and dashboard is content/admin-heavy. TanStack Start viable if team prefers React-first with typed routes |
| **TanStack Start consideration** | Worth evaluating post-v1.0 | Better type safety, React-native, official CF partner. But RC status is a risk for production |
| **CF bindings from TanStack Start** | ✅ Fully feasible | Same capabilities as Astro for accessing D1/KV/R2/DO from server functions |

---

## Appendix: Quick Reference

### D1 Decision Checklist

- ✅ Use D1 when: Per-user/per-tenant small databases, read-heavy workloads, edge performance needed
- ❌ Avoid D1 when: Complex queries (JSONB), high write concurrency, >10 GB per DB, need stored procedures
- ⚠️ Consider carefully: Multi-tenant SaaS in a single DB (D1 bottlenecks on writes)

### TanStack Start CF Deployment Checklist

```bash
# 1. Install deps
pnpm add -D @cloudflare/vite-plugin wrangler

# 2. Configure vite.config.ts with cloudflare() plugin
# 3. Create wrangler.jsonc with compatibility_flags: ["nodejs_compat"]
# 4. Set main: "@tanstack/react-start/server-entry"
# 5. Deploy
pnpm run build && wrangler deploy
```
