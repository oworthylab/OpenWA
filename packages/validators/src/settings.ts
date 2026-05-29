import * as v from 'valibot';
import { EmailSchema, NonEmptyTextSchema } from './primitives.js';

export const SettingsUpdateSchema = v.partial(
  v.object({
    displayName: v.nullable(NonEmptyTextSchema(120)),
    timezone: v.pipe(v.string(), v.maxLength(60)),
    language: v.pipe(v.string(), v.regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Invalid BCP-47 tag')),
    theme: v.picklist(['light', 'dark', 'system']),
    notifyOnIncomingMessage: v.boolean(),
    notifyOnSessionDisconnect: v.boolean(),
    notifyEmail: v.nullable(EmailSchema),
  }),
);
export type SettingsUpdateInput = v.InferInput<typeof SettingsUpdateSchema>;
