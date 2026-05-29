import * as v from 'valibot';
import { JidSchema, PhoneE164Schema } from './primitives.js';

/** Bulk check that a list of phone numbers exist on WhatsApp. */
export const CheckContactsSchema = v.object({
  phones: v.pipe(
    v.array(PhoneE164Schema),
    v.minLength(1, 'At least one phone required'),
    v.maxLength(50, 'Maximum 50 phones per request'),
  ),
});
export type CheckContactsInput = v.InferInput<typeof CheckContactsSchema>;

export const BlockContactSchema = v.object({ jid: JidSchema });
export type BlockContactInput = v.InferInput<typeof BlockContactSchema>;

export const ContactQuerySchema = v.object({
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  pageSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200)), 50),
  search: v.optional(v.pipe(v.string(), v.maxLength(100))),
});
export type ContactQueryInput = v.InferInput<typeof ContactQuerySchema>;
