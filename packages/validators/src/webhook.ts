import * as v from 'valibot';
import { HttpsUrlSchema, NonEmptyTextSchema, UuidSchema } from './primitives.js';

export const WebhookEventNameSchema = v.union([
  v.literal('*'),
  v.literal('message.received'),
  v.literal('message.sent'),
  v.literal('message.ack'),
  v.literal('message.deleted'),
  v.literal('session.status'),
  v.literal('session.qr'),
  v.literal('session.connected'),
  v.literal('session.disconnected'),
  v.literal('group.created'),
  v.literal('group.updated'),
  v.literal('group.participants_changed'),
  v.literal('contact.updated'),
]);

export const WebhookConfigSchema = v.object({
  sessionId: v.nullish(UuidSchema),
  url: HttpsUrlSchema,
  events: v.pipe(v.array(WebhookEventNameSchema), v.minLength(1, 'At least one event required')),
  secret: v.optional(v.pipe(v.string(), v.minLength(16), v.maxLength(128))),
  active: v.optional(v.boolean(), true),
  description: v.optional(NonEmptyTextSchema(255)),
});
export type WebhookConfigInput = v.InferInput<typeof WebhookConfigSchema>;

export const WebhookPayloadSchema = v.object({
  webhookId: UuidSchema,
  deliveryId: v.string(),
  event: v.string(),
  data: v.unknown(),
  signedAt: v.pipe(v.string(), v.isoDateTime()),
});
export type WebhookPayload = v.InferOutput<typeof WebhookPayloadSchema>;
