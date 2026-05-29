import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const id = () => text('id').primaryKey();
const ts = (name: string) =>
  integer(name, { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date());
const optionalTs = (name: string) => integer(name, { mode: 'timestamp_ms' });

// -------------------- users --------------------
export const users = sqliteTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    passwordHash: text('password_hash'),
    emailVerifiedAt: optionalTs('email_verified_at'),
    lastLoginAt: optionalTs('last_login_at'),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
  }),
);

// -------------------- tenants --------------------
export const tenants = sqliteTable(
  'tenants',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    plan: text('plan', {
      enum: ['free', 'pro', 'business', 'enterprise'],
    })
      .notNull()
      .default('free'),
    status: text('status', {
      enum: ['active', 'suspended', 'frozen', 'deleted'],
    })
      .notNull()
      .default('active'),
    d1DatabaseId: text('d1_database_id'),
    stripeCustomerId: text('stripe_customer_id'),
    settings: text('settings', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    slugIdx: uniqueIndex('tenants_slug_idx').on(t.slug),
    statusIdx: index('tenants_status_idx').on(t.status),
  }),
);

// -------------------- tenant members --------------------
export const tenantMembers = sqliteTable(
  'tenant_members',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'admin', 'developer', 'viewer'] })
      .notNull()
      .default('viewer'),
    invitedByUserId: text('invited_by_user_id').references(() => users.id),
    joinedAt: ts('joined_at'),
  },
  (t) => ({
    pk: uniqueIndex('tenant_members_pk').on(t.tenantId, t.userId),
    userIdx: index('tenant_members_user_idx').on(t.userId),
  }),
);

// -------------------- sessions registry --------------------
// Authoritative list of WhatsApp sessions; actual state lives in the DO and per-tenant DB.
export const sessions = sqliteTable(
  'sessions',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: text('status', {
      enum: [
        'pending',
        'qr_required',
        'pairing',
        'connecting',
        'connected',
        'disconnected',
        'logged_out',
        'failed',
      ],
    })
      .notNull()
      .default('pending'),
    phoneNumber: text('phone_number'),
    pushName: text('push_name'),
    proxyUrl: text('proxy_url'),
    doInstanceId: text('do_instance_id'),
    lastConnectedAt: optionalTs('last_connected_at'),
    lastDisconnectedAt: optionalTs('last_disconnected_at'),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    tenantNameIdx: uniqueIndex('sessions_tenant_name_idx').on(t.tenantId, t.name),
    tenantIdx: index('sessions_tenant_idx').on(t.tenantId),
    statusIdx: index('sessions_status_idx').on(t.status),
  }),
);

// -------------------- api keys --------------------
export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    hashedKey: text('hashed_key').notNull(),
    role: text('role', { enum: ['admin', 'read_write', 'read_only'] })
      .notNull()
      .default('read_only'),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    lastUsedAt: optionalTs('last_used_at'),
    expiresAt: optionalTs('expires_at'),
    revokedAt: optionalTs('revoked_at'),
    createdAt: ts('created_at'),
  },
  (t) => ({
    hashIdx: uniqueIndex('api_keys_hash_idx').on(t.hashedKey),
    prefixIdx: index('api_keys_prefix_idx').on(t.prefix),
    tenantIdx: index('api_keys_tenant_idx').on(t.tenantId),
  }),
);

// -------------------- webhooks --------------------
export const webhooks = sqliteTable(
  'webhooks',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    events: text('events', { mode: 'json' }).$type<string[]>().notNull(),
    secret: text('secret').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    description: text('description'),
    lastDeliveryAt: optionalTs('last_delivery_at'),
    lastDeliveryStatus: integer('last_delivery_status'),
    failureCount: integer('failure_count').notNull().default(0),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    tenantIdx: index('webhooks_tenant_idx').on(t.tenantId),
    sessionIdx: index('webhooks_session_idx').on(t.sessionId),
  }),
);

// -------------------- audit log --------------------
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: id(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id'),
    apiKeyId: text('api_key_id'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: ts('created_at'),
  },
  (t) => ({
    tenantTimeIdx: index('audit_tenant_time_idx').on(t.tenantId, t.createdAt),
    resourceIdx: index('audit_resource_idx').on(t.resourceType, t.resourceId),
    actionIdx: index('audit_action_idx').on(t.action),
  }),
);

// -------------------- usage counters --------------------
export const usageCounters = sqliteTable(
  'usage_counters',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    period: text('period').notNull(), // e.g. '2026-06' or '2026-06-15'
    metric: text('metric', {
      enum: ['messages_sent', 'messages_received', 'api_calls', 'media_bytes', 'active_sessions'],
    }).notNull(),
    value: integer('value').notNull().default(0),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    pk: uniqueIndex('usage_counters_pk').on(t.tenantId, t.period, t.metric),
    periodIdx: index('usage_counters_period_idx').on(t.period),
  }),
);

// -------------------- relations --------------------
export const tenantsRelations = relations(tenants, ({ many }) => ({
  members: many(tenantMembers),
  sessions: many(sessions),
  apiKeys: many(apiKeys),
  webhooks: many(webhooks),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(tenantMembers),
}));

export const tenantMembersRelations = relations(tenantMembers, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantMembers.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [tenantMembers.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  tenant: one(tenants, { fields: [sessions.tenantId], references: [tenants.id] }),
  webhooks: many(webhooks),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  tenant: one(tenants, { fields: [apiKeys.tenantId], references: [tenants.id] }),
  createdBy: one(users, { fields: [apiKeys.createdByUserId], references: [users.id] }),
}));

export const webhooksRelations = relations(webhooks, ({ one }) => ({
  tenant: one(tenants, { fields: [webhooks.tenantId], references: [tenants.id] }),
  session: one(sessions, { fields: [webhooks.sessionId], references: [sessions.id] }),
}));

// -------------------- inferred types --------------------
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type TenantMember = typeof tenantMembers.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type AuditLogRow = typeof auditLog.$inferSelect;
export type NewAuditLogRow = typeof auditLog.$inferInsert;
export type UsageCounter = typeof usageCounters.$inferSelect;
