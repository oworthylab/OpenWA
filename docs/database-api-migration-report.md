# Database & API Migration Technical Report

**Author:** Database Architect & API Designer
**Date:** 2026-05-28
**Subject:** TypeORM→Drizzle, NestJS→Elysia, BullMQ→CF Queues, Socket.IO→DO WebSocket
**Status:** Research Complete

---

## 1. TypeORM → Drizzle ORM Migration (Cloudflare D1)

### 1.1 Drizzle Schema Definitions

Below is the complete Drizzle schema using `sqlite-core` for Cloudflare D1 (database-per-tenant model).

**Control Plane D1** (single global database for tenant/auth resolution):

```typescript
// packages/db/src/control-plane/tenants.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: text('plan', { enum: ['free', 'starter', 'business', 'enterprise'] }).notNull().default('free'),
  maxSessions: integer('max_sessions').notNull().default(2),
  d1DatabaseId: text('d1_database_id'), // ID of tenant's D1 database
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// packages/db/src/control-plane/api-keys.ts
export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  keyPrefix: text('key_prefix').notNull(),
  role: text('role', { enum: ['admin', 'operator', 'viewer'] }).notNull().default('operator'),
  allowedIps: text('allowed_ips', { mode: 'json' }).$type<string[]>(),
  allowedSessions: text('allowed_sessions', { mode: 'json' }).$type<string[]>(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  usageCount: integer('usage_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
```

**Per-Tenant D1** (one database per tenant — no `tenant_id` columns needed!):

```typescript
// packages/db/src/tenant/sessions.ts
import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  status: text('status', {
    enum: ['created', 'initializing', 'qr_ready', 'authenticating', 'ready', 'disconnected', 'failed'],
  }).notNull().default('created'),
  phone: text('phone'),
  pushName: text('push_name'),
  config: text('config', { mode: 'json' }).notNull().$type<Record<string, unknown>>().default({}),
  proxyUrl: text('proxy_url'),
  proxyType: text('proxy_type'),
  connectedAt: integer('connected_at', { mode: 'timestamp' }),
  lastActiveAt: integer('last_active_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('sessions_name_idx').on(table.name),
]);
```

```typescript
// packages/db/src/tenant/messages.ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sessions } from './sessions';

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  waMessageId: text('wa_message_id'),
  chatId: text('chat_id').notNull(),
  from: text('from_jid').notNull(),
  to: text('to_jid').notNull(),
  body: text('body'),
  type: text('type').notNull().default('text'),
  direction: text('direction', { enum: ['incoming', 'outgoing'] }).notNull().default('outgoing'),
  timestamp: integer('timestamp'), // Unix epoch seconds
  metadata: text('metadata', { mode: 'json' }),
  status: text('status', { enum: ['pending', 'sent', 'delivered', 'read', 'failed'] }).notNull().default('sent'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('messages_session_created_idx').on(table.sessionId, table.createdAt),
  index('messages_chat_idx').on(table.chatId),
  index('messages_wa_message_id_idx').on(table.waMessageId),
]);
```

```typescript
// packages/db/src/tenant/webhooks.ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sessions } from './sessions';

export const webhooks = sqliteTable('webhooks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  events: text('events', { mode: 'json' }).notNull().$type<string[]>().default(['message.received']),
  secret: text('secret'),
  headers: text('headers', { mode: 'json' }).notNull().$type<Record<string, string>>().default({}),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  retryCount: integer('retry_count').notNull().default(3),
  lastTriggeredAt: integer('last_triggered_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('webhooks_session_idx').on(table.sessionId),
  index('webhooks_active_idx').on(table.active),
]);
```

```typescript
// packages/db/src/tenant/audit-logs.ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  action: text('action').notNull(),
  severity: text('severity', { enum: ['info', 'warn', 'error'] }).notNull().default('info'),
  apiKeyId: text('api_key_id'),
  sessionId: text('session_id'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  method: text('method'),
  path: text('path'),
  statusCode: integer('status_code'),
  metadata: text('metadata', { mode: 'json' }),
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('audit_logs_action_idx').on(table.action),
  index('audit_logs_created_idx').on(table.createdAt),
  index('audit_logs_session_id_idx').on(table.sessionId),
]);
```

```typescript
// packages/db/src/tenant/contacts.ts
import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const contacts = sqliteTable('contacts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  waId: text('wa_id').notNull(),
  phone: text('phone').notNull(),
  name: text('name'),
  pushName: text('push_name'),
  tags: text('tags', { mode: 'json' }).notNull().$type<string[]>().default([]),
  metadata: text('metadata', { mode: 'json' }).notNull().$type<Record<string, unknown>>().default({}),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('contacts_wa_id_idx').on(table.waId),
  index('contacts_phone_idx').on(table.phone),
]);
```

```typescript
// packages/db/src/tenant/labels.ts
import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sessions } from './sessions';

export const labels = sqliteTable('labels', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  waLabelId: text('wa_label_id').notNull(),
  name: text('name').notNull(),
  color: text('color'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('labels_session_idx').on(table.sessionId),
  uniqueIndex('labels_session_wa_label_idx').on(table.sessionId, table.waLabelId),
]);
```

```typescript
// packages/db/src/tenant/conversations.ts
import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sessions } from './sessions';
import { contacts } from './contacts';

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  contactId: text('contact_id').notNull().references(() => contacts.id),
  chatId: text('chat_id').notNull(),
  lastMessageAt: integer('last_message_at', { mode: 'timestamp' }),
  unreadCount: integer('unread_count').notNull().default(0),
  status: text('status', { enum: ['open', 'closed', 'archived'] }).notNull().default('open'),
  assignedTo: text('assigned_to'),
  metadata: text('metadata', { mode: 'json' }).notNull().$type<Record<string, unknown>>().default({}),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
  index('conversations_session_idx').on(table.sessionId),
  index('conversations_contact_idx').on(table.contactId),
  index('conversations_status_idx').on(table.status),
  index('conversations_last_msg_idx').on(table.lastMessageAt),
  uniqueIndex('conversations_chat_id_idx').on(table.sessionId, table.chatId),
]);
```

### 1.2 Database-Per-Tenant Query Patterns

```typescript
// packages/db/src/client.ts
import { drizzle } from 'drizzle-orm/d1';
import * as tenantSchema from './tenant';
import * as controlSchema from './control-plane';

// Control Plane DB — global auth/tenant resolution
export function createControlDb(d1: D1Database) {
  return drizzle(d1, { schema: controlSchema });
}

// Tenant DB — each tenant gets their own D1 instance
export function createTenantDb(d1: D1Database) {
  return drizzle(d1, { schema: tenantSchema });
}

// Resolve tenant DB binding at request time
export async function getTenantDb(env: Env, tenantId: string): Promise<ReturnType<typeof createTenantDb>> {
  // In production, the Worker uses the D1 binding dispatched by the platform
  // based on the tenant's d1_database_id from the control plane
  const controlDb = createControlDb(env.CONTROL_DB);
  const [tenant] = await controlDb
    .select()
    .from(controlSchema.tenants)
    .where(eq(controlSchema.tenants.id, tenantId))
    .limit(1);

  if (!tenant?.d1DatabaseId) throw new Error('Tenant DB not provisioned');

  // D1 binding resolved via dynamic dispatch (CF Workers for Platforms)
  const tenantD1 = env.TENANT_DB; // Bound at wrangler.toml or dispatched
  return createTenantDb(tenantD1);
}
```

**Key advantage:** No `tenantId` filtering in any query. Physical isolation means every query
is automatically scoped to the correct tenant:

```typescript
// Simple queries — no WHERE tenant_id = ? needed!
async function listSessions(db: ReturnType<typeof createTenantDb>) {
  return db.select().from(tenantSchema.sessions);
}

async function getMessages(db: ReturnType<typeof createTenantDb>, sessionId: string, opts: { limit?: number; cursor?: string }) {
  const limit = opts.limit ?? 50;
  return db
    .select()
    .from(tenantSchema.messages)
    .where(and(
      eq(tenantSchema.messages.sessionId, sessionId),
      opts.cursor ? sql`${tenantSchema.messages.created_at} < ${opts.cursor}` : undefined,
    ))
    .orderBy(desc(tenantSchema.messages.createdAt))
    .limit(limit);
}

// Upsert contact on incoming message
async function upsertContact(db: ReturnType<typeof createTenantDb>, data: { waId: string; phone: string; pushName?: string }) {
  return db
    .insert(tenantSchema.contacts)
    .values({ waId: data.waId, phone: data.phone, pushName: data.pushName })
    .onConflictDoUpdate({
      target: [tenantSchema.contacts.waId],
      set: { pushName: data.pushName, updatedAt: new Date() },
    })
    .returning();
}
```

### 1.3 Migration Strategy: SQLite/TypeORM → D1/Drizzle

**Phase 1: Schema Generation**
```bash
# Generate Drizzle migration files from schema definitions
bunx drizzle-kit generate --dialect sqlite --schema ./packages/db/src/tenant
bunx drizzle-kit generate --dialect sqlite --schema ./packages/db/src/control-plane
# Apply to D1 (local dev)
wrangler d1 migrations apply CONTROL_DB --local
wrangler d1 migrations apply TENANT_DB --local
```

**Phase 2: Data Export (from existing OpenWA)**
```bash
# Use existing export endpoint
curl -s 'http://localhost:2785/api/infra/export-data' \
  -H 'X-API-Key: YOUR_KEY' > legacy-data.json
```

**Phase 3: Transform & Import**
```typescript
// scripts/migrate-to-d1.ts
import { createControlDb, createTenantDb } from '@openwa/db';

const controlDb = createControlDb(env.CONTROL_DB);

// 1. Create default tenant in control plane
const DEFAULT_TENANT_ID = crypto.randomUUID();
await controlDb.insert(tenants).values({
  id: DEFAULT_TENANT_ID,
  name: 'Migrated',
  slug: 'default',
  plan: 'starter',
  maxSessions: 10,
  d1DatabaseId: env.TENANT_DB_ID,
});

// 2. Import sessions into tenant DB (no tenantId needed!)
const tenantDb = createTenantDb(env.TENANT_DB);
for (const session of legacyData.sessions) {
  await tenantDb.insert(sessions).values({
    id: session.id,
    name: session.name,
    status: session.status,
    phone: session.phone,
    pushName: session.pushName,
  });
}

// 3. Batch-import messages
const BATCH_SIZE = 500; // D1 batch limit
for (let i = 0; i < legacyData.messages.length; i += BATCH_SIZE) {
  const batch = legacyData.messages.slice(i, i + BATCH_SIZE).map(msg => ({
    id: msg.id,
    sessionId: msg.sessionId,
    waMessageId: msg.waMessageId,
    chatId: msg.chatId,
    from: msg.from,
    to: msg.to,
    body: msg.body,
    type: msg.type,
    direction: msg.direction,
    timestamp: msg.timestamp,
    status: msg.status,
  }));
  await tenantDb.insert(messages).values(batch);
}

// 4. Migrate webhooks, contacts, labels similarly
```

**Phase 4: Verify & Cutover**
- Run integrity checks: row counts, FK consistency
- Deploy Workers with D1 bindings
- Keep legacy DB read-only for 7 days as rollback

### 1.4 Index Design for Scale

| Table | Index | Purpose | Type |
|-------|-------|---------|------|
| `sessions` | `(name) UNIQUE` | Name uniqueness per tenant DB | B-tree |
| `messages` | `(session_id, created_at DESC)` | Paginated message feed | B-tree |
| `messages` | `(chat_id)` | Chat filtering | B-tree |
| `messages` | `(wa_message_id)` | Dedup incoming messages | B-tree |
| `webhooks` | `(session_id)` | Lookup active webhooks | B-tree |
| `contacts` | `(wa_id) UNIQUE` | Contact lookup/upsert | B-tree |
| `conversations` | `(session_id, chat_id) UNIQUE` | Conversation dedup | B-tree |
| `conversations` | `(last_message_at DESC)` | Inbox sorting | B-tree |
| `audit_logs` | `(created_at DESC)` | Paginated audit trail | B-tree |
| `api_keys` | `(key_hash) UNIQUE` | Auth lookup (control plane, global) | B-tree |

**No partitioning or RLS needed** — key advantages of DB-per-tenant:
- Each tenant DB is max 10GB (sufficient for most use cases)
- SQLite's single-writer model is fine because each tenant DB handles only that tenant's traffic
- No RLS complexity — physical isolation is stronger than any policy
- Cross-tenant data leaks are architecturally impossible

**TTL/Archival for high-volume tenants:**
```typescript
// Scheduled cleanup (via DO Alarm or Cron Trigger)
async function cleanOldMessages(tenantDb: ReturnType<typeof createTenantDb>, retentionDays: number) {
  const cutoff = Date.now() - retentionDays * 86400 * 1000;
  await tenantDb.delete(messages).where(lt(messages.createdAt, new Date(cutoff)));
}
```

> **Note:** If a tenant approaches 10GB, implement message archival to R2 (cold storage) with on-demand retrieval.

---

## 2. NestJS → Elysia Migration

### 2.1 Pattern Mapping

| NestJS Pattern | Elysia Equivalent |
|----------------|-------------------|
| `@Controller('sessions')` | `new Elysia({ prefix: '/sessions' })` |
| `@Injectable()` Service | Plain class or function (DI via constructor/derive) |
| `@UseGuards(AuthGuard)` | `.derive()` or `.onBeforeHandle()` |
| `@UsePipes(ValidationPipe)` | `.guard({ body: t.Object({...}) })` (TypeBox) |
| `@UseInterceptors()` | `.onAfterHandle()` / `.mapResponse()` |
| `@Module({ imports, providers })` | `app.use(plugin)` composition |
| NestJS Exception Filters | `.onError()` handler |
| `ConfigService` | `env` bindings (Cloudflare Worker env) |

### 2.2 Large API Structure (50+ endpoints)

```
workers/
  api/
    src/
      index.ts              # Main Elysia app
      plugins/
        auth.ts             # Auth derive plugin
        tenant.ts           # Tenant resolution plugin
        rateLimit.ts        # Rate limiting plugin
        errors.ts           # Error formatting plugin
      routes/
        sessions.ts         # /api/sessions/*
        messages.ts         # /api/messages/*
        webhooks.ts         # /api/webhooks/*
        contacts.ts         # /api/contacts/*
        conversations.ts    # /api/conversations/*
        labels.ts           # /api/labels/*
        groups.ts           # /api/groups/*
        auth.ts             # /api/auth/*
        stats.ts            # /api/stats/*
        audit.ts            # /api/audit/*
        settings.ts         # /api/settings/*
        health.ts           # /api/health
      services/
        session.service.ts
        message.service.ts
        webhook.service.ts
      types/
        env.ts              # Worker Env bindings
        shared.ts           # Shared response types
```

### 2.3 Core App Assembly

```typescript
// workers/api/src/index.ts
import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { errorPlugin } from './plugins/errors';
import { authPlugin } from './plugins/auth';
import { tenantPlugin } from './plugins/tenant';
import { rateLimitPlugin } from './plugins/rateLimit';
import { sessionsRoutes } from './routes/sessions';
import { messagesRoutes } from './routes/messages';
import { webhooksRoutes } from './routes/webhooks';
import { contactsRoutes } from './routes/contacts';
import { healthRoutes } from './routes/health';
import type { Env } from './types/env';

const app = new Elysia()
  .use(cors())
  .use(swagger({ path: '/docs' }))
  .use(errorPlugin)
  .use(healthRoutes)
  // Protected routes — middleware ordering: auth → tenant → rate-limit → validate → handler
  .group('/api', (app) =>
    app
      .use(authPlugin)      // Validates API key, sets apiKey in context
      .use(tenantPlugin)    // Resolves tenant from apiKey, sets tenant in context
      .use(rateLimitPlugin) // Enforces rate limits per tenant
      .use(sessionsRoutes)
      .use(messagesRoutes)
      .use(webhooksRoutes)
      .use(contactsRoutes)
  );

export type App = typeof app;

export default {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) => {
    // Inject env into Elysia's store for access in plugins
    return app.decorate('env', env).decorate('ctx', ctx).handle(req);
  },
};
```

### 2.4 Auth Plugin (replaces NestJS Guard)

```typescript
// workers/api/src/plugins/auth.ts
import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';
import { apiKeys } from '@openwa/db/control-plane';
import { createControlDb } from '@openwa/db';
import type { Env } from '../types/env';

export const authPlugin = new Elysia({ name: 'auth' })
  .derive({ as: 'scoped' }, async ({ headers, store }) => {
    const env = store.env as Env;
    const apiKeyRaw = headers['x-api-key'];

    if (!apiKeyRaw) {
      throw new AuthError('API key required', 401);
    }

    // Check KV cache first
    const keyHash = await hashApiKey(apiKeyRaw);
    const cached = await env.KV.get(`auth:${keyHash}`, { type: 'json' });
    if (cached) {
      return { apiKey: cached as ApiKeyContext };
    }

    // Cache miss: query Control Plane D1
    const controlDb = createControlDb(env.CONTROL_DB);
    const [key] = await controlDb
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1);

    if (!key || !key.isActive) {
      throw new AuthError('Invalid or inactive API key', 401);
    }

    if (key.expiresAt && key.expiresAt < new Date()) {
      throw new AuthError('API key expired', 401);
    }

    const context: ApiKeyContext = {
      id: key.id,
      tenantId: key.tenantId,
      role: key.role,
      allowedSessions: key.allowedSessions,
    };

    // Cache for 5 minutes
    await env.KV.put(`auth:${keyHash}`, JSON.stringify(context), { expirationTtl: 300 });

    return { apiKey: context };
  });

async function hashApiKey(raw: string): Promise<string> {
  const encoded = new TextEncoder().encode(raw);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

### 2.5 Tenant Plugin (replaces NestJS middleware)

```typescript
// workers/api/src/plugins/tenant.ts
import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';
import { tenants } from '@openwa/db/control-plane';
import { createControlDb, createTenantDb } from '@openwa/db';

export const tenantPlugin = new Elysia({ name: 'tenant' })
  .derive({ as: 'scoped' }, async ({ store, apiKey }) => {
    const env = store.env as Env;
    const controlDb = createControlDb(env.CONTROL_DB);

    const [tenant] = await controlDb
      .select()
      .from(tenants)
      .where(eq(tenants.id, apiKey.tenantId))
      .limit(1);

    if (!tenant) {
      throw new AuthError('Tenant not found', 403);
    }

    // Create tenant-scoped DB instance (DB-per-tenant — no filtering needed)
    const tenantDb = createTenantDb(env.TENANT_DB);

    return { tenant, tenantDb };
  });
```

### 2.6 Route Module Example

```typescript
// workers/api/src/routes/sessions.ts
import { Elysia, t } from 'elysia';
import { sessions } from '@openwa/db/tenant';
import { eq } from 'drizzle-orm';

export const sessionsRoutes = new Elysia({ prefix: '/sessions' })
  .post('/', async ({ tenantDb, tenant, body }) => {
    // Check tenant session limit
    const existing = await tenantDb.select().from(sessions);
    if (existing.length >= tenant.maxSessions) {
      throw new ApiError('Session limit reached for your plan', 403);
    }

    const [session] = await tenantDb.insert(sessions).values(body).returning();
    return { data: session };
  }, {
    body: t.Object({
      name: t.String({ minLength: 1, maxLength: 100 }),
      config: t.Optional(t.Record(t.String(), t.Unknown())),
      proxyUrl: t.Optional(t.String({ format: 'uri' })),
    }),
  })

  .get('/', async ({ tenantDb }) => {
    const allSessions = await tenantDb.select().from(sessions);
    return { data: allSessions };
  })

  .get('/:id', async ({ tenantDb, params }) => {
    const [session] = await tenantDb.select().from(sessions).where(eq(sessions.id, params.id)).limit(1);
    if (!session) throw new ApiError('Session not found', 404);
    return { data: session };
  }, {
    params: t.Object({ id: t.String() }),
  })

  .delete('/:id', async ({ tenantDb, params, env }) => {
    const [session] = await tenantDb.select().from(sessions).where(eq(sessions.id, params.id)).limit(1);
    if (!session) throw new ApiError('Session not found', 404);

    // Send destroy command to DO
    const doId = env.WA_SESSION_DO.idFromName(session.id);
    const stub = env.WA_SESSION_DO.get(doId);
    await stub.fetch(new Request('http://do/destroy', { method: 'POST' }));

    await tenantDb.delete(sessions).where(eq(sessions.id, params.id));
    return new Response(null, { status: 204 });
  }, {
    params: t.Object({ id: t.String() }),
  });
```

### 2.7 Eden Treaty Type Export

```typescript
// workers/api/src/index.ts — export the App type
export type App = typeof app;

// Client usage (dashboard or SDK):
// packages/sdk/src/client.ts
import { treaty } from '@elysiajs/eden';
import type { App } from '@openwa/api'; // Import type only

const client = treaty<App>('https://api.openwa.dev');

// Fully typed — IDE autocomplete for all routes
const { data, error } = await client.api.sessions.get();
const { data: session } = await client.api.sessions({ id: 'uuid' }).get();
const { data: created } = await client.api.sessions.post({ name: 'my-session' });
```

### 2.8 Error Handling Plugin

```typescript
// workers/api/src/plugins/errors.ts
import { Elysia } from 'elysia';

class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
  ) {
    super(message);
  }
}

export const errorPlugin = new Elysia({ name: 'errors' })
  .error({ API_ERROR: ApiError })
  .onError(({ error, code, set }) => {
    // Consistent error envelope
    if (error instanceof ApiError) {
      set.status = error.statusCode;
      return {
        success: false,
        error: {
          code: error.code ?? 'ERROR',
          message: error.message,
          statusCode: error.statusCode,
        },
      };
    }

    // Validation errors from TypeBox
    if (code === 'VALIDATION') {
      set.status = 422;
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          statusCode: 422,
          details: error.all,
        },
      };
    }

    // Unhandled
    console.error('Unhandled error:', error);
    set.status = 500;
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        statusCode: 500,
      },
    };
  });
```

### 2.9 Middleware Ordering Guarantee

Elysia processes lifecycle hooks in registration order:

```
Request
  ↓ onBeforeHandle[0]: auth (validate API key)
  ↓ onBeforeHandle[1]: tenant (resolve tenant from key)
  ↓ onBeforeHandle[2]: rateLimit (check tenant quota)
  ↓ TypeBox validation (body/params/query schema)
  ↓ Handler (route logic)
  ↓ onAfterHandle: response wrapping
  ↓ Response
```

The `.use()` order determines execution order. The pattern above (auth → tenant → rateLimit → routes with validation) mirrors the NestJS Guard → Interceptor → Pipe → Controller flow.

---

## 3. BullMQ/Redis → CF Queues + KV

### 3.1 Webhook Delivery: BullMQ → CF Queues

**Current pattern (BullMQ):**
```typescript
// NestJS — webhook.processor.ts
@Processor('webhook-delivery')
class WebhookProcessor {
  @Process()
  async deliver(job: Job<WebhookPayload>) {
    const { url, payload, secret, retryCount } = job.data;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'X-Webhook-Signature': sign(payload, secret) },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }
}
```

**New pattern (CF Queues):**
```typescript
// workers/api/src/services/webhook.service.ts — Producer
export async function enqueueWebhook(
  env: Env,
  webhook: { url: string; secret: string | null; headers: Record<string, string> },
  event: { type: string; sessionId: string; payload: unknown },
) {
  const message = {
    webhookId: webhook.id,
    url: webhook.url,
    secret: webhook.secret,
    headers: webhook.headers,
    event,
    attempt: 0,
    maxAttempts: 5,
    enqueuedAt: Date.now(),
  };

  await env.WEBHOOK_QUEUE.send(message);
}

// workers/webhook-consumer/src/index.ts — Consumer
export default {
  async queue(batch: MessageBatch<WebhookMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const { url, secret, headers, event, attempt, maxAttempts } = msg.body;

      try {
        const body = JSON.stringify(event);
        const signature = secret
          ? await computeHmac(body, secret)
          : undefined;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
            ...(signature && { 'X-Webhook-Signature': signature }),
            'X-Webhook-Event': event.type,
            'X-Webhook-Attempt': String(attempt + 1),
          },
          body,
        });

        if (response.ok) {
          msg.ack(); // Success — remove from queue
        } else if (response.status >= 400 && response.status < 500) {
          // Client error — DLQ immediately (no retry)
          msg.ack();
          await env.WEBHOOK_DLQ.send({ ...msg.body, error: `HTTP ${response.status}` });
        } else {
          // Server error — retry with exponential backoff
          if (attempt + 1 >= maxAttempts) {
            msg.ack();
            await env.WEBHOOK_DLQ.send({ ...msg.body, error: `Max retries exceeded` });
          } else {
            const delay = Math.min(60 * 60, Math.pow(2, attempt) * 10); // 10s, 20s, 40s, 80s...
            msg.retry({ delaySeconds: delay });
          }
        }
      } catch (err) {
        // Network error — retry
        if (attempt + 1 >= maxAttempts) {
          msg.ack();
          await env.WEBHOOK_DLQ.send({ ...msg.body, error: String(err) });
        } else {
          msg.retry({ delaySeconds: Math.pow(2, attempt) * 10 });
        }
      }
    }
  },
};

async function computeHmac(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

**wrangler.toml for queue bindings:**
```toml
[[queues.producers]]
queue = "webhook-delivery"
binding = "WEBHOOK_QUEUE"

[[queues.producers]]
queue = "webhook-dlq"
binding = "WEBHOOK_DLQ"

[[queues.consumers]]
queue = "webhook-delivery"
max_batch_size = 50
max_batch_timeout = 5
max_retries = 0  # We handle retries manually with delaySeconds
```

### 3.2 Rate Limiting: Redis Sliding Window → KV/DO Approach

**Recommended: Hybrid approach**

```typescript
// workers/api/src/plugins/rateLimit.ts
import { Elysia } from 'elysia';

export const rateLimitPlugin = new Elysia({ name: 'rateLimit' })
  .derive({ as: 'scoped' }, async ({ store, tenant }) => {
    const env = store.env as Env;

    // Strategy 1: KV fixed-window (approximate, good enough for most)
    const window = Math.floor(Date.now() / 60000); // 1-minute window
    const key = `rl:${tenant.id}:${window}`;
    const current = parseInt(await env.KV.get(key) ?? '0', 10);

    const limit = getTenantLimit(tenant.plan); // e.g., free=60, starter=300, business=1000

    if (current >= limit) {
      throw new ApiError('Rate limit exceeded', 429);
    }

    // Increment (fire-and-forget, eventual consistency acceptable)
    await env.KV.put(key, String(current + 1), { expirationTtl: 120 });

    return {};
  });

// Strategy 2: DO-based strict rate limiting (for billing-critical paths)
export class RateLimiterDO extends DurableObject {
  private count = 0;
  private windowStart = 0;

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') ?? '100', 10);
    const now = Date.now();
    const windowMs = 60_000;

    if (now - this.windowStart > windowMs) {
      this.count = 0;
      this.windowStart = now;
    }

    this.count++;
    if (this.count > limit) {
      return new Response('Rate limited', { status: 429 });
    }

    return new Response('OK', {
      headers: {
        'X-RateLimit-Remaining': String(limit - this.count),
        'X-RateLimit-Reset': String(this.windowStart + windowMs),
      },
    });
  }
}
```

### 3.3 Session Caching: Redis → KV with TTL

```typescript
// Current: Redis session cache
// redis.set(`session:${id}:status`, JSON.stringify(status), 'EX', 30);

// New: KV with TTL
async function cacheSessionStatus(env: Env, sessionId: string, status: SessionStatus) {
  await env.KV.put(
    `session:${sessionId}:status`,
    JSON.stringify({ status, updatedAt: Date.now() }),
    { expirationTtl: 30 }, // 30-second TTL
  );
}

async function getSessionStatus(env: Env, sessionId: string): Promise<SessionStatus | null> {
  const cached = await env.KV.get(`session:${sessionId}:status`, { type: 'json' });
  return cached?.status ?? null;
}
```

### 3.4 Feature Gap Analysis

| BullMQ Feature | CF Queues Equivalent | Gap? |
|----------------|---------------------|------|
| Job queuing with retry | `Queue.send()` + manual retry via `delaySeconds` | ✅ Equivalent |
| Exponential backoff | `msg.retry({ delaySeconds })` | ✅ Equivalent |
| Dead letter queue | Separate DLQ Queue binding | ✅ Equivalent |
| Delayed jobs | `delaySeconds` (up to 24h) | ✅ Equivalent |
| Repeatable/cron jobs | **❌ Not available** — Use DO Alarms instead | Gap |
| Bull Board UI | **❌ No built-in UI** — Build custom via DLQ query + stats | Gap |
| Job priorities | **❌ Not available** — Use multiple queues (high/low) | Gap |
| Job progress tracking | **❌ Not available** — Track in D1 or KV | Gap |
| Concurrency control | `max_batch_size` + `max_concurrency` consumer settings | ✅ Different API |
| Rate limiting per queue | Consumer `max_batch_size` + `max_batch_timeout` | ⚠️ Approximate |

**Alternatives for gaps:**

- **Cron jobs**: DO Alarm API — schedule recurring work per-session
- **Bull Board UI**: Custom dashboard page querying audit_logs + DLQ contents
- **Job priorities**: Two queues (`webhook-priority`, `webhook-standard`)
- **Progress tracking**: Write progress to KV or D1, poll from dashboard

---

## 4. Socket.IO → Durable Object WebSocket

### 4.1 Current Socket.IO Pattern

From the existing [events.gateway.ts](src/modules/events/events.gateway.ts):
- Namespace: `/events`
- Auth: `x-api-key` header or `apiKey` query param on connect
- Subscription: Client sends `{ type: 'subscribe', sessionId, events }` → joins Socket.IO rooms
- Event broadcast: `server.to(room).emit('message', event)` — room = `session:{id}:{event}`
- Auto-reconnection: Socket.IO client handles reconnection + buffering

### 4.2 Durable Object WebSocket Architecture

```
┌──────────────────┐      ┌────────────────────────┐      ┌─────────────────────┐
│  Dashboard/SDK   │ WS   │  API Worker             │      │  Session DO         │
│  (Browser/Node)  │─────▶│  /ws/:sessionId         │─────▶│  WhatsAppSessionDO  │
│                  │◀─────│  (WebSocket upgrade)    │◀─────│  (Hibernation API)  │
└──────────────────┘      └────────────────────────┘      └─────────────────────┘
```

### 4.3 WebSocket Upgrade Handler (API Worker)

```typescript
// workers/api/src/routes/ws.ts
import { Elysia } from 'elysia';

export const wsRoutes = new Elysia({ prefix: '/ws' })
  .get('/:sessionId', async ({ params, headers, store }) => {
    const env = store.env as Env;

    // 1. Authenticate
    const apiKey = headers['x-api-key'] || new URL(req.url).searchParams.get('apiKey');
    if (!apiKey) {
      return new Response('API key required', { status: 401 });
    }
    const auth = await validateApiKey(env, apiKey);
    if (!auth) {
      return new Response('Invalid API key', { status: 401 });
    }

    // 2. Verify session belongs to tenant
    const session = await getSession(env, auth.tenantId, params.sessionId);
    if (!session) {
      return new Response('Session not found', { status: 404 });
    }

    // 3. Forward WebSocket to the Session's Durable Object
    const doId = env.WA_SESSION_DO.idFromName(params.sessionId);
    const stub = env.WA_SESSION_DO.get(doId);

    // Pass auth context as headers to the DO
    const doReq = new Request(`http://do/websocket`, {
      headers: {
        Upgrade: 'websocket',
        'X-Tenant-Id': auth.tenantId,
        'X-Api-Key-Id': auth.id,
        'X-Api-Key-Role': auth.role,
      },
    });

    return stub.fetch(doReq);
  });
```

### 4.4 Durable Object WebSocket Handler (Hibernation API)

```typescript
// workers/wa-session/src/do.ts
import { DurableObject } from 'cloudflare:workers';

interface ClientMetadata {
  tenantId: string;
  apiKeyId: string;
  role: string;
  subscribedEvents: Set<string>;
}

export class WhatsAppSessionDO extends DurableObject {
  private clients: Map<WebSocket, ClientMetadata> = new Map();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/websocket') {
      return this.handleWebSocketUpgrade(request);
    }

    // ... other RPC endpoints (sendMessage, getStatus, etc.)
  }

  private handleWebSocketUpgrade(request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Store auth context from Worker headers
    const metadata: ClientMetadata = {
      tenantId: request.headers.get('X-Tenant-Id')!,
      apiKeyId: request.headers.get('X-Api-Key-Id')!,
      role: request.headers.get('X-Api-Key-Role')!,
      subscribedEvents: new Set(),
    };

    // Accept with Hibernation API — DO can sleep while WS stays open
    this.ctx.acceptWebSocket(server, [metadata.tenantId]);
    this.clients.set(server, metadata);

    return new Response(null, { status: 101, webSocket: client });
  }

  // Hibernation API handler — called when WS message arrives (even after hibernation)
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const metadata = this.clients.get(ws);
    if (!metadata) {
      ws.close(1008, 'Unknown client');
      return;
    }

    const msg = JSON.parse(message as string);

    switch (msg.type) {
      case 'subscribe': {
        // Topic-based subscription (replaces Socket.IO rooms)
        const events = msg.events as string[];
        for (const event of events) {
          metadata.subscribedEvents.add(event);
        }
        ws.send(JSON.stringify({
          type: 'subscribed',
          sessionId: this.ctx.id.toString(),
          events,
          timestamp: new Date().toISOString(),
        }));
        break;
      }

      case 'unsubscribe': {
        metadata.subscribedEvents.clear();
        ws.send(JSON.stringify({ type: 'unsubscribed', timestamp: new Date().toISOString() }));
        break;
      }

      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        break;
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    this.clients.delete(ws);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    this.clients.delete(ws);
  }

  // Broadcast WhatsApp events to subscribed clients (replaces Socket.IO room emit)
  broadcastEvent(eventType: string, payload: unknown): void {
    const message = JSON.stringify({
      type: 'event',
      event: eventType,
      data: payload,
      timestamp: new Date().toISOString(),
    });

    for (const [ws, metadata] of this.clients) {
      if (metadata.subscribedEvents.has('*') || metadata.subscribedEvents.has(eventType)) {
        try {
          ws.send(message);
        } catch {
          this.clients.delete(ws);
        }
      }
    }
  }
}
```

### 4.5 Client-Side Reconnection

Socket.IO provides automatic reconnection with buffering. With raw WebSocket to DOs, the client must implement this:

```typescript
// packages/sdk/src/realtime.ts
export class OpenWARealtimeClient {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private maxReconnectAttempts = 10;
  private subscriptions: { sessionId: string; events: string[] }[] = [];
  private listeners = new Map<string, Set<(data: unknown) => void>>();

  constructor(
    private baseUrl: string,
    private apiKey: string,
    private sessionId: string,
  ) {}

  connect(): void {
    const url = `${this.baseUrl}/ws/${this.sessionId}?apiKey=${this.apiKey}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      // Re-subscribe on reconnect
      for (const sub of this.subscriptions) {
        this.ws!.send(JSON.stringify({ type: 'subscribe', ...sub }));
      }
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'event') {
        const handlers = this.listeners.get(msg.event) ?? this.listeners.get('*');
        handlers?.forEach(fn => fn(msg.data));
      }
    };

    this.ws.onclose = (event) => {
      if (event.code !== 1000) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  subscribe(events: string[]): void {
    this.subscriptions = [{ sessionId: this.sessionId, events }];
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', sessionId: this.sessionId, events }));
    }
  }

  on(event: string, handler: (data: unknown) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempt >= this.maxReconnectAttempts) return;
    const delay = Math.min(30000, Math.pow(2, this.reconnectAttempt) * 1000);
    this.reconnectAttempt++;
    setTimeout(() => this.connect(), delay);
  }

  disconnect(): void {
    this.ws?.close(1000, 'Client disconnect');
    this.ws = null;
  }
}
```

### 4.6 Key Differences Summary

| Feature | Socket.IO | DO WebSocket |
|---------|-----------|-------------|
| Reconnection | Built-in (client library) | Manual (implement in SDK) |
| Rooms/Topics | `socket.join(room)` | Per-client subscription Set in DO memory |
| Broadcast | `server.to(room).emit()` | Iterate `this.clients` Map |
| Auth | Once on connect handshake | Once on WebSocket upgrade (Worker layer) |
| Scale | Requires Redis adapter for multi-node | DO is single-instance per session (natural) |
| Persistence across hibernation | N/A (server always running) | Clients survive DO sleep via Hibernation API |
| Binary messages | Supported | Supported (ArrayBuffer) |
| Message buffering (offline client) | Built-in | Must implement (KV/DO storage buffer) |
| Namespace isolation | Socket.IO namespaces | One DO per session = natural isolation |

### 4.7 Migration Advantage

The Socket.IO pattern uses "one gateway, many rooms" — all sessions share a single WebSocket server. The DO pattern uses "one DO per session" — which is actually a **better architectural fit** for OpenWA because:

1. Each WhatsApp session is already a separate engine instance
2. The DO naturally co-locates the WebSocket consumers with the WA engine that produces events
3. Zero-hop event delivery: WA message arrives → DO processes → broadcasts to connected clients (no Redis pub/sub hop)
4. Hibernation eliminates idle-session cost (Socket.IO server runs 24/7 regardless)

---

## 5. Summary & Migration Order

| Component | Complexity | Risk | Priority |
|-----------|:----------:|:----:|:--------:|
| Schema → Drizzle (D1 sqlite-core) | Medium | Low | P0 (Epic E1-S05) |
| NestJS → Elysia routes | High | Medium | P0 (Epic E4) |
| BullMQ → CF Queues | Low | Low | P0 (Epic E6) |
| Socket.IO → DO WS | Medium | Medium | P0 (Epic E3-S05) |
| Redis cache → KV | Low | Low | P0 (E5) |
| Data migration script | Medium | Medium | One-time (launch) |

**Critical path:** Drizzle schema (D1 sqlite-core) → Elysia API scaffold → DO WebSocket integration → Queue consumer.

The schema is the foundation everything else depends on. Start there (Epic E1-S05), validate with D1 local dev (`wrangler d1 migrations apply --local`), then build the API layer on top.
