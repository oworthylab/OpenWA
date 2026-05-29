export const SessionStatus = {
  Pending: 'pending',
  QrRequired: 'qr_required',
  Pairing: 'pairing',
  Connecting: 'connecting',
  Connected: 'connected',
  Disconnected: 'disconnected',
  LoggedOut: 'logged_out',
  Failed: 'failed',
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

export const MessageStatus = {
  Pending: 'pending',
  Sent: 'sent',
  Delivered: 'delivered',
  Read: 'read',
  Failed: 'failed',
} as const;
export type MessageStatus = (typeof MessageStatus)[keyof typeof MessageStatus];

export const MessageDirection = {
  Inbound: 'inbound',
  Outbound: 'outbound',
} as const;
export type MessageDirection = (typeof MessageDirection)[keyof typeof MessageDirection];

export const MessageType = {
  Text: 'text',
  Image: 'image',
  Video: 'video',
  Audio: 'audio',
  Document: 'document',
  Sticker: 'sticker',
  Location: 'location',
  Contact: 'contact',
  ContactsArray: 'contacts_array',
  Reaction: 'reaction',
  Poll: 'poll',
  System: 'system',
} as const;
export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export const MediaType = {
  Image: 'image',
  Video: 'video',
  Audio: 'audio',
  Document: 'document',
  Sticker: 'sticker',
} as const;
export type MediaType = (typeof MediaType)[keyof typeof MediaType];

export const ContactType = {
  Person: 'person',
  Business: 'business',
  Group: 'group',
  Unknown: 'unknown',
} as const;
export type ContactType = (typeof ContactType)[keyof typeof ContactType];

export const GroupRole = {
  Member: 'member',
  Admin: 'admin',
  SuperAdmin: 'super_admin',
} as const;
export type GroupRole = (typeof GroupRole)[keyof typeof GroupRole];

export const TenantPlan = {
  Free: 'free',
  Pro: 'pro',
  Business: 'business',
  Enterprise: 'enterprise',
} as const;
export type TenantPlan = (typeof TenantPlan)[keyof typeof TenantPlan];

export const TenantStatus = {
  Active: 'active',
  Suspended: 'suspended',
  Frozen: 'frozen',
  Deleted: 'deleted',
} as const;
export type TenantStatus = (typeof TenantStatus)[keyof typeof TenantStatus];

export const UserRole = {
  Owner: 'owner',
  Admin: 'admin',
  Developer: 'developer',
  Viewer: 'viewer',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ApiKeyRole = {
  Admin: 'admin',
  ReadWrite: 'read_write',
  ReadOnly: 'read_only',
} as const;
export type ApiKeyRole = (typeof ApiKeyRole)[keyof typeof ApiKeyRole];

export const WebhookEvent = {
  All: '*',
  MessageReceived: 'message.received',
  MessageSent: 'message.sent',
  MessageAck: 'message.ack',
  MessageDeleted: 'message.deleted',
  SessionStatus: 'session.status',
  SessionQr: 'session.qr',
  SessionConnected: 'session.connected',
  SessionDisconnected: 'session.disconnected',
  GroupCreated: 'group.created',
  GroupUpdated: 'group.updated',
  GroupParticipantsChanged: 'group.participants_changed',
  ContactUpdated: 'contact.updated',
} as const;
export type WebhookEvent = (typeof WebhookEvent)[keyof typeof WebhookEvent];

export const AuditAction = {
  TenantCreated: 'tenant.created',
  TenantUpdated: 'tenant.updated',
  UserInvited: 'user.invited',
  UserRemoved: 'user.removed',
  SessionCreated: 'session.created',
  SessionDeleted: 'session.deleted',
  SessionStarted: 'session.started',
  SessionStopped: 'session.stopped',
  ApiKeyCreated: 'api_key.created',
  ApiKeyRevoked: 'api_key.revoked',
  WebhookCreated: 'webhook.created',
  WebhookDeleted: 'webhook.deleted',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
