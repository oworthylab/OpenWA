import * as v from 'valibot';
import { HttpsUrlSchema, NonEmptyTextSchema, UuidSchema } from './primitives.js';

// -------------------- store linking --------------------

export const MartLinkSchema = v.object({
  storeUrl: HttpsUrlSchema,
  secret: v.pipe(v.string(), v.minLength(20, 'Mart secret too short'), v.maxLength(256)),
});
export type MartLinkInput = v.InferInput<typeof MartLinkSchema>;

// -------------------- inbound webhook payloads --------------------
// Loosely typed because Mart owns the canonical schema. We validate the
// fields we actually use and pass the rest through `unknown`.

export const MartWebhookEnvelopeSchema = v.object({
  /** Event id; used for idempotency. */
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
  type: v.picklist([
    'order.placed',
    'order.shipped',
    'order.delivered',
    'cart.abandoned',
    'cart.recovered',
    'customer.created',
    'customer.updated',
  ]),
  /** Unix seconds. */
  createdAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
  data: v.record(v.string(), v.unknown()),
});
export type MartWebhookEnvelope = v.InferInput<typeof MartWebhookEnvelopeSchema>;

// -------------------- contact sync --------------------

export const MartSyncTriggerSchema = v.object({
  /** Optional limit on records pulled in a manual resync. */
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1000)), 100),
});

// -------------------- order/cart inner shapes (reference only) --------------------

export const MartOrderSchema = v.object({
  id: NonEmptyTextSchema(80),
  totalCents: v.pipe(v.number(), v.integer(), v.minValue(0)),
  currency: v.pipe(v.string(), v.length(3)),
  customerPhone: v.nullish(v.string()),
  customerName: v.nullish(v.string()),
  trackingUrl: v.nullish(HttpsUrlSchema),
});

export const MartCustomerSchema = v.object({
  id: NonEmptyTextSchema(80),
  phone: v.nullish(v.string()),
  name: v.nullish(v.string()),
  email: v.nullish(v.string()),
});

export { UuidSchema };
