import type {
  ContactId,
  GroupId,
  MessageId,
  SessionId,
  WebhookId,
  WhatsAppJid,
} from '../types/brand.js';
import type { Contact, Group, Message, Session } from '../types/entities.js';
import type { SessionStatus, WebhookEvent } from '../types/enums.js';

// --- Discriminated unions for runtime events ---

export interface SessionStatusEvent {
  type: 'session.status';
  sessionId: SessionId;
  status: SessionStatus;
  at: string;
}

export interface SessionQrEvent {
  type: 'session.qr';
  sessionId: SessionId;
  qr: string;
  qrPng: string;
  at: string;
}

export interface SessionConnectedEvent {
  type: 'session.connected';
  sessionId: SessionId;
  session: Session;
  at: string;
}

export interface SessionDisconnectedEvent {
  type: 'session.disconnected';
  sessionId: SessionId;
  reason: string | null;
  at: string;
}

export interface MessageReceivedEvent {
  type: 'message.received';
  sessionId: SessionId;
  message: Message;
  at: string;
}

export interface MessageSentEvent {
  type: 'message.sent';
  sessionId: SessionId;
  message: Message;
  at: string;
}

export interface MessageAckEvent {
  type: 'message.ack';
  sessionId: SessionId;
  messageId: MessageId;
  remoteJid: WhatsAppJid;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  at: string;
}

export interface MessageDeletedEvent {
  type: 'message.deleted';
  sessionId: SessionId;
  messageId: MessageId;
  at: string;
}

export interface GroupCreatedEvent {
  type: 'group.created';
  sessionId: SessionId;
  group: Group;
  at: string;
}

export interface GroupUpdatedEvent {
  type: 'group.updated';
  sessionId: SessionId;
  groupId: GroupId;
  changes: Partial<Group>;
  at: string;
}

export interface GroupParticipantsChangedEvent {
  type: 'group.participants_changed';
  sessionId: SessionId;
  groupId: GroupId;
  action: 'add' | 'remove' | 'promote' | 'demote';
  participants: WhatsAppJid[];
  by: WhatsAppJid | null;
  at: string;
}

export interface ContactUpdatedEvent {
  type: 'contact.updated';
  sessionId: SessionId;
  contactId: ContactId;
  changes: Partial<Contact>;
  at: string;
}

export type OpenWAEvent =
  | SessionStatusEvent
  | SessionQrEvent
  | SessionConnectedEvent
  | SessionDisconnectedEvent
  | MessageReceivedEvent
  | MessageSentEvent
  | MessageAckEvent
  | MessageDeletedEvent
  | GroupCreatedEvent
  | GroupUpdatedEvent
  | GroupParticipantsChangedEvent
  | ContactUpdatedEvent;

// --- Webhook delivery wrapper ---
export interface WebhookPayload<E extends OpenWAEvent = OpenWAEvent> {
  webhookId: WebhookId;
  deliveryId: string;
  event: WebhookEvent;
  data: E;
  signedAt: string;
}
