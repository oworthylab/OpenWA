import * as v from 'valibot';
import { JidSchema, NonEmptyTextSchema, PhoneE164Schema } from './primitives.js';

/** WhatsApp group JID specifically (`*@g.us`). */
export const GroupJidSchema = v.pipe(
  v.string(),
  v.regex(/^\d+(-\d+)?@g\.us$/, 'Invalid group JID'),
);

export const CreateGroupSchema = v.object({
  subject: NonEmptyTextSchema(100),
  participants: v.pipe(
    v.array(v.union([JidSchema, PhoneE164Schema])),
    v.minLength(1, 'At least one participant required'),
    v.maxLength(256, 'Group cannot exceed 256 participants'),
  ),
});
export type CreateGroupInput = v.InferInput<typeof CreateGroupSchema>;

export const UpdateGroupSchema = v.object({
  subject: v.optional(NonEmptyTextSchema(100)),
  description: v.optional(v.pipe(v.string(), v.maxLength(512))),
});
export type UpdateGroupInput = v.InferInput<typeof UpdateGroupSchema>;

export const GroupParticipantActionSchema = v.object({
  participants: v.pipe(
    v.array(JidSchema),
    v.minLength(1, 'At least one participant required'),
    v.maxLength(50, 'Max 50 participants per call'),
  ),
  action: v.picklist(['add', 'remove', 'promote', 'demote']),
});
export type GroupParticipantActionInput = v.InferInput<typeof GroupParticipantActionSchema>;
