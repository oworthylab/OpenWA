import * as v from 'valibot';
import { HttpsUrlSchema, NonEmptyTextSchema } from './primitives.js';

export const CreateSessionSchema = v.object({
  name: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, 'Session name required'),
    v.maxLength(64),
    v.regex(/^[a-zA-Z0-9][a-zA-Z0-9 _\-.]*$/, 'Invalid session name'),
  ),
  proxyUrl: v.nullish(HttpsUrlSchema),
});
export type CreateSessionInput = v.InferInput<typeof CreateSessionSchema>;

export const UpdateSessionSchema = v.object({
  name: v.optional(NonEmptyTextSchema(64)),
  proxyUrl: v.nullish(HttpsUrlSchema),
});
export type UpdateSessionInput = v.InferInput<typeof UpdateSessionSchema>;

export const SessionConfigSchema = v.object({
  autoStart: v.optional(v.boolean(), false),
  markOnlineOnConnect: v.optional(v.boolean(), false),
  receiveStatusUpdates: v.optional(v.boolean(), false),
});
export type SessionConfigInput = v.InferInput<typeof SessionConfigSchema>;
