import * as v from 'valibot';
import { HttpsUrlSchema, NonEmptyTextSchema } from './primitives.js';

/** Plans the API exposes for self-service checkout. */
export const PlanNameSchema = v.picklist(['pro', 'business', 'enterprise']);
export type PlanNameInput = v.InferInput<typeof PlanNameSchema>;

export const CheckoutSchema = v.object({
  plan: PlanNameSchema,
  successUrl: HttpsUrlSchema,
  cancelUrl: HttpsUrlSchema,
});
export type CheckoutInput = v.InferInput<typeof CheckoutSchema>;

export const VerifyEmailSchema = v.object({
  token: NonEmptyTextSchema(2048),
});
export type VerifyEmailInput = v.InferInput<typeof VerifyEmailSchema>;
