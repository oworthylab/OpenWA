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

// -------------------- CRM contacts (Sprint 7, US-051) --------------------
// First-class CRM contacts (distinct from the per-session WhatsApp contact
// table in tenant.ts). Created by manual entry, import, or sync from Mart.
export const crmContacts = sqliteTable(
  'crm_contacts',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    phoneNumber: text('phone_number').notNull(), // E.164
    name: text('name'),
    email: text('email'),
    waJid: text('wa_jid'),
    /** Free-form attributes: shipping address, lifetime value, etc. */
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
    /** Sourced from Mart customer.created. Null when manually entered. */
    martCustomerId: text('mart_customer_id'),
    /** Set when the contact has sent STOP / UNSUBSCRIBE on WhatsApp. */
    optedOutAt: optionalTs('opted_out_at'),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    tenantPhoneIdx: uniqueIndex('crm_contacts_tenant_phone_idx').on(t.tenantId, t.phoneNumber),
    tenantIdx: index('crm_contacts_tenant_idx').on(t.tenantId),
    martCustomerIdx: index('crm_contacts_mart_customer_idx').on(t.tenantId, t.martCustomerId),
  }),
);

export const crmTags = sqliteTable(
  'crm_tags',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#1f6feb'),
    createdAt: ts('created_at'),
  },
  (t) => ({
    tenantNameIdx: uniqueIndex('crm_tags_tenant_name_idx').on(t.tenantId, t.name),
  }),
);

export const crmContactTags = sqliteTable(
  'crm_contact_tags',
  {
    contactId: text('contact_id')
      .notNull()
      .references(() => crmContacts.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => crmTags.id, { onDelete: 'cascade' }),
    createdAt: ts('created_at'),
  },
  (t) => ({
    pk: uniqueIndex('crm_contact_tags_pk').on(t.contactId, t.tagId),
    tagIdx: index('crm_contact_tags_tag_idx').on(t.tagId),
  }),
);

// -------------------- conversations (Sprint 7, US-052) --------------------
export const conversations = sqliteTable(
  'conversations',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    contactId: text('contact_id')
      .notNull()
      .references(() => crmContacts.id, { onDelete: 'cascade' }),
    sessionId: text('session_id'),
    status: text('status', { enum: ['open', 'pending', 'resolved', 'closed'] })
      .notNull()
      .default('open'),
    /** User id (operator). Null when unassigned. */
    assigneeUserId: text('assignee_user_id'),
    lastMessageAt: optionalTs('last_message_at'),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    tenantStatusIdx: index('conversations_tenant_status_idx').on(t.tenantId, t.status),
    tenantContactIdx: uniqueIndex('conversations_tenant_contact_idx').on(t.tenantId, t.contactId),
    assigneeIdx: index('conversations_assignee_idx').on(t.assigneeUserId),
  }),
);

// -------------------- message templates (Sprint 7, US-054) --------------------
export const messageTemplates = sqliteTable(
  'message_templates',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    body: text('body').notNull(),
    /** Detected `{{var}}` placeholders, cached at write time. */
    variables: text('variables', { mode: 'json' }).$type<string[]>().notNull(),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    tenantNameIdx: uniqueIndex('message_templates_tenant_name_idx').on(t.tenantId, t.name),
  }),
);

// -------------------- Mart integration (Sprint 7, US-053) --------------------
export const martIntegrations = sqliteTable(
  'mart_integrations',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    storeUrl: text('store_url').notNull(),
    /** sha256(shared secret) — never stored in plaintext. */
    secretHash: text('secret_hash').notNull(),
    status: text('status', { enum: ['active', 'pending', 'revoked'] })
      .notNull()
      .default('active'),
    /** Free-form attributes returned by the Mart verify endpoint. */
    storeMetadata: text('store_metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
    lastSyncAt: optionalTs('last_sync_at'),
    linkedAt: ts('linked_at'),
    revokedAt: optionalTs('revoked_at'),
  },
  (t) => ({
    tenantIdx: uniqueIndex('mart_integrations_tenant_idx').on(t.tenantId),
  }),
);

// -------------------- abandoned carts (Sprint 7, US-055) --------------------
export const abandonedCarts = sqliteTable(
  'abandoned_carts',
  {
    id: id(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    contactId: text('contact_id').references(() => crmContacts.id, { onDelete: 'set null' }),
    cartId: text('cart_id').notNull(),
    totalAmountCents: integer('total_amount_cents').notNull().default(0),
    currency: text('currency').notNull().default('USD'),
    abandonedAt: ts('abandoned_at'),
    reminderSentAt: optionalTs('reminder_sent_at'),
    recoveredAt: optionalTs('recovered_at'),
    createdAt: ts('created_at'),
  },
  (t) => ({
    tenantCartIdx: uniqueIndex('abandoned_carts_tenant_cart_idx').on(t.tenantId, t.cartId),
    tenantIdx: index('abandoned_carts_tenant_idx').on(t.tenantId),
  }),
);

// -------------------- CRM relations --------------------
export const crmContactsRelations = relations(crmContacts, ({ one, many }) => ({
  tenant: one(tenants, { fields: [crmContacts.tenantId], references: [tenants.id] }),
  tags: many(crmContactTags),
  conversations: many(conversations),
}));

export const crmTagsRelations = relations(crmTags, ({ many }) => ({
  contacts: many(crmContactTags),
}));

export const crmContactTagsRelations = relations(crmContactTags, ({ one }) => ({
  contact: one(crmContacts, {
    fields: [crmContactTags.contactId],
    references: [crmContacts.id],
  }),
  tag: one(crmTags, { fields: [crmContactTags.tagId], references: [crmTags.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one }) => ({
  contact: one(crmContacts, {
    fields: [conversations.contactId],
    references: [crmContacts.id],
  }),
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
export type CrmContact = typeof crmContacts.$inferSelect;
export type NewCrmContact = typeof crmContacts.$inferInsert;
export type CrmTag = typeof crmTags.$inferSelect;
export type NewCrmTag = typeof crmTags.$inferInsert;
export type CrmContactTag = typeof crmContactTags.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type NewMessageTemplate = typeof messageTemplates.$inferInsert;
export type MartIntegration = typeof martIntegrations.$inferSelect;
export type NewMartIntegration = typeof martIntegrations.$inferInsert;
export type AbandonedCart = typeof abandonedCarts.$inferSelect;
export type NewAbandonedCart = typeof abandonedCarts.$inferInsert;
