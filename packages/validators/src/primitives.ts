import * as v from 'valibot';

export const EmailSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.email('Invalid email address'),
  v.maxLength(254),
);

/** WhatsApp JID: `<id>@(s.whatsapp.net|g.us|broadcast|lid)` */
export const JidSchema = v.pipe(
  v.string(),
  v.regex(/^\d+(-\d+)?@(s\.whatsapp\.net|g\.us|broadcast|lid)$/, 'Invalid WhatsApp JID'),
);

/** Phone in E.164 (digits with optional leading `+`). */
export const PhoneE164Schema = v.pipe(
  v.string(),
  v.regex(/^\+?[1-9]\d{6,14}$/, 'Phone must be in E.164 format'),
);

/** Recipient: either JID or E.164 phone. */
export const RecipientSchema = v.union([JidSchema, PhoneE164Schema]);

export const PasswordSchema = v.pipe(
  v.string(),
  v.minLength(12, 'Password must be at least 12 characters'),
  v.maxLength(128, 'Password too long'),
  v.regex(/[A-Z]/, 'Password must contain an uppercase letter'),
  v.regex(/[a-z]/, 'Password must contain a lowercase letter'),
  v.regex(/[0-9]/, 'Password must contain a digit'),
);

export const SlugSchema = v.pipe(
  v.string(),
  v.regex(
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    'Slug must be lowercase alphanumeric with hyphens',
  ),
  v.maxLength(63),
);

export const HttpsUrlSchema = v.pipe(
  v.string(),
  v.url('Must be a valid URL'),
  v.regex(/^https:\/\//, 'URL must use HTTPS'),
  v.maxLength(2048),
);

export const NonEmptyTextSchema = (max = 1024) =>
  v.pipe(v.string(), v.trim(), v.minLength(1, 'Required'), v.maxLength(max));

export const UuidSchema = v.pipe(v.string(), v.uuid('Invalid UUID'));

export const PaginationSchema = v.object({
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  pageSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200)), 50),
});
