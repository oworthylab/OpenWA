import type {
  ApiKeyId,
  ContactId,
  GroupId,
  IsoDateTime,
  LabelId,
  MediaId,
  MessageId,
  PhoneE164,
  SessionId,
  TenantId,
  UserId,
  WebhookId,
  WhatsAppJid,
} from './brand.js';
import type {
  ApiKeyRole,
  ContactType,
  GroupRole,
  MediaType,
  MessageDirection,
  MessageStatus,
  SessionStatus,
  TenantPlan,
  TenantStatus,
  UserRole,
  WebhookEvent,
} from './enums.js';

// ---------------- Identity ----------------
export interface User {
  id: UserId;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailVerifiedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Tenant {
  id: TenantId;
  name: string;
  slug: string;
  plan: TenantPlan;
  status: TenantStatus;
  d1DatabaseId: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface TenantMember {
  tenantId: TenantId;
  userId: UserId;
  role: UserRole;
  joinedAt: IsoDateTime;
}

// ---------------- Sessions ----------------
export interface Session {
  id: SessionId;
  tenantId: TenantId;
  name: string;
  status: SessionStatus;
  phoneNumber: PhoneE164 | null;
  pushName: string | null;
  proxyUrl: string | null;
  lastConnectedAt: IsoDateTime | null;
  lastDisconnectedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

// ---------------- Messages ----------------
export interface MessageBase {
  id: MessageId;
  sessionId: SessionId;
  remoteJid: WhatsAppJid;
  fromMe: boolean;
  direction: MessageDirection;
  status: MessageStatus;
  timestamp: IsoDateTime;
  quotedMessageId: MessageId | null;
}

export interface TextMessage extends MessageBase {
  type: 'text';
  body: string;
}

export interface MediaMessage extends MessageBase {
  type: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  mediaId: MediaId;
  mediaType: MediaType;
  mimeType: string;
  caption: string | null;
  fileName: string | null;
  sizeBytes: number;
}

export interface LocationMessage extends MessageBase {
  type: 'location';
  latitude: number;
  longitude: number;
  name: string | null;
  address: string | null;
}

export interface ContactMessage extends MessageBase {
  type: 'contact';
  contactName: string;
  contactPhone: PhoneE164;
  vcard: string;
}

export interface ReactionMessage extends MessageBase {
  type: 'reaction';
  targetMessageId: MessageId;
  emoji: string;
}

export type Message =
  | TextMessage
  | MediaMessage
  | LocationMessage
  | ContactMessage
  | ReactionMessage;

// ---------------- Contacts & Groups ----------------
export interface Contact {
  id: ContactId;
  sessionId: SessionId;
  jid: WhatsAppJid;
  phoneNumber: PhoneE164 | null;
  type: ContactType;
  pushName: string | null;
  name: string | null;
  notify: string | null;
  isBusiness: boolean;
  isBlocked: boolean;
  profilePictureUrl: string | null;
  updatedAt: IsoDateTime;
}

export interface GroupParticipant {
  jid: WhatsAppJid;
  role: GroupRole;
  joinedAt: IsoDateTime | null;
}

export interface Group {
  id: GroupId;
  sessionId: SessionId;
  jid: WhatsAppJid;
  subject: string;
  description: string | null;
  ownerJid: WhatsAppJid | null;
  participantCount: number;
  isAnnouncementOnly: boolean;
  isRestricted: boolean;
  inviteCode: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Label {
  id: LabelId;
  sessionId: SessionId;
  name: string;
  color: string;
  createdAt: IsoDateTime;
}

// ---------------- Auth / Webhooks / Audit ----------------
export interface ApiKey {
  id: ApiKeyId;
  tenantId: TenantId;
  name: string;
  prefix: string;
  role: ApiKeyRole;
  lastUsedAt: IsoDateTime | null;
  expiresAt: IsoDateTime | null;
  revokedAt: IsoDateTime | null;
  createdByUserId: UserId;
  createdAt: IsoDateTime;
}

export interface Webhook {
  id: WebhookId;
  tenantId: TenantId;
  sessionId: SessionId | null;
  url: string;
  events: WebhookEvent[];
  secret: string;
  active: boolean;
  lastDeliveryAt: IsoDateTime | null;
  lastDeliveryStatus: number | null;
  createdAt: IsoDateTime;
}

export interface AuditLogEntry {
  id: string;
  tenantId: TenantId;
  userId: UserId | null;
  apiKeyId: ApiKeyId | null;
  action: string;
  resourceType: string;
  resourceId: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: IsoDateTime;
}
