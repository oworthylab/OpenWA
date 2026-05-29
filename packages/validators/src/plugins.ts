import * as v from 'valibot';
import { NonEmptyTextSchema } from './primitives.js';

const PluginIdSchema = v.pipe(
  v.string(),
  v.regex(/^[a-z][a-z0-9-]{1,62}$/, 'Plugin id must be lowercase, hyphens allowed'),
);

export const PluginInstallSchema = v.object({
  pluginId: PluginIdSchema,
  enabled: v.optional(v.boolean(), false),
  config: v.nullish(v.record(v.string(), v.unknown())),
});
export type PluginInstallInput = v.InferInput<typeof PluginInstallSchema>;

export const PluginUpdateSchema = v.partial(
  v.object({
    enabled: v.boolean(),
    config: v.nullable(v.record(v.string(), v.unknown())),
  }),
);
export type PluginUpdateInput = v.InferInput<typeof PluginUpdateSchema>;

export { PluginIdSchema, NonEmptyTextSchema };
