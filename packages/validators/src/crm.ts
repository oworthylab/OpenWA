import * as v from 'valibot';
import {
  EmailSchema,
  NonEmptyTextSchema,
  PaginationSchema,
  PhoneE164Schema,
  UuidSchema,
} from './primitives.js';

const HexColorSchema = v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color'));

// -------------------- contacts --------------------

export const CrmContactCreateSchema = v.object({
  phoneNumber: PhoneE164Schema,
  name: v.nullish(NonEmptyTextSchema(120)),
  email: v.nullish(EmailSchema),
  waJid: v.nullish(v.pipe(v.string(), v.maxLength(120))),
  metadata: v.nullish(v.record(v.string(), v.unknown())),
});
export type CrmContactCreateInput = v.InferInput<typeof CrmContactCreateSchema>;

export const CrmContactUpdateSchema = v.partial(
  v.object({
    name: v.nullable(NonEmptyTextSchema(120)),
    email: v.nullable(EmailSchema),
    waJid: v.nullable(v.pipe(v.string(), v.maxLength(120))),
    metadata: v.nullable(v.record(v.string(), v.unknown())),
  }),
);
export type CrmContactUpdateInput = v.InferInput<typeof CrmContactUpdateSchema>;

export const CrmContactQuerySchema = v.object({
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  pageSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200)), 50),
  tag: v.nullish(NonEmptyTextSchema(80)),
  search: v.nullish(v.pipe(v.string(), v.maxLength(120))),
});

export const CrmContactMergeSchema = v.object({
  sourceId: UuidSchema,
  targetId: UuidSchema,
});
export type CrmContactMergeInput = v.InferInput<typeof CrmContactMergeSchema>;

export const CrmContactImportSchema = v.object({
  /** Raw CSV content. */
  csv: v.pipe(v.string(), v.minLength(1), v.maxLength(5_000_000)),
  /** Optional column → field mapping (defaults to header detection). */
  mapping: v.nullish(
    v.object({
      phoneNumber: v.nullish(NonEmptyTextSchema(80)),
      name: v.nullish(NonEmptyTextSchema(80)),
      email: v.nullish(NonEmptyTextSchema(80)),
    }),
  ),
});
export type CrmContactImportInput = v.InferInput<typeof CrmContactImportSchema>;

// -------------------- tags --------------------

export const CrmTagCreateSchema = v.object({
  name: NonEmptyTextSchema(80),
  color: v.optional(HexColorSchema, '#1f6feb'),
});
export type CrmTagCreateInput = v.InferInput<typeof CrmTagCreateSchema>;

export const CrmContactTagAssignSchema = v.object({
  tagIds: v.pipe(
    v.array(UuidSchema),
    v.minLength(1, 'At least one tag required'),
    v.maxLength(50, 'Too many tags'),
  ),
});

// -------------------- conversations --------------------

export const ConversationStatusSchema = v.picklist(['open', 'pending', 'resolved', 'closed']);

export const ConversationUpdateSchema = v.partial(
  v.object({
    status: ConversationStatusSchema,
    assigneeUserId: v.nullable(UuidSchema),
  }),
);

export const ConversationQuerySchema = v.object({
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  pageSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200)), 50),
  status: v.nullish(ConversationStatusSchema),
  assigneeUserId: v.nullish(UuidSchema),
});

// -------------------- templates --------------------

export const MessageTemplateCreateSchema = v.object({
  name: NonEmptyTextSchema(80),
  body: v.pipe(v.string(), v.minLength(1), v.maxLength(4096)),
});
export type MessageTemplateCreateInput = v.InferInput<typeof MessageTemplateCreateSchema>;

export const MessageTemplateUpdateSchema = v.partial(
  v.object({
    name: NonEmptyTextSchema(80),
    body: v.pipe(v.string(), v.minLength(1), v.maxLength(4096)),
  }),
);

export const TemplateSendSchema = v.object({
  contactId: UuidSchema,
  sessionId: UuidSchema,
  variables: v.optional(v.record(v.string(), v.string()), {}),
});

export { PaginationSchema };
