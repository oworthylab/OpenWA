import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const id = () => text('id').primaryKey();
const ts = (name: string) =>
  integer(name, { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date());
const optionalTs = (name: string) => integer(name, { mode: 'timestamp_ms' });

// -------------------- contacts --------------------
export const contacts = sqliteTable(
  'contacts',
  {
    id: id(),
    sessionId: text('session_id').notNull(),
    jid: text('jid').notNull(),
    phoneNumber: text('phone_number'),
    type: text('type', { enum: ['person', 'business', 'group', 'unknown'] })
      .notNull()
      .default('unknown'),
    pushName: text('push_name'),
    name: text('name'),
    notify: text('notify'),
    isBusiness: integer('is_business', { mode: 'boolean' }).notNull().default(false),
    isBlocked: integer('is_blocked', { mode: 'boolean' }).notNull().default(false),
    profilePictureUrl: text('profile_picture_url'),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    sessionJidIdx: uniqueIndex('contacts_session_jid_idx').on(t.sessionId, t.jid),
    phoneIdx: index('contacts_phone_idx').on(t.phoneNumber),
    blockedIdx: index('contacts_blocked_idx').on(t.isBlocked),
  }),
);

// -------------------- groups --------------------
export const groups = sqliteTable(
  'groups',
  {
    id: id(),
    sessionId: text('session_id').notNull(),
    jid: text('jid').notNull(),
    subject: text('subject').notNull(),
    description: text('description'),
    ownerJid: text('owner_jid'),
    participantCount: integer('participant_count').notNull().default(0),
    isAnnouncementOnly: integer('is_announcement_only', { mode: 'boolean' })
      .notNull()
      .default(false),
    isRestricted: integer('is_restricted', { mode: 'boolean' }).notNull().default(false),
    inviteCode: text('invite_code'),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => ({
    sessionJidIdx: uniqueIndex('groups_session_jid_idx').on(t.sessionId, t.jid),
  }),
);

export const groupMembers = sqliteTable(
  'group_members',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    jid: text('jid').notNull(),
    role: text('role', { enum: ['member', 'admin', 'super_admin'] })
      .notNull()
      .default('member'),
    joinedAt: optionalTs('joined_at'),
  },
  (t) => ({
    pk: uniqueIndex('group_members_pk').on(t.groupId, t.jid),
  }),
);

// -------------------- media --------------------
export const media = sqliteTable(
  'media',
  {
    id: id(),
    sessionId: text('session_id').notNull(),
    type: text('type', { enum: ['image', 'video', 'audio', 'document', 'sticker'] }).notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    fileName: text('file_name'),
    r2Key: text('r2_key').notNull(),
    width: integer('width'),
    height: integer('height'),
    durationMs: integer('duration_ms'),
    createdAt: ts('created_at'),
  },
  (t) => ({
    sha256Idx: index('media_sha256_idx').on(t.sha256),
    sessionTimeIdx: index('media_session_time_idx').on(t.sessionId, t.createdAt),
  }),
);

// -------------------- messages --------------------
export const messages = sqliteTable(
  'messages',
  {
    id: id(),
    sessionId: text('session_id').notNull(),
    remoteJid: text('remote_jid').notNull(),
    fromMe: integer('from_me', { mode: 'boolean' }).notNull(),
    direction: text('direction', { enum: ['inbound', 'outbound'] }).notNull(),
    type: text('type', {
      enum: [
        'text',
        'image',
        'video',
        'audio',
        'document',
        'sticker',
        'location',
        'contact',
        'contacts_array',
        'reaction',
        'poll',
        'system',
      ],
    }).notNull(),
    status: text('status', {
      enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
    })
      .notNull()
      .default('pending'),
    body: text('body'),
    mediaId: text('media_id').references(() => media.id, { onDelete: 'set null' }),
    caption: text('caption'),
    quotedMessageId: text('quoted_message_id'),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
    timestamp: ts('timestamp'),
    createdAt: ts('created_at'),
  },
  (t) => ({
    sessionJidTimeIdx: index('messages_session_jid_time_idx').on(
      t.sessionId,
      t.remoteJid,
      t.timestamp,
    ),
    sessionTimeIdx: index('messages_session_time_idx').on(t.sessionId, t.timestamp),
    statusIdx: index('messages_status_idx').on(t.status),
  }),
);

// -------------------- labels --------------------
export const labels = sqliteTable(
  'labels',
  {
    id: id(),
    sessionId: text('session_id').notNull(),
    name: text('name').notNull(),
    color: text('color').notNull().default('#1f6feb'),
    createdAt: ts('created_at'),
  },
  (t) => ({
    sessionNameIdx: uniqueIndex('labels_session_name_idx').on(t.sessionId, t.name),
  }),
);

export const labelAssignments = sqliteTable(
  'label_assignments',
  {
    labelId: text('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
    targetType: text('target_type', { enum: ['contact', 'group', 'message'] }).notNull(),
    targetId: text('target_id').notNull(),
    createdAt: ts('created_at'),
  },
  (t) => ({
    pk: uniqueIndex('label_assignments_pk').on(t.labelId, t.targetType, t.targetId),
    targetIdx: index('label_assignments_target_idx').on(t.targetType, t.targetId),
  }),
);

// -------------------- relations --------------------
export const messagesRelations = relations(messages, ({ one }) => ({
  media: one(media, { fields: [messages.mediaId], references: [media.id] }),
}));

export const groupsRelations = relations(groups, ({ many }) => ({
  members: many(groupMembers),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, { fields: [groupMembers.groupId], references: [groups.id] }),
}));

export const labelsRelations = relations(labels, ({ many }) => ({
  assignments: many(labelAssignments),
}));

// -------------------- inferred types --------------------
export type ContactRow = typeof contacts.$inferSelect;
export type NewContactRow = typeof contacts.$inferInsert;
export type GroupRow = typeof groups.$inferSelect;
export type NewGroupRow = typeof groups.$inferInsert;
export type GroupMemberRow = typeof groupMembers.$inferSelect;
export type MediaRow = typeof media.$inferSelect;
export type NewMediaRow = typeof media.$inferInsert;
export type MessageRow = typeof messages.$inferSelect;
export type NewMessageRow = typeof messages.$inferInsert;
export type LabelRow = typeof labels.$inferSelect;
export type LabelAssignmentRow = typeof labelAssignments.$inferSelect;
