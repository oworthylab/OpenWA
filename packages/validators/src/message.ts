import * as v from 'valibot';
import { RecipientSchema, UuidSchema } from './primitives.js';

const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

export const SendTextSchema = v.object({
  to: RecipientSchema,
  body: v.pipe(v.string(), v.minLength(1, 'Message body required'), v.maxLength(65_536)),
  quotedMessageId: v.optional(v.string()),
});
export type SendTextInput = v.InferInput<typeof SendTextSchema>;

const Base64Schema = v.pipe(
  v.string(),
  v.regex(/^[A-Za-z0-9+/=]+$/, 'Invalid base64'),
  v.maxLength(((MAX_MEDIA_BYTES * 4) / 3) | 0),
);

const HttpUrlSchema = v.pipe(v.string(), v.url(), v.maxLength(2048));

export const SendMediaSchema = v.pipe(
  v.object({
    to: RecipientSchema,
    type: v.picklist(['image', 'video', 'audio', 'document', 'sticker']),
    url: v.optional(HttpUrlSchema),
    base64: v.optional(Base64Schema),
    mimeType: v.optional(v.pipe(v.string(), v.maxLength(127))),
    caption: v.optional(v.pipe(v.string(), v.maxLength(1024))),
    fileName: v.optional(v.pipe(v.string(), v.maxLength(255))),
  }),
  v.check((m) => Boolean(m.url) !== Boolean(m.base64), 'Provide exactly one of `url` or `base64`'),
);
export type SendMediaInput = v.InferInput<typeof SendMediaSchema>;

export const SendLocationSchema = v.object({
  to: RecipientSchema,
  latitude: v.pipe(v.number(), v.minValue(-90), v.maxValue(90)),
  longitude: v.pipe(v.number(), v.minValue(-180), v.maxValue(180)),
  name: v.optional(v.pipe(v.string(), v.maxLength(200))),
  address: v.optional(v.pipe(v.string(), v.maxLength(500))),
});
export type SendLocationInput = v.InferInput<typeof SendLocationSchema>;

export const SendContactSchema = v.object({
  to: RecipientSchema,
  contactName: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  contactPhone: v.pipe(v.string(), v.regex(/^\+?[1-9]\d{6,14}$/)),
});
export type SendContactInput = v.InferInput<typeof SendContactSchema>;

export const MessageQuerySchema = v.object({
  jid: v.optional(v.string()),
  before: v.optional(v.string()),
  after: v.optional(v.string()),
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200)), 50),
  messageId: v.optional(UuidSchema),
});
export type MessageQueryInput = v.InferInput<typeof MessageQuerySchema>;
