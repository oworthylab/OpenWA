import * as v from 'valibot';
import { HttpsUrlSchema, JidSchema, NonEmptyTextSchema, UuidSchema } from './primitives.js';

const HexColorSchema = v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color'));

export const StatusTextCreateSchema = v.object({
  sessionId: UuidSchema,
  text: v.pipe(v.string(), v.minLength(1), v.maxLength(700)),
  backgroundColor: v.optional(HexColorSchema, '#075E54'),
  font: v.optional(v.picklist(['sans', 'serif', 'mono', 'cursive']), 'sans'),
});
export type StatusTextCreateInput = v.InferInput<typeof StatusTextCreateSchema>;

export const StatusMediaCreateSchema = v.object({
  sessionId: UuidSchema,
  kind: v.picklist(['image', 'video']),
  /** Either an https URL or a pre-uploaded R2 object key. */
  mediaUrl: v.nullish(HttpsUrlSchema),
  mediaKey: v.nullish(NonEmptyTextSchema(256)),
  caption: v.nullish(v.pipe(v.string(), v.maxLength(700))),
});
export type StatusMediaCreateInput = v.InferInput<typeof StatusMediaCreateSchema>;

export const StatusViewSchema = v.object({
  viewerJid: JidSchema,
});

export const StatusQuerySchema = v.object({
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  pageSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)), 50),
  sessionId: v.nullish(UuidSchema),
});
