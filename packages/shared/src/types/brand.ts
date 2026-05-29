// Branded ID types for safety across boundaries.
declare const __brand: unique symbol;
export type Brand<T, B> = T & { [__brand]: B };

export type TenantId = Brand<string, 'TenantId'>;
export type UserId = Brand<string, 'UserId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type MessageId = Brand<string, 'MessageId'>;
export type ContactId = Brand<string, 'ContactId'>;
export type GroupId = Brand<string, 'GroupId'>;
export type ApiKeyId = Brand<string, 'ApiKeyId'>;
export type WebhookId = Brand<string, 'WebhookId'>;
export type MediaId = Brand<string, 'MediaId'>;
export type LabelId = Brand<string, 'LabelId'>;

/** WhatsApp JID (e.g. `[email protected]`, `[email protected]`). */
export type WhatsAppJid = Brand<string, 'WhatsAppJid'>;

/** Phone in E.164 (`+62812...`). */
export type PhoneE164 = Brand<string, 'PhoneE164'>;

/** ISO 8601 timestamp. */
export type IsoDateTime = Brand<string, 'IsoDateTime'>;
