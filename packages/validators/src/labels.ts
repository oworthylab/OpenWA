import * as v from 'valibot';
import { NonEmptyTextSchema, UuidSchema } from './primitives.js';

const HexColorSchema = v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color'));

export const LabelCreateSchema = v.object({
  name: NonEmptyTextSchema(80),
  color: v.optional(HexColorSchema, '#1f6feb'),
  waLabelId: v.nullish(v.pipe(v.string(), v.maxLength(80))),
});
export type LabelCreateInput = v.InferInput<typeof LabelCreateSchema>;

export const LabelUpdateSchema = v.partial(
  v.object({
    name: NonEmptyTextSchema(80),
    color: HexColorSchema,
    waLabelId: v.nullable(v.pipe(v.string(), v.maxLength(80))),
  }),
);

export const LabelAssignSchema = v.object({
  labelIds: v.pipe(
    v.array(UuidSchema),
    v.minLength(1, 'At least one label required'),
    v.maxLength(50),
  ),
});

export const LabelBulkAssignSchema = v.object({
  contactIds: v.pipe(v.array(UuidSchema), v.minLength(1), v.maxLength(500)),
  labelIds: v.pipe(v.array(UuidSchema), v.minLength(1), v.maxLength(50)),
  action: v.picklist(['assign', 'remove']),
});
export type LabelBulkAssignInput = v.InferInput<typeof LabelBulkAssignSchema>;
