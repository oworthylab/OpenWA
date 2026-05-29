import * as v from 'valibot';
import { EmailSchema, NonEmptyTextSchema, PasswordSchema, SlugSchema } from './primitives.js';

export const RegisterSchema = v.object({
  email: EmailSchema,
  password: PasswordSchema,
  name: NonEmptyTextSchema(120),
  tenantName: NonEmptyTextSchema(120),
  tenantSlug: SlugSchema,
});
export type RegisterInput = v.InferInput<typeof RegisterSchema>;

export const LoginSchema = v.object({
  email: EmailSchema,
  password: v.pipe(v.string(), v.minLength(1, 'Password required'), v.maxLength(128)),
});
export type LoginInput = v.InferInput<typeof LoginSchema>;

export const TokenRefreshSchema = v.object({
  refreshToken: v.pipe(v.string(), v.minLength(20)),
});
export type TokenRefreshInput = v.InferInput<typeof TokenRefreshSchema>;

export const ApiKeyCreateSchema = v.object({
  name: NonEmptyTextSchema(80),
  role: v.picklist(['admin', 'read_write', 'read_only']),
  expiresAt: v.nullish(v.pipe(v.string(), v.isoDateTime())),
});
export type ApiKeyCreateInput = v.InferInput<typeof ApiKeyCreateSchema>;
