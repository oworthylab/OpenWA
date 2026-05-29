/**
 * Engine event taxonomy. Adapters emit these via the engine's typed event bus.
 * Mirrors shared {@link OpenWAEvent} where applicable but adds engine-internal
 * lifecycle events that never cross the webhook boundary.
 */

import type { EngineError } from '../errors/index.js';
import type { ConnectionState } from '../state/index.js';

export interface AuthQrEvent {
  type: 'auth.qr';
  qr: string;
  expiresAt: number;
}

export interface AuthPairingCodeEvent {
  type: 'auth.pairing_code';
  code: string;
  expiresAt: number;
}

export interface AuthReadyEvent {
  type: 'auth.ready';
  jid: string;
  pushName?: string;
}

export interface AuthLoggedOutEvent {
  type: 'auth.logged_out';
  reason: string;
}

export interface ConnectionStateEvent {
  type: 'connection.state';
  state: ConnectionState;
  previous: ConnectionState;
}

export interface ConnectionErrorEvent {
  type: 'connection.error';
  error: EngineError;
}

export interface MessageReceivedEvent {
  type: 'message.received';
  /** Raw vendor payload (Baileys WAMessage shape for the Node adapter). */
  payload: unknown;
  /** Normalised fields for cross-adapter consumers. */
  normalised: {
    id: string;
    from: string;
    timestamp: number;
    fromMe: boolean;
  };
}

export interface MessageStatusEvent {
  type: 'message.status';
  id: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'played' | 'failed';
}

export type EngineEvent =
  | AuthQrEvent
  | AuthPairingCodeEvent
  | AuthReadyEvent
  | AuthLoggedOutEvent
  | ConnectionStateEvent
  | ConnectionErrorEvent
  | MessageReceivedEvent
  | MessageStatusEvent;

export type EngineEventType = EngineEvent['type'];

export type EngineEventOf<T extends EngineEventType> = Extract<EngineEvent, { type: T }>;

export type EngineEventHandler<T extends EngineEventType = EngineEventType> = (
  event: EngineEventOf<T>,
) => void | Promise<void>;
